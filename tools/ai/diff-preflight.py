#!/usr/bin/env python3
"""Validate that a real Git diff is covered by an execution attestation."""

from __future__ import annotations

import argparse
import fnmatch
from pathlib import Path
import subprocess
import sys

import yaml


ROOT = Path(__file__).resolve().parents[2]


def git_paths(base: str | None) -> list[str]:
    commands = []
    if base:
        commands.append(["git", "diff", "--name-only", f"{base}...HEAD"])
    else:
        commands.extend(
            [
                ["git", "diff", "--name-only"],
                ["git", "diff", "--cached", "--name-only"],
                ["git", "ls-files", "--others", "--exclude-standard"],
            ]
        )
    paths: set[str] = set()
    for command in commands:
        output = subprocess.check_output(command, cwd=ROOT, text=True)
        paths.update(item.strip() for item in output.splitlines() if item.strip())
    return sorted(paths)


def is_covered(path: str, scopes: list[str]) -> bool:
    for scope in scopes:
        normalized = scope.rstrip("/")
        if path == normalized or path.startswith(f"{normalized}/") or fnmatch.fnmatch(path, scope):
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base")
    parser.add_argument("--attestation")
    parser.add_argument("--allow-working-tree-revision", action="store_true")
    args = parser.parse_args()

    changed = git_paths(args.base)
    if args.attestation:
        attestation_path = ROOT / args.attestation
    else:
        candidates = sorted((ROOT / "docs/ai-governance/attestations").glob("*.yaml"))
        if args.base:
            candidates = [
                path
                for path in candidates
                if path.relative_to(ROOT).as_posix() in changed
            ]
        if not candidates:
            print("fail: no execution attestation found in the evaluated diff")
            return 1
        attestation_path = candidates[-1]
    if not attestation_path.is_file():
        print(f"fail: missing attestation {attestation_path.relative_to(ROOT).as_posix()}")
        return 1
    attestation = yaml.safe_load(attestation_path.read_text(encoding="utf-8"))
    errors: list[str] = []
    required = {
        "schema_version", "execution_id", "date", "mode", "status", "runtime",
        "model", "revision", "target_project", "scope_paths", "instruction_sources", "agents", "skills",
        "human_approval", "security_review", "measurements", "validations", "result",
    }
    missing = sorted(required - set(attestation or {}))
    if missing:
        errors.append(f"attestation missing: {', '.join(missing)}")
    if attestation.get("status") != "success":
        errors.append("attestation status must be success")
    approval = attestation.get("human_approval", {})
    if approval.get("status") not in {"approved", "not_required"}:
        errors.append("human approval is unresolved")
    if attestation.get("revision") == "working-tree" and not args.allow_working_tree_revision:
        errors.append("working-tree revision is local-only; record the commit SHA for CI")

    attestation_rel = attestation_path.relative_to(ROOT).as_posix()
    if args.base and attestation_rel not in changed:
        errors.append(f"pull request must add or update its attestation: {attestation_rel}")
    uncovered = [path for path in changed if not is_covered(path, attestation.get("scope_paths", []))]
    if uncovered:
        errors.append(f"diff paths outside attestation scope: {', '.join(uncovered)}")

    if errors:
        for error in errors:
            print(f"fail: {error}")
        return 1
    print(f"AI diff preflight ok; changed_paths={len(changed)}; execution_id={attestation['execution_id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
