#!/usr/bin/env python3
"""Build, validate and query the transversal JBoot architecture graph."""

from __future__ import annotations

import argparse
from collections import Counter, deque
from dataclasses import dataclass, field
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any, Iterable

import yaml


ROOT = Path(__file__).resolve().parents[2]
REGISTRY = Path("docs/architecture-graph/registry.yaml")
OUTPUT = Path("tmp/ai/architecture-graph/graph.json")
VIEWER_DATA = Path("tools/ai/architecture-graph-viewer/public/graph.json")
SCHEMA_VERSION = "1.0.0"
GENERATOR = "tools/ai/architecture-graph.py"
NODE_TYPES = {
    "repository", "project", "module", "product", "application", "service",
    "worker", "integration", "deploy_unit", "capability", "feature", "contract",
    "decision", "sprint", "agent", "skill", "command", "gate", "evidence",
    "data_store", "external_system", "api_endpoint", "tool",
}
EDGE_TYPES = {
    "contains", "part_of", "implements", "depends_on", "calls", "consumes",
    "exposes", "governed_by", "executed_by", "uses_skill", "validated_by",
    "deployed_as", "stores_in", "integrates_with", "decided_by", "planned_in",
    "evidenced_by", "supersedes",
}
LIFECYCLES = {"planned", "active", "deprecated", "retired", "historical", "derived"}
SEVERITY_RANK = {"error": 0, "warning": 1, "info": 2}


@dataclass(frozen=True)
class Node:
    id: str
    type: str
    label: str
    lifecycle: str
    owner: str
    source: str
    provenance: str
    metadata: dict[str, Any] = field(default_factory=dict, compare=False)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "type": self.type, "label": self.label,
            "lifecycle": self.lifecycle, "owner": self.owner, "source": self.source,
            "provenance": self.provenance, "metadata": self.metadata,
        }


@dataclass(frozen=True)
class Edge:
    type: str
    source: str
    target: str
    owner: str
    provenance: str
    evidence: str
    metadata: dict[str, Any] = field(default_factory=dict, compare=False)

    @property
    def id(self) -> str:
        raw = f"{self.type}\0{self.source}\0{self.target}\0{self.evidence}"
        return f"edge:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "type": self.type, "source": self.source,
            "target": self.target, "owner": self.owner, "provenance": self.provenance,
            "evidence": self.evidence, "metadata": self.metadata,
        }


@dataclass(frozen=True)
class Finding:
    severity: str
    kind: str
    message: str
    source: str | None = None
    node_id: str | None = None
    edge_id: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity, "kind": self.kind, "message": self.message,
            "source": self.source, "node_id": self.node_id, "edge_id": self.edge_id,
        }


class GraphBuilder:
    def __init__(self, repo: Path) -> None:
        self.repo = repo
        self.nodes: dict[str, Node] = {}
        self.edges: dict[str, Edge] = {}
        self.findings: list[Finding] = []

    def add_node(self, node: Node) -> None:
        existing = self.nodes.get(node.id)
        if existing and existing != node:
            self.findings.append(Finding(
                "error", "duplicate_node", f"node {node.id} has conflicting definitions",
                node.source, node.id,
            ))
            return
        self.nodes[node.id] = node

    def add_edge(self, edge: Edge) -> None:
        existing = self.edges.get(edge.id)
        if existing and existing != edge:
            self.findings.append(Finding(
                "error", "duplicate_edge", f"edge {edge.id} has conflicting definitions",
                edge.evidence, edge_id=edge.id,
            ))
            return
        self.edges[edge.id] = edge

    def error(self, kind: str, message: str, source: str | None = None) -> None:
        self.findings.append(Finding("error", kind, message, source))


def git_ignored(repo: Path, path: Path) -> bool:
    """Local-only directory excluded by .gitignore (e.g. vendored templates); not part of the versioned architecture."""
    result = subprocess.run(
        ["git", "check-ignore", "-q", str(path.relative_to(repo))],
        cwd=repo, capture_output=True, text=True,
    )
    return result.returncode == 0


def rel(repo: Path, path: Path) -> str:
    return path.relative_to(repo).as_posix()


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def title_from_markdown(path: Path) -> str:
    match = re.search(r"^#\s+(.+?)\s*$", path.read_text(encoding="utf-8", errors="replace"), re.M)
    return match.group(1).strip() if match else path.stem.replace("-", " ").title()


