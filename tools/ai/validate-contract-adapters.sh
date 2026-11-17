#!/usr/bin/env sh
set -eu

failed=0

fail() {
  echo "fail: $1"
  failed=1
}

require_file() {
  [ -f "$1" ] || fail "missing file $1"
}

require_text() {
  file="$1"
  text="$2"
  if [ -f "$file" ] && ! grep -Fq "$text" "$file"; then
    fail "missing text '$text' in $file"
  fi
}

require_contract_activation() {
  contract="$1"
  require_text "$contract" "Agent Activation:"
}

require_lifecycle_status() {
  contract="$1"
  require_text "$contract" "lifecycle_status:"
  require_text "$contract" "production_readiness:"
  require_text "$contract" "status_evidence:"
  require_text "$contract" "last_status_review:"

  status="$(sed -n 's/^lifecycle_status:[[:space:]]*//p' "$contract" | head -n 1)"
  case "$status" in
    planned|scaffolded|in_progress|functional|production_ready|deprecated) ;;
    *) fail "invalid lifecycle_status '$status' in $contract" ;;
  esac
}

require_project_context() {
  contract="$1"
  project_dir="${contract%/PROJECT_CONTRACT.md}"
  require_file "$project_dir/PROJECT_CONTRACT.md"
  require_file "$project_dir/AI_CONTEXT.md"
  if [ -d "$project_dir/agents" ]; then
    find "$project_dir/agents" -type f -name "*.md" | grep -q . || fail "empty agents dir: $project_dir/agents"
  fi
  if [ -d "$project_dir/skills" ]; then
    find "$project_dir/skills" -type f -name "*.md" | grep -q . || fail "empty skills dir: $project_dir/skills"
  fi
}

require_file "AGENTS.md"
require_file "docs/architecture/implementation-contracts.md"
require_file "docs/architecture/ai-runtime-adapters.md"

for adapter in \
  ".codex.d/AGENTS.md" \
  ".codex.d/skills/jboot-orchestration/SKILL.md" \
  ".codex.d/skills/jboot-platform-execution/SKILL.md" \
  ".claude/CLAUDE.md" \
  ".cursor/rules/jboot-ai-architecture.mdc" \
  ".github/copilot-instructions.md"; do
  require_file "$adapter"
  require_text "$adapter" "Agent Activation"
done

for adapter in \
  ".codex.d/AGENTS.md" \
  ".claude/CLAUDE.md" \
  ".cursor/rules/jboot-ai-architecture.mdc" \
  ".github/copilot-instructions.md"; do
  require_text "$adapter" "lifecycle_status"
  require_text "$adapter" "production_ready"
done

for adapter in \
  ".codex.d/skills/jboot-orchestration/SKILL.md" \
  ".codex.d/skills/jboot-platform-execution/SKILL.md" \
  ".claude/skills/jboot-platform-execution.md" \
  ".cursor/rules/jboot-ai-architecture.mdc" \
  ".github/copilot-instructions.md"; do
  require_text "$adapter" "target_project"
done

for adapter in \
  ".codex.d/skills/jboot-platform-execution/SKILL.md" \
  ".claude/skills/jboot-platform-execution.md" \
  ".cursor/rules/jboot-ai-architecture.mdc" \
  ".github/copilot-instructions.md"; do
  require_text "$adapter" "target_module"
done

contracts_file="$(mktemp)"
modules_file="$(mktemp)"
trap 'rm -f "$contracts_file" "$modules_file"' EXIT HUP INT TERM

find implementations \( -path "*/node_modules" -o -path "*/legacy-reference" \) -prune -o -name PROJECT_CONTRACT.md -print > "$contracts_file"
while read -r contract; do
  require_project_context "$contract"
  require_lifecycle_status "$contract"
done < "$contracts_file"

for project_dir in $(find implementations -mindepth 1 -maxdepth 1 -type d ! -name templates | sort); do
  project_name="${project_dir#implementations/}"
  require_text "implementations/README.md" "\`$project_name\`"
  require_text "docs/architecture/implementation-contracts.md" "\`implementations/$project_name\`"
done

for contract in \
  implementations/bff-jboot-platform/PROJECT_CONTRACT.md \
  implementations/app-jboot-next-platform/PROJECT_CONTRACT.md \
  implementations/app-jboot-pdv-mobile/PROJECT_CONTRACT.md \
  implementations/svc-jboot-fiscal/PROJECT_CONTRACT.md; do
  require_contract_activation "$contract"
done

find implementations \( -path "*/node_modules" -o -path "*/legacy-reference" \) -prune -o -name MODULE_CONTRACT.md -print > "$modules_file"
while read -r module_contract; do
  module_dir="${module_contract%/MODULE_CONTRACT.md}"
  require_file "$module_dir/AI_CONTEXT.md"
  require_lifecycle_status "$module_contract"
  require_text "$module_contract" "Agent Activation:"
  require_text "$module_contract" "MODULE_CONTRACT.md"
done < "$modules_file"

if [ "$failed" -ne 0 ]; then
  echo "contract adapter semantic validation failed"
  exit 1
fi

echo "contract adapter semantic validation ok"
