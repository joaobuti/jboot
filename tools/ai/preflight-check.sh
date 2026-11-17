#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  tools/ai/preflight-check.sh --project implementations/<project> [--module modules/<module>] [--gate path] [--activation-file path]

Validates the minimum AI execution preflight before functional code.
USAGE
}

project=""
module=""
gate=""
activation_file=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project) project="${2:-}"; shift 2 ;;
    --module) module="${2:-}"; shift 2 ;;
    --gate) gate="${2:-}"; shift 2 ;;
    --activation-file) activation_file="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1"; usage; exit 2 ;;
  esac
done

failed=0
fail() {
  echo "fail: $1"
  failed=1
}

[ -n "$project" ] || fail "missing --project"
[ -d "$project" ] || fail "project directory not found: $project"
[ -f "$project/PROJECT_CONTRACT.md" ] || fail "missing PROJECT_CONTRACT.md in $project"

if [ -n "$module" ]; then
  [ -d "$project/$module" ] || fail "module directory not found: $project/$module"
  [ -f "$project/$module/MODULE_CONTRACT.md" ] || fail "missing MODULE_CONTRACT.md in $project/$module"
fi

if [ -n "$gate" ]; then
  [ -f "$gate" ] || fail "gate file not found: $gate"
fi

if [ -n "$activation_file" ]; then
  [ -f "$activation_file" ] || fail "activation file not found: $activation_file"
  grep -Fq "Agent Activation:" "$activation_file" || fail "activation file lacks Agent Activation"
  grep -Fq "using_agent:" "$activation_file" || fail "activation file lacks using_agent"
  grep -Fq "using_skill:" "$activation_file" || fail "activation file lacks using_skill"
  grep -Fq "referenced_only:" "$activation_file" || fail "activation file lacks referenced_only"
  grep -Fq "not_using:" "$activation_file" || fail "activation file lacks not_using"
else
  echo "warn: no --activation-file provided; conversational Agent Activation must be visible before code"
fi

if [ "$failed" -ne 0 ]; then
  echo "ai preflight failed"
  exit 1
fi

echo "ai preflight ok"