def lifecycle_from_contract(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"(?m)^lifecycle_status:\s*([^\s#]+)", text)
    if not match:
        return "active"
    value = match.group(1).strip("'\"").lower()
    return {
        "planned": "planned", "foundation": "active", "functional": "active",
        "production_ready": "active", "deprecated": "deprecated", "retired": "retired",
    }.get(value, "active")


def inferred_owner(relative: str) -> str:
    parts = Path(relative).parts
    if parts and parts[0] == "implementations" and len(parts) > 1:
        if "modules" in parts:
            index = parts.index("modules")
            if index + 1 < len(parts):
                return f"module-contract:{parts[1]}/{parts[index + 1]}"
        return f"project-contract:{parts[1]}"
    if relative.startswith("docs/skills/"):
        return "ai-governance"
    return "ai-architecture"


def load_registry(builder: GraphBuilder, path: Path) -> None:
    if not path.is_file():
        builder.error("missing_registry", f"registry not found: {rel(builder.repo, path)}")
        return
    relative = rel(builder.repo, path)
    document = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if document.get("schema_version") != SCHEMA_VERSION:
        builder.error("invalid_registry_schema", f"expected registry schema {SCHEMA_VERSION}", relative)
    for raw in document.get("nodes", []) or []:
        try:
            builder.add_node(Node(
                id=str(raw["id"]), type=str(raw["type"]), label=str(raw["label"]),
                lifecycle=str(raw["lifecycle"]), owner=str(raw["owner"]),
                source=str(raw["source"]), provenance="registry",
                metadata=dict(raw.get("metadata") or {}),
            ))
        except (KeyError, TypeError, ValueError) as exc:
            builder.error("invalid_registry_node", f"invalid node: {exc}", relative)
    for raw in document.get("edges", []) or []:
        try:
            builder.add_edge(Edge(
                type=str(raw["type"]), source=str(raw["source"]), target=str(raw["target"]),
                owner=str(raw["owner"]), provenance="registry", evidence=str(raw["evidence"]),
                metadata=dict(raw.get("metadata") or {}),
            ))
        except (KeyError, TypeError, ValueError) as exc:
            builder.error("invalid_registry_edge", f"invalid edge: {exc}", relative)


def extract_contracts(builder: GraphBuilder) -> None:
    root_id = "repository:jboot"
    for contract in sorted((builder.repo / "implementations").glob("*/PROJECT_CONTRACT.md")):
        project = contract.parent.name
        relative = rel(builder.repo, contract)
        node_id = f"project:{project}"
        builder.add_node(Node(
            node_id, "project", project, lifecycle_from_contract(contract),
            f"project-contract:{project}", relative, "contract",
            {"contract": relative, "path": f"implementations/{project}"},
        ))
        builder.add_edge(Edge("contains", root_id, node_id, "ai-architecture", "repository", relative))
    for contract in sorted((builder.repo / "implementations").glob("*/modules/*/MODULE_CONTRACT.md")):
        project = contract.parents[2].name
        module = contract.parent.name
        relative = rel(builder.repo, contract)
        node_id = f"module:{project}/{module}"
        project_id = f"project:{project}"
        builder.add_node(Node(
            node_id, "module", module, lifecycle_from_contract(contract),
            f"module-contract:{project}/{module}", relative, "contract",
            {"contract": relative, "project": project, "path": rel(builder.repo, contract.parent)},
        ))
        builder.add_edge(Edge("contains", project_id, node_id, f"project-contract:{project}", "contract", relative))


def extract_agents_and_skills(builder: GraphBuilder) -> None:
    roots = [builder.repo / "docs/agents", builder.repo / "docs/skills", builder.repo / "implementations"]
    seen: set[Path] = set()
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.md")):
            if path in seen or path.name in {"README.md", "AI_CONTEXT.md", "PROJECT_CONTRACT.md", "MODULE_CONTRACT.md"}:
                continue
            kind = "agent" if "agents" in path.parts else "skill" if "skills" in path.parts else None
            if not kind:
                continue
            seen.add(path)
            relative = rel(builder.repo, path)
            node_id = f"{kind}:{relative.removesuffix('.md')}"
            builder.add_node(Node(
                node_id, kind, title_from_markdown(path), "active", inferred_owner(relative),
                relative, "repository", {"path": relative},
            ))
            parts = path.parts
            if "implementations" in parts:
                project = parts[parts.index("implementations") + 1]
                if "modules" in parts:
                    index = parts.index("modules")
                    parent = f"module:{project}/{parts[index + 1]}"
                else:
                    parent = f"project:{project}"
                builder.add_edge(Edge("contains", parent, node_id, inferred_owner(relative), "repository", relative))


