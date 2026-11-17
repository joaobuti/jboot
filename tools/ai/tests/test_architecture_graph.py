from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[3]


def load_module():
    path = ROOT / "tools/ai/architecture-graph.py"
    spec = importlib.util.spec_from_file_location("jboot_architecture_graph_test", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


graph = load_module()


class ArchitectureGraphTest(unittest.TestCase):
    def fixture(self, registry: str, module_contract: bool = True) -> Path:
        directory = Path(tempfile.mkdtemp())
        files = {
            "docs/architecture-graph/registry.yaml": registry,
            "docs/ai-architecture.md": "# Architecture\n",
            "implementations/api/PROJECT_CONTRACT.md": "# API\n\nlifecycle_status: functional\n",
            "tools/ai/api-graph.py": "import json; print(json.dumps({'services': [], 'routes': [], 'calls': []}))\n",
        }
        if module_contract:
            files["implementations/api/modules/orders/MODULE_CONTRACT.md"] = "# Orders\n\nlifecycle_status: planned\n"
        for relative, content in files.items():
            target = directory / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(textwrap.dedent(content), encoding="utf-8")
        return directory

    def valid_registry(self) -> str:
        return """
            schema_version: "1.0.0"
            nodes:
              - id: repository:jboot
                type: repository
                label: JBoot
                lifecycle: active
                owner: architecture
                source: docs/ai-architecture.md
            edges: []
        """

    def test_extracts_projects_modules_and_is_deterministic(self):
        repo = self.fixture(self.valid_registry())
        first = graph.build(repo, graph.REGISTRY)
        second = graph.build(repo, graph.REGISTRY)
        self.assertEqual(first, second)
        ids = {node["id"] for node in first["nodes"]}
        self.assertIn("project:api", ids)
        self.assertIn("module:api/orders", ids)
        self.assertEqual(first["summary"]["findings_by_severity"]["error"], 0)

    def test_rejects_dangling_edge(self):
        registry = self.valid_registry() + """
            # appended document content is intentionally invalid for a dangling edge fixture
        """
        registry = registry.replace("edges: []", """
            edges:
              - type: depends_on
                source: repository:jboot
                target: service:missing
                owner: architecture
                evidence: docs/ai-architecture.md
        """)
        document = graph.build(self.fixture(registry), graph.REGISTRY)
        self.assertIn("dangling_edge", {item["kind"] for item in document["findings"]})

    def test_rejects_unknown_node_type(self):
        registry = self.valid_registry().replace("type: repository", "type: imaginary")
        document = graph.build(self.fixture(registry), graph.REGISTRY)
        self.assertIn("invalid_node_type", {item["kind"] for item in document["findings"]})

    def test_context_is_scoped_and_reports_unknown_selector(self):
        document = graph.build(self.fixture(self.valid_registry()), graph.REGISTRY)
        context = graph.neighborhood(document, "project:api", depth=1, limit=20)
        self.assertIsNotNone(context)
        self.assertIn("module:api/orders", {node["id"] for node in context["nodes"]})
        self.assertIsNone(graph.neighborhood(document, "does-not-exist", depth=1, limit=20))

    def test_rejects_implementation_without_contract(self):
        repo = self.fixture(self.valid_registry(), module_contract=False)
        (repo / "implementations/orphan/src").mkdir(parents=True)
        document = graph.build(repo, graph.REGISTRY)
        self.assertIn("implementation_without_contract", {item["kind"] for item in document["findings"]})

    def test_ignores_git_ignored_implementation_directory(self):
        repo = self.fixture(self.valid_registry(), module_contract=False)
        subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
        (repo / ".gitignore").write_text("implementations/local-only/\n", encoding="utf-8")
        (repo / "implementations/local-only/src").mkdir(parents=True)
        (repo / "implementations/orphan/src").mkdir(parents=True)
        document = graph.build(repo, graph.REGISTRY)
        flagged = [item["source"] for item in document["findings"] if item["kind"] == "implementation_without_contract"]
        self.assertEqual(flagged, ["implementations/orphan"])


if __name__ == "__main__":
    unittest.main()
