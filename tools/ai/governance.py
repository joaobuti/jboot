#!/usr/bin/env python3
"""Executable AI-first governance contract for JBoot.

The JSON Schema is the interoperable contract. This module deliberately keeps
the repository validator small and dependency-light: PyYAML is the only runtime
dependency, and semantic checks cover repository references and invariants that
JSON Schema alone cannot express.
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any, Iterable

try:
    import yaml
except ImportError as exc:  # pragma: no cover - environment failure
    raise SystemExit(
        "PyYAML is required; install tools/ai/requirements.txt in the execution runtime"
    ) from exc


ROOT = Path(__file__).resolve().parents[2]
PROFILE = ROOT / "docs/ai-governance/conformance/ai-first.yaml"
PROFILE_SCHEMA = ROOT / "docs/ai-governance/schemas/ai-first.schema.json"
ATTESTATION_SCHEMA = ROOT / "docs/ai-governance/schemas/execution-attestation.schema.json"
EVIDENCE_JSON = ROOT / "docs/ai-governance/evidence/ai-first-evidence.json"
EVIDENCE_MD = ROOT / "docs/ai-governance/evidence/AI_FIRST_EVIDENCE.md"
VALID_LIFECYCLE = {
    "planned",
    "scaffolded",
    "in_progress",
    "functional",
    "production_ready",
    "deprecated",
}
VALID_READINESS = {"not_assessed", "blocked", "ready"}


class Findings:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    @property
    def ok(self) -> bool:
        return not self.errors


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = yaml.safe_load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{relative(path)} must contain a YAML object")
    return value


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def combined_digest(paths: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(relative(path).encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def active_contracts(name: str) -> list[Path]:
    matches: list[Path] = []
    for directory, dirnames, filenames in os.walk(ROOT / "implementations"):
        dirnames[:] = [item for item in dirnames if item not in {"node_modules", "legacy-reference", ".next"}]
        if name in filenames:
            matches.append(Path(directory) / name)
    return sorted(matches)


def markdown_artifacts() -> list[Path]:
    roots = [ROOT / "docs/agents", ROOT / "docs/skills", ROOT / "implementations"]
    files: list[Path] = []
    for base in roots:
        for directory, dirnames, filenames in os.walk(base):
            dirnames[:] = [item for item in dirnames if item not in {"node_modules", "legacy-reference", ".next"}]
            for filename in filenames:
                if not filename.endswith(".md"):
                    continue
                path = Path(directory) / filename
                rel = relative(path)
                if "/agents/" in f"/{rel}" or "/skills/" in f"/{rel}":
                    files.append(path)
    return sorted(set(files))


def extract_scalar(text: str, key: str) -> str | None:
    prefix = f"{key}:"
    for line in text.splitlines():
        if line.startswith(prefix):
            return line[len(prefix) :].strip()
    return None


def validate_profile(profile: dict[str, Any], findings: Findings) -> None:
    required = {
        "schema_version",
        "profile_id",
        "profile_version",
        "status",
        "owner",
        "last_review",
        "review_due",
        "claims",
        "scope",
        "thresholds",
        "measurement_policy",
        "artifact_governance",
        "required_controls",
        "runtime_adapters",
        "references",
    }
    missing = sorted(required - profile.keys())
    if missing:
        findings.error(f"profile missing required keys: {', '.join(missing)}")
    if profile.get("status") not in {"draft", "candidate", "conformant", "nonconformant"}:
        findings.error("profile status is invalid")

    controls = profile.get("required_controls", [])
    ids = [item.get("id") for item in controls if isinstance(item, dict)]
    if len(ids) != len(set(ids)):
        findings.error("required control IDs must be unique")
    for item in controls:
        if not isinstance(item, dict) or not {"id", "title", "blocking"} <= item.keys():
            findings.error("every required control needs id, title and blocking")

    today = dt.date.today()
    try:
        review_due = dt.date.fromisoformat(str(profile.get("review_due")))
        if review_due < today:
            findings.error(f"AI-first profile review expired on {review_due}")
    except ValueError:
        findings.error("profile review_due must use YYYY-MM-DD")

    claims = profile.get("claims", {})
    engineering = claims.get("engineering", {}) if isinstance(claims, dict) else {}
    runtime = claims.get("product_runtime", {}) if isinstance(claims, dict) else {}
    if engineering.get("status") == "conformant" and profile.get("status") != "conformant":
        findings.error("engineering claim cannot be conformant while profile is not conformant")
    if runtime.get("status") != "planned":
        findings.error("product runtime must remain planned until src/ai activation gate is completed")


def validate_contracts(findings: Findings) -> dict[str, int]:
    counters = {"projects": 0, "modules": 0}
    for contract_type, name in (("project", "PROJECT_CONTRACT.md"), ("module", "MODULE_CONTRACT.md")):
        contracts = active_contracts(name)
        counters[f"{contract_type}s"] = len(contracts)
        for path in contracts:
            text = path.read_text(encoding="utf-8")
            values = {
                key: extract_scalar(text, key)
                for key in (
                    "lifecycle_status",
                    "production_readiness",
                    "status_evidence",
                    "last_status_review",
                )
            }
            missing = [key for key, value in values.items() if not value]
            if missing:
                findings.error(f"{relative(path)} missing lifecycle fields: {', '.join(missing)}")
                continue
            if values["lifecycle_status"] not in VALID_LIFECYCLE:
                findings.error(f"{relative(path)} has invalid lifecycle_status")
            if values["production_readiness"] not in VALID_READINESS:
                findings.error(f"{relative(path)} has invalid production_readiness")
            try:
                dt.date.fromisoformat(values["last_status_review"] or "")
            except ValueError:
                findings.error(f"{relative(path)} has invalid last_status_review")
    return counters


def list_local_markdown(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(path for path in directory.rglob("*.md") if "legacy-reference" not in path.parts)


def bullet_paths(paths: list[Path], empty: str) -> list[str]:
    return [f"- `{relative(path)}`" for path in paths] or [f"- {empty}"]


def render_project_context(contract: Path) -> str:
    project = contract.parent
    module_contracts = sorted(
        path
        for path in (project / "modules").rglob("MODULE_CONTRACT.md")
        if "legacy-reference" not in path.parts
    ) if (project / "modules").is_dir() else []
    sources = [contract, *module_contracts]
    agents = list_local_markdown(project / "agents")
    skills = list_local_markdown(project / "skills")
    lines = [
        f"# AI Context: {project.name}",
        "",
        "<!-- generated: tools/ai/governance.py; do not edit manually -->",
        "",
        "```yaml",
        'context_schema_version: "1.0.0"',
        f"source_sha256: {combined_digest([*sources, *agents, *skills])}",
        f"target_project: {relative(project)}",
        "```",
        "",
        "## Fonte De Verdade",
        "",
        *bullet_paths(sources, "Nenhuma fonte declarada."),
        "",
        "## Agents Locais",
        "",
        *bullet_paths(agents, "Nenhum agent local declarado."),
        "",
        "## Skills Locais",
        "",
        *bullet_paths(skills, "Nenhuma skill local declarada."),
        "",
        "## Regras Minimas",
        "",
        "- Ler os contratos acima antes de codigo funcional.",
        "- Declarar `Agent Activation` com target, agents e skills reais.",
        "- Respeitar fronteiras e executar as validacoes contratadas.",
        "- Registrar riscos, falhas, decisoes e proveniencia aplicaveis.",
        "",
    ]
    return "\n".join(lines)


def render_module_context(contract: Path) -> str:
    module = contract.parent
    project = Path(str(module).split(f"{os.sep}modules{os.sep}", 1)[0])
    project_contract = project / "PROJECT_CONTRACT.md"
    sources = [project_contract, contract]
    agents = list_local_markdown(module / "agents")
    skills = list_local_markdown(module / "skills")
    lines = [
        f"# AI Context: module {module.name}",
        "",
        "<!-- generated: tools/ai/governance.py; do not edit manually -->",
        "",
        "```yaml",
        'context_schema_version: "1.0.0"',
        f"source_sha256: {combined_digest([*sources, *agents, *skills])}",
        f"target_project: {relative(project)}",
        f"target_module: modules/{module.name}",
        "```",
        "",
        "## Fonte De Verdade",
        "",
        *bullet_paths(sources, "Nenhuma fonte declarada."),
        "",
        "## Agents Do Modulo",
        "",
        *bullet_paths(agents, "Nenhum agent local declarado."),
        "",
        "## Skills Do Modulo",
        "",
        *bullet_paths(skills, "Nenhuma skill local declarada."),
        "",
        "## Regras Minimas",
        "",
        "- Usar o contrato do projeto e deste modulo.",
        "- Respeitar fronteiras e ativar apenas agents/skills pertinentes.",
        "- Registrar gate, validacoes, proveniencia e nao conformidades.",
        "",
    ]
    return "\n".join(lines)


def context_outputs() -> dict[Path, str]:
    outputs: dict[Path, str] = {}
    for contract in active_contracts("PROJECT_CONTRACT.md"):
        outputs[contract.parent / "AI_CONTEXT.md"] = render_project_context(contract)
    for contract in active_contracts("MODULE_CONTRACT.md"):
        outputs[contract.parent / "AI_CONTEXT.md"] = render_module_context(contract)
    return outputs


def generate_contexts() -> int:
    changed = 0
    for output, content in context_outputs().items():
        current = output.read_text(encoding="utf-8") if output.exists() else None
        if current != content:
            output.write_text(content, encoding="utf-8", newline="\n")
            changed += 1
            print(f"updated {relative(output)}")
    print(f"AI_CONTEXT generation ok; changed={changed}")
    return 0


def validate_contexts(findings: Findings) -> int:
    fresh = 0
    for output, expected in context_outputs().items():
        if not output.exists():
            findings.error(f"missing generated context {relative(output)}")
        elif output.read_text(encoding="utf-8") != expected:
            findings.error(f"stale generated context {relative(output)}; run make ai-context")
        else:
            fresh += 1
    return fresh


def validate_artifact_ownership(profile: dict[str, Any], findings: Findings) -> int:
    rules = profile.get("artifact_governance", {}).get("ownership_rules", [])
    covered = 0
    for path in markdown_artifacts():
        rel = relative(path)
        matches = [rule for rule in rules if fnmatch.fnmatch(rel, rule.get("pattern", ""))]
        if not matches:
            findings.error(f"agent/skill lacks ownership rule: {rel}")
        elif not all(rule.get("owner") for rule in matches):
            findings.error(f"agent/skill ownership rule lacks owner: {rel}")
        else:
            covered += 1
    return covered


def validate_adapters(profile: dict[str, Any], findings: Findings) -> int:
    controls = [item["id"] for item in profile.get("required_controls", []) if item.get("blocking")]
    valid = 0
    for adapter in profile.get("runtime_adapters", []):
        path = ROOT / adapter.get("path", "")
        if not path.is_file():
            findings.error(f"missing runtime adapter {relative(path)}")
            continue
        text = path.read_text(encoding="utf-8")
        missing = [control for control in controls if control not in text]
        if missing:
            findings.error(f"{relative(path)} missing controls: {', '.join(missing)}")
        else:
            valid += 1
    return valid


def validate_nonconformities(findings: Findings) -> dict[str, int]:
    result = {"nonconformities_total": 0, "open_high_critical_nonconformities": 0}
    base = ROOT / "docs/ai-governance/records/non-conformities"
    for path in sorted(base.glob("*.md")):
        if path.name == "README.md":
            continue
        result["nonconformities_total"] += 1
        text = path.read_text(encoding="utf-8")
        severity = extract_scalar(text, "severity")
        status = extract_scalar(text, "status")
        owner = extract_scalar(text, "owner")
        regression = extract_scalar(text, "regression_test")
        if not owner:
            findings.error(f"{relative(path)} missing owner")
        if status == "corrected" and not regression:
            findings.error(f"{relative(path)} corrected without regression_test")
        if status == "open" and severity in {"high", "critical"}:
            result["open_high_critical_nonconformities"] += 1
            findings.error(f"open {severity} non-conformity: {relative(path)}")
    return result


def validate_metrics(profile: dict[str, Any], findings: Findings) -> int:
    path = ROOT / "docs/ai-governance/metrics/ai-executions.tsv"
    if not path.is_file():
        findings.error("missing execution metrics")
        return 0
    rows = path.read_text(encoding="utf-8").splitlines()
    if not rows:
        findings.error("execution metrics is empty")
        return 0
    header = rows[0].split("\t")
    required = {
        "measurement_status", "execution_id", "revision", "runtime", "model",
        "prompt_tokens", "completion_tokens", "total_tokens", "estimated_cost", "latency_ms",
    }
    missing = required - set(header)
    if missing:
        findings.error(f"metrics header missing: {', '.join(sorted(missing))}")
        return 0
    indexes = {name: header.index(name) for name in required}
    allowed = set(profile.get("measurement_policy", {}).get("allowed_statuses", []))
    valid = 0
    for line_number, line in enumerate(rows[1:], start=2):
        if not line.strip():
            continue
        values = line.split("\t")
        if len(values) != len(header):
            findings.error(f"metrics line {line_number} has {len(values)} columns; expected {len(header)}")
            continue
        status = values[indexes["measurement_status"]]
        if status not in allowed:
            findings.error(f"metrics line {line_number} has invalid measurement_status {status!r}")
            continue
        measurement_values = [
            values[header.index(name)]
            for name in ("prompt_tokens", "completion_tokens", "total_tokens", "estimated_cost", "latency_ms")
        ]
        if status == "measured" and any(value == "" for value in measurement_values):
            findings.error(f"metrics line {line_number} measured status requires values")
            continue
        if status not in {"measured", "legacy_unverified"} and any(value != "" for value in measurement_values):
            findings.error(f"metrics line {line_number} unavailable measurements must be empty")
            continue
        valid += 1
    return valid


def validate_attestations(profile: dict[str, Any], findings: Findings) -> int:
    required = {
        "schema_version", "execution_id", "date", "mode", "status", "runtime",
        "model", "revision", "target_project", "target_module", "scope_paths",
        "instruction_sources", "instruction_set_sha256", "context_sha256", "agents", "skills",
        "human_approval", "security_review", "measurements", "validations", "result",
    }
    allowed_measurements = set(profile.get("measurement_policy", {}).get("allowed_statuses", []))
    valid = 0
    current_revision = git_value("rev-parse", "HEAD")
    for path in sorted((ROOT / "docs/ai-governance/attestations").glob("*.yaml")):
        try:
            item = load_yaml(path)
        except (ValueError, yaml.YAMLError) as exc:
            findings.error(str(exc))
            continue
        missing = sorted(required - item.keys())
        if missing:
            findings.error(f"{relative(path)} missing fields: {', '.join(missing)}")
            continue
        digest = str(item.get("instruction_set_sha256", ""))
        if len(digest) != 64 or set(digest) == {"0"}:
            findings.error(f"{relative(path)} has invalid instruction_set_sha256")
        instruction_paths = [ROOT / source for source in item.get("instruction_sources", [])]
        missing_sources = [relative(source) for source in instruction_paths if not source.is_file()]
        if missing_sources:
            findings.error(f"{relative(path)} has missing instruction sources: {', '.join(missing_sources)}")
        elif digest != combined_digest(instruction_paths):
            revision = str(item.get("revision", ""))
            if revision in {current_revision, "working-tree"}:
                findings.error(f"{relative(path)} instruction_set_sha256 does not match sources")
            elif revision == "resolved_by_ci":
                pass
            else:
                findings.warn(
                    f"{relative(path)} instruction_set_sha256 not revalidated for historical revision {revision}"
                )
        for field in ("agents", "skills"):
            for referenced in item.get(field, []):
                if not (ROOT / referenced).is_file():
                    findings.error(f"{relative(path)} references missing {field[:-1]} {referenced}")
        approval = item.get("human_approval", {})
        if approval.get("status") not in {"approved", "not_required"}:
            findings.error(f"{relative(path)} has unresolved human approval")
        security_review = item.get("security_review", {})
        if security_review.get("status") not in {"passed", "not_applicable"}:
            findings.error(f"{relative(path)} has unresolved security review")
        if security_review.get("open_items") != 0:
            findings.error(f"{relative(path)} security review has open items")
        measurements = item.get("measurements", {})
        measurement_status = measurements.get("status")
        if measurement_status not in allowed_measurements - {"legacy_unverified"}:
            findings.error(f"{relative(path)} has invalid measurement status")
        values = [measurements.get(key) for key in ("prompt_tokens", "completion_tokens", "cost", "latency_ms")]
        if measurement_status != "measured" and any(value is not None for value in values):
            findings.error(f"{relative(path)} must use null for unavailable measurements")
        if measurement_status == "measured" and any(value is None for value in values):
            findings.error(f"{relative(path)} measured status requires numeric values")
        if not findings.errors or not any(relative(path) in error for error in findings.errors):
            valid += 1
    return valid


def validate_eval_registry(findings: Findings) -> int:
    path = ROOT / "docs/ai-governance/evals/scenarios.yaml"
    try:
        document = load_yaml(path)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        findings.error(str(exc))
        return 0
    seen: set[str] = set()
    valid = 0
    for scenario in document.get("scenarios", []):
        scenario_id = scenario.get("id") if isinstance(scenario, dict) else None
        if not scenario_id or scenario_id in seen:
            findings.error(f"invalid or duplicate eval scenario id: {scenario_id}")
            continue
        seen.add(scenario_id)
        source = scenario.get("source_nonconformity")
        if source and not (ROOT / source).is_file():
            findings.error(f"{scenario_id} references missing non-conformity {source}")
            continue
        if not scenario.get("assertion"):
            findings.error(f"{scenario_id} missing assertion")
            continue
        valid += 1
    return valid


def git_value(*args: str, fallback: str = "unavailable") -> str:
    try:
        return subprocess.check_output(
            ["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip() or fallback
    except (OSError, subprocess.CalledProcessError):
        return fallback


def working_tree_digest() -> tuple[bool, str]:
    """Digest tracked diff plus untracked contents without modifying the tree."""
    try:
        status = subprocess.check_output(
            ["git", "status", "--porcelain=v1"], cwd=ROOT, stderr=subprocess.DEVNULL
        )
        digest = hashlib.sha256()
        diff = subprocess.check_output(
            [
                "git", "diff", "--binary", "HEAD", "--", ".",
                ":(exclude)docs/ai-governance/evidence/**",
            ],
            cwd=ROOT,
            stderr=subprocess.DEVNULL,
        )
        digest.update(diff)
        untracked = subprocess.check_output(
            ["git", "ls-files", "--others", "--exclude-standard"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).splitlines()
        for item in sorted(untracked):
            if item.startswith("docs/ai-governance/evidence/"):
                continue
            path = ROOT / item
            if path.is_file():
                digest.update(item.encode("utf-8"))
                digest.update(b"\0")
                digest.update(path.read_bytes())
                digest.update(b"\0")
        return bool(status.strip()), digest.hexdigest()
    except (OSError, subprocess.CalledProcessError):
        return False, "unavailable"


def collect_evidence() -> tuple[dict[str, Any], Findings]:
    findings = Findings()
    try:
        profile = load_yaml(PROFILE)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        findings.error(str(exc))
        return {}, findings
    for schema_path in (PROFILE_SCHEMA, ATTESTATION_SCHEMA):
        try:
            json.loads(schema_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            findings.error(f"invalid JSON Schema {relative(schema_path)}: {exc}")

    validate_profile(profile, findings)
    contracts = validate_contracts(findings)
    contexts = validate_contexts(findings)
    artifacts = validate_artifact_ownership(profile, findings)
    adapters = validate_adapters(profile, findings)
    nonconformities = validate_nonconformities(findings)
    metrics = validate_metrics(profile, findings)
    attestations = validate_attestations(profile, findings)
    eval_scenarios = validate_eval_registry(findings)
    worktree_dirty, worktree_sha256 = working_tree_digest()
    evidence = {
        "schema_version": "1.0.0",
        "profile_id": profile.get("profile_id"),
        "profile_version": profile.get("profile_version"),
        "evaluated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "revision": git_value("rev-parse", "HEAD"),
        "branch": git_value("branch", "--show-current"),
        "working_tree_dirty": worktree_dirty,
        "working_tree_sha256": worktree_sha256,
        "profile_sha256": sha256_file(PROFILE) if PROFILE.exists() else None,
        "status": "conformant" if findings.ok else "nonconformant",
        "coverage": {
            **contracts,
            "fresh_contexts": contexts,
            "owned_agent_skill_artifacts": artifacts,
            "conformant_runtime_adapters": adapters,
            "valid_metric_rows": metrics,
            "valid_attestations": attestations,
            "registered_deterministic_eval_scenarios": eval_scenarios,
            **nonconformities,
        },
        "errors": findings.errors,
        "warnings": findings.warnings,
    }
    return evidence, findings


def write_evidence() -> int:
    evidence, findings = collect_evidence()
    EVIDENCE_JSON.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_JSON.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    coverage = evidence.get("coverage", {})
    lines = [
        "# AI-first Engineering Evidence",
        "",
        "<!-- generated: tools/ai/governance.py; do not edit manually -->",
        "",
        f"- Status: `{evidence.get('status', 'nonconformant')}`",
        f"- Profile: `{evidence.get('profile_id', 'unknown')}@{evidence.get('profile_version', 'unknown')}`",
        f"- Revision: `{evidence.get('revision', 'unavailable')}`",
        f"- Branch: `{evidence.get('branch', 'unavailable')}`",
        f"- Working tree dirty: `{str(evidence.get('working_tree_dirty', False)).lower()}`",
        f"- Working tree SHA-256: `{evidence.get('working_tree_sha256', 'unavailable')}`",
        f"- Evaluated at: `{evidence.get('evaluated_at', 'unavailable')}`",
        f"- Profile SHA-256: `{evidence.get('profile_sha256', 'unavailable')}`",
        "",
        "## Coverage",
        "",
        "| Indicator | Value |",
        "|---|---:|",
        *[f"| `{key}` | {value} |" for key, value in sorted(coverage.items())],
        "",
        "## Findings",
        "",
    ]
    errors = evidence.get("errors", [])
    lines.extend([f"- ERROR: {item}" for item in errors] or ["- No blocking findings."])
    lines.extend(["", "## Reproduce", "", "```bash", "make ai-conformance", "```", ""])
    EVIDENCE_MD.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"AI-first conformance: {evidence.get('status')}")
    for item in findings.errors:
        print(f"fail: {item}")
    for item in findings.warnings:
        print(f"warn: {item}")
    return 0 if findings.ok else 1


def validate_only() -> int:
    evidence, findings = collect_evidence()
    print(f"AI-first conformance: {evidence.get('status', 'nonconformant')}")
    for item in findings.errors:
        print(f"fail: {item}")
    for item in findings.warnings:
        print(f"warn: {item}")
    return 0 if findings.ok else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("validate", "generate-context", "evidence", "digest"))
    parser.add_argument("paths", nargs="*")
    args = parser.parse_args()
    if args.command == "generate-context":
        return generate_contexts()
    if args.command == "evidence":
        return write_evidence()
    if args.command == "digest":
        if not args.paths:
            parser.error("digest requires at least one repository-relative path")
        print(combined_digest([ROOT / path for path in args.paths]))
        return 0
    return validate_only()


if __name__ == "__main__":
    sys.exit(main())