def extract_records(builder: GraphBuilder) -> None:
    decisions = builder.repo / "docs/ai-governance/records/decisions"
    for path in sorted(decisions.glob("*.md")):
        if path.name == "README.md":
            continue
        relative = rel(builder.repo, path)
        node_id = f"decision:{path.stem}"
        builder.add_node(Node(node_id, "decision", title_from_markdown(path), "historical", "ai-architecture", relative, "repository"))
        builder.add_edge(Edge("contains", "repository:jboot", node_id, "ai-architecture", "repository", relative))
    for path in sorted((builder.repo / "docs/product").glob("*.md")):
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in re.finditer(r"(?m)^##\s+(Sprint\s+[^\n]+)", text):
            heading = match.group(1).strip()
            relative = rel(builder.repo, path)
            node_id = f"sprint:{path.stem}/{slug(heading)}"
            tail = text[match.end():match.end() + 500]
            lifecycle = "active" if re.search(r"(?i)(em andamento|in.progress)", tail) else "historical" if re.search(r"(?i)conclu[ií]da", tail) else "planned"
            builder.add_node(Node(node_id, "sprint", heading, lifecycle, "product-engineering", relative, "repository", {"heading": heading}))
            builder.add_edge(Edge("contains", "repository:jboot", node_id, "product-engineering", "repository", relative))
    for path in sorted((builder.repo / "docs/ai-governance/attestations").glob("*.yaml")):
        if path.name == "README.md":
            continue
        relative = rel(builder.repo, path)
        builder.add_node(Node(
            f"evidence:{path.stem}", "evidence", path.stem, "historical",
            "ai-governance", relative, "repository",
        ))


def api_graph_document(repo: Path) -> dict[str, Any] | None:
    command = [sys.executable, str(repo / "tools/ai/api-graph.py"), "--root", str(repo), "--output", "-", "--fail-on", "none"]
    result = subprocess.run(command, cwd=repo, capture_output=True, text=True)
    if result.returncode not in (0, 1):
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def extract_api_graph(builder: GraphBuilder) -> None:
    document = api_graph_document(builder.repo)
    if document is None:
        builder.error("api_graph_unavailable", "could not generate API Contract Graph", "tools/ai/api-graph.py")
        return
    project_by_root = {
        node.metadata.get("path"): node.id
        for node in builder.nodes.values() if node.type == "project" and node.metadata.get("path")
    }
    for row in document.get("services", []):
        service_id = f"service:{row['id']}"
        builder.add_node(Node(
            service_id, "service", row["id"], "derived", "api-contract-graph",
            "tools/ai/api-graph.yaml", "api-contract-graph", dict(row),
        ))
        project_id = project_by_root.get(row.get("root"))
        if project_id:
            builder.add_edge(Edge("implements", project_id, service_id, "api-contract-graph", "api-contract-graph", "tools/ai/api-graph.yaml"))
    endpoint_ids: dict[tuple[str, str, str], str] = {}
    for route in document.get("routes", []):
        key = (route["service"], route["method"], route["path"])
        endpoint_id = f"api_endpoint:{route['service']}:{route['method']}:{route['path']}"
        endpoint_ids[key] = endpoint_id
        builder.add_node(Node(
            endpoint_id, "api_endpoint", f"{route['method']} {route['path']}", "derived",
            "api-contract-graph", route["file"], "api-contract-graph", dict(route),
        ))
        builder.add_edge(Edge("exposes", f"service:{route['service']}", endpoint_id, "api-contract-graph", "api-contract-graph", route["file"]))
    for call in document.get("calls", []):
        route = call.get("route")
        if not route:
            continue
        endpoint_id = endpoint_ids.get((route["service"], route["method"], route["path"]))
        consumer_id = f"service:{call['consumer']}"
        if consumer_id not in builder.nodes:
            builder.add_node(Node(
                consumer_id, "service", call["consumer"], "derived", "api-contract-graph",
                call["file"], "api-contract-graph", {"consumer_only": True},
            ))
        if endpoint_id:
            builder.add_edge(Edge("calls", consumer_id, endpoint_id, "api-contract-graph", "api-contract-graph", call["file"], {"line": call["line"]}))


