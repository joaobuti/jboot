from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


governance = load_module("jboot_governance_test", ROOT / "tools/ai/governance.py")
adapter_sync = load_module("jboot_adapter_sync_test", ROOT / "tools/ai/sync-runtime-adapters.py")
diff_preflight = load_module("jboot_diff_preflight_test", ROOT / "tools/ai/diff-preflight.py")


class GovernanceTests(unittest.TestCase):
    def test_repository_is_conformant(self):
        evidence, findings = governance.collect_evidence()
        self.assertTrue(findings.ok, findings.errors)
        self.assertEqual("conformant", evidence["status"])

    def test_all_contexts_match_deterministic_rendering(self):
        outputs = governance.context_outputs()
        self.assertGreater(len(outputs), 0)
        for path, expected in outputs.items():
            self.assertEqual(expected, path.read_text(encoding="utf-8"), path)

    def test_context_digest_changes_with_source(self):
        contracts = governance.active_contracts("PROJECT_CONTRACT.md")
        self.assertGreater(len(contracts), 0)
        original = governance.combined_digest(contracts[:1])
        self.assertEqual(64, len(original))
        self.assertNotEqual(original, governance.sha256_bytes(b"different"))

    def test_contracts_include_project_and_module_lifecycle(self):
        findings = governance.Findings()
        counts = governance.validate_contracts(findings)
        self.assertTrue(findings.ok, findings.errors)
        self.assertGreater(counts["projects"], 0)
        self.assertGreater(counts["modules"], 0)

    def test_metrics_distinguish_legacy_unverified(self):
        findings = governance.Findings()
        profile = governance.load_yaml(governance.PROFILE)
        rows = governance.validate_metrics(profile, findings)
        self.assertTrue(findings.ok, findings.errors)
        self.assertGreater(rows, 0)
        metrics = (ROOT / "docs/ai-governance/metrics/ai-executions.tsv").read_text(encoding="utf-8")
        self.assertIn("legacy_unverified", metrics)

    def test_attestation_resolves_sources_and_approval(self):
        findings = governance.Findings()
        profile = governance.load_yaml(governance.PROFILE)
        count = governance.validate_attestations(profile, findings)
        self.assertTrue(findings.ok, findings.errors)
        self.assertGreater(count, 0)

    def test_generated_adapter_block_matches_profile(self):
        expected = adapter_sync.render()
        self.assertIn("AIF-GOV-001", expected)
        self.assertIn("profile_sha256", expected)
        for target in adapter_sync.TARGETS:
            self.assertIn(expected, target.read_text(encoding="utf-8"), target)

    def test_diff_scope_does_not_accept_prefix_collision(self):
        self.assertTrue(diff_preflight.is_covered("docs/a.md", ["docs"]))
        self.assertFalse(diff_preflight.is_covered("docs-evil/a.md", ["docs"]))

    def test_untrusted_instruction_policy_is_explicit(self):
        threat_model = (ROOT / "docs/ai-governance/security/agentic-threat-model.md").read_text(encoding="utf-8")
        self.assertIn("nunca altera a hierarquia de instrucoes", threat_model)

    def test_runtime_permissions_do_not_print_session_tokens(self):
        settings = (ROOT / "docs/ai-commands/claude-settings-hooks.example.json").read_text(encoding="utf-8")
        self.assertNotIn("accessToken", settings)
        self.assertIn('"allow": []', settings)


if __name__ == "__main__":
    unittest.main()