def validate(builder: GraphBuilder) -> None:
    for node in list(builder.nodes.values()):
        if not re.match(r"^[a-z][a-z0-9_-]*:.+", node.id):
            builder.findings.append(Finding("error", "invalid_node_id", f"invalid node id {node.id}", node.source, node.id))
        if node.type not in NODE_TYPES:
            builder.findings.append(Finding("error", "invalid_node_type", f"unsupported node type {node.type}", node.source, node.id))
        if node.lifecycle not in LIFECYCLES:
            builder.findings.append(Finding("error", "invalid_lifecycle", f"unsupported lifecycle {node.lifecycle}", node.source, node.id))
        if not node.owner.strip():
            builder.findings.append(Finding("error", "missing_owner", f"node {node.id} has no owner", node.source, node.id))
        if not (builder.repo / node.source).exists():
            builder.findings.append(Finding("error", "missing_source", f"node source does not exist: {node.source}", node.source, node.id))
    for edge in list(builder.edges.values()):
        if edge.type not in EDGE_TYPES:
            builder.findings.append(Finding("error", "invalid_edge_type", f"unsupported edge type {edge.type}", edge.evidence, edge_id=edge.id))
        if edge.source not in builder.nodes or edge.target not in builder.nodes:
            missing = edge.source if edge.source not in builder.nodes else edge.target
            builder.findings.append(Finding("error", "dangling_edge", f"edge {edge.id} references missing node {missing}", edge.evidence, edge_id=edge.id))
        if not (builder.repo / edge.evidence).exists():
            builder.findings.append(Finding("error", "missing_evidence", f"edge evidence does not exist: {edge.evidence}", edge.evidence, edge_id=edge.id))
    for contract in sorted((builder.repo / "implementations").glob("*/PROJECT_CONTRACT.md")):
        expected = f"project:{contract.parent.name}"
        if expected not in builder.nodes:
            builder.findings.append(Finding("error", "unregistered_project", f"project contract has no node: {expected}", rel(builder.repo, contract), expected))
    for implementation in sorted((builder.repo / "implementations").iterdir()):
        if (
            implementation.is_dir()
            and not (implementation / "PROJECT_CONTRACT.md").is_file()
            and not git_ignored(builder.repo, implementation)
        ):
            builder.findings.append(Finding(
                "error", "implementation_without_contract",
                f"implementation directory has no PROJECT_CONTRACT.md and cannot be graphed: {rel(builder.repo, implementation)}",
                rel(builder.repo, implementation),
            ))
    for contract in sorted((builder.repo / "implementations").glob("*/modules/*/MODULE_CONTRACT.md")):
        expected = f"module:{contract.parents[2].name}/{contract.parent.name}"
        if expected not in builder.nodes:
            builder.findings.append(Finding("error", "unregistered_module", f"module contract has no node: {expected}", rel(builder.repo, contract), expected))


def build(repo: Path, registry: Path) -> dict[str, Any]:
    builder = GraphBuilder(repo)
    load_registry(builder, repo / registry)
    extract_contracts(builder)
    extract_agents_and_skills(builder)
    extract_records(builder)
    extract_api_graph(builder)
    validate(builder)
    nodes = [node.as_dict() for node in sorted(builder.nodes.values(), key=lambda item: item.id)]
    edges = [edge.as_dict() for edge in sorted(builder.edges.values(), key=lambda item: item.id)]
    findings = [finding.as_dict() for finding in sorted(builder.findings, key=lambda item: (SEVERITY_RANK[item.severity], item.kind, item.source or "", item.message))]
    node_types = Counter(node["type"] for node in nodes)
    edge_types = Counter(edge["type"] for edge in edges)
    severity = Counter(item["severity"] for item in findings)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": "deterministic",
        "generator": GENERATOR,
        "summary": {
            "nodes": len(nodes), "edges": len(edges), "findings": len(findings),
            "nodes_by_type": dict(sorted(node_types.items())),
            "edges_by_type": dict(sorted(edge_types.items())),
            "findings_by_severity": {key: severity.get(key, 0) for key in ("error", "warning", "info")},
        },
        "nodes": nodes,
        "edges": edges,
        "findings": findings,
    }


def write_json(repo: Path, path: Path, document: dict[str, Any]) -> None:
    target = path if path.is_absolute() else repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(document, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def find_node(document: dict[str, Any], selector: str) -> dict[str, Any] | None:
    exact = next((node for node in document["nodes"] if node["id"] == selector), None)
    if exact:
        return exact
    matches = [node for node in document["nodes"] if selector.lower() in node["id"].lower() or selector.lower() in node["label"].lower()]
    return matches[0] if len(matches) == 1 else None


def neighborhood(document: dict[str, Any], selector: str, depth: int, limit: int) -> dict[str, Any] | None:
    origin = find_node(document, selector)
    if not origin:
        return None
    by_id = {node["id"]: node for node in document["nodes"]}
    adjacency: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for edge in document["edges"]:
        adjacency.setdefault(edge["source"], []).append((edge["target"], edge))
        adjacency.setdefault(edge["target"], []).append((edge["source"], edge))
    seen = {origin["id"]}
    queue = deque([(origin["id"], 0)])
    edge_ids: set[str] = set()
    truncated = False
    while queue:
        current, level = queue.popleft()
        if level >= depth:
            continue
        for neighbor, edge in sorted(adjacency.get(current, []), key=lambda item: item[1]["id"]):
            edge_ids.add(edge["id"])
            if neighbor not in seen:
                if len(seen) >= limit:
                    truncated = True
                    continue
                seen.add(neighbor)
                queue.append((neighbor, level + 1))
    return {
        "origin": origin["id"], "depth": depth, "limit": limit, "truncated": truncated,
        "nodes": [by_id[item] for item in sorted(seen)],
        "edges": [edge for edge in document["edges"] if edge["id"] in edge_ids and edge["source"] in seen and edge["target"] in seen],
    }


def render_report(document: dict[str, Any], artifact: str | None = None) -> str:
    summary = document["summary"]
    lines = [
        f"Architecture graph (schema {document['schema_version']})",
        f"Nodes: {summary['nodes']} | Edges: {summary['edges']} | Findings: {summary['findings']}",
        "Node types: " + ", ".join(f"{key}={value}" for key, value in summary["nodes_by_type"].items()),
    ]
    for finding in document["findings"]:
        lines.append(f"  {finding['severity'].upper():<7} {finding['kind']}: {finding['message']}")
    if artifact:
        lines.append(f"Artifact: {artifact}")
    return "\n".join(lines) + "\n"


def render_neighborhood(result: dict[str, Any]) -> str:
    lines = [
        f"Architecture graph context: {result['origin']}",
        f"Depth: {result['depth']} | Nodes: {len(result['nodes'])} | Edges: {len(result['edges'])} | Truncated: {str(result['truncated']).lower()}",
        "",
        "Nodes:",
    ]
    for node in result["nodes"]:
        lines.append(f"  {node['id']}  [{node['type']}/{node['lifecycle']}]  {node['source']}")
    lines.extend(["", "Edges:"])
    for edge in result["edges"]:
        lines.append(f"  {edge['source']} -[{edge['type']}]-> {edge['target']}  ({edge['evidence']})")
    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--registry", type=Path, default=REGISTRY)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--fail-on", choices=("none", "error", "warning"), default="none")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--context", metavar="NODE")
    parser.add_argument("--impact", metavar="NODE")
    parser.add_argument("--depth", type=int, default=2)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--viewer-data", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = args.root.resolve()
    document = build(repo, args.registry)
    if args.context or args.impact:
        result = neighborhood(document, args.context or args.impact, args.depth, args.limit)
        if result is None:
            print(f"unknown or ambiguous node selector: {args.context or args.impact}", file=sys.stderr)
            return 2
        print(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True) if args.format == "json" else render_neighborhood(result), end="" if args.format == "text" else "\n")
    else:
        write_json(repo, args.output, document)
        if args.viewer_data:
            write_json(repo, VIEWER_DATA, document)
        if args.format == "json":
            print(json.dumps(document, indent=2, ensure_ascii=False, sort_keys=True))
        else:
            print(render_report(document, rel(repo, repo / args.output) if not args.output.is_absolute() else str(args.output)), end="")
    threshold = {"none": -1, "warning": 1, "error": 0}[args.fail_on]
    if threshold >= 0 and any(SEVERITY_RANK[item["severity"]] <= threshold for item in document["findings"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
