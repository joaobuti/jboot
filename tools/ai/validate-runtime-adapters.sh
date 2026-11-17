#!/usr/bin/env sh
set -eu

missing=0

require_file() {
  if [ ! -f "$1" ]; then
    echo "missing: $1"
    missing=1
  fi
}

require_text() {
  file="$1"
  text="$2"
  if [ -f "$file" ] && ! grep -Fq "$text" "$file"; then
    echo "missing text in $file: $text"
    missing=1
  fi
}

require_file "AGENTS.md"
require_file "docs/architecture/implementation-contracts.md"
require_file "docs/architecture/ai-runtime-adapters.md"
require_file "docs/architecture/ai-maturity-checklist.md"
require_file "docs/ai-governance/conformance/ai-first.yaml"
require_file "docs/ai-governance/schemas/ai-first.schema.json"
require_file "docs/ai-governance/schemas/execution-attestation.schema.json"
require_file "docs/skills/ai-first-governance/SKILL.md"
require_file "docs/ai-governance/security/agentic-threat-model.md"
require_file "docs/ai-governance/security/tool-approval-matrix.yaml"
require_file ".codex.d/AGENTS.md"
require_file ".codex.d/skills/jboot-orchestration/SKILL.md"
require_file ".codex.d/skills/jboot-platform-execution/SKILL.md"
require_file ".codex.d/skills/ai-first-governance/SKILL.md"
require_file ".claude/CLAUDE.md"
require_file "docs/ai-commands/claude-settings-hooks.example.json"
require_file ".claude/agents/product-engineer.md"
require_file ".claude/agents/architect.md"
require_file ".claude/agents/product-owner.md"
require_file ".claude/agents/marketing-brand.md"
require_file ".claude/agents/ui-ux.md"
require_file ".claude/skills/jboot-platform-execution.md"
require_file ".claude/skills/ai-first-governance.md"
require_file ".cursor/rules/jboot-ai-architecture.mdc"
require_file ".github/copilot-instructions.md"
require_file "docs/AI-COMMANDS.md"
require_file "tools/ai/claude-hook-pretool.sh"
require_file "tools/ai/claude-hook-posttool.sh"
require_file "tools/ai/claude-hook-stop.sh"

require_text "AGENTS.md" "adapters de runtime"
require_text "AGENTS.md" "docs/AI-COMMANDS.md"
require_text "AGENTS.md" "platform-crud-ui.md"
require_text "AGENTS.md" "Usuario Teste"
require_text "docs/architecture/implementation-contracts.md" "Adapters de runtime"
require_text ".codex.d/AGENTS.md" "Agent Activation"
require_text ".codex.d/AGENTS.md" "docs/AI-COMMANDS.md"
require_text ".codex.d/AGENTS.md" "platform-crud-ui.md"
require_text ".codex.d/AGENTS.md" "Usuario Teste"
require_text ".codex.d/AGENTS.md" "docs/agents/orchestration/ui-ux.md"
require_text ".codex.d/AGENTS.md" "docs/agents/stacks/*"
require_text ".claude/CLAUDE.md" "Agent Activation"
require_text ".claude/CLAUDE.md" "docs/AI-COMMANDS.md"
require_text ".claude/CLAUDE.md" "platform-crud-ui.md"
require_text ".claude/CLAUDE.md" "Usuario Teste"
require_text ".claude/CLAUDE.md" "docs/agents/orchestration/ui-ux.md"
require_text ".claude/CLAUDE.md" "docs/agents/stacks/*"
require_text ".claude/CLAUDE.md" "Stack Fit Gate"
require_text ".claude/CLAUDE.md" "tema "
require_text ".claude/CLAUDE.md" "minimal"
require_text ".claude/CLAUDE.md" "modo "
require_text ".claude/CLAUDE.md" "dark"
require_text "docs/ai-commands/claude-settings-hooks.example.json" "PreToolUse"
require_text "docs/ai-commands/claude-settings-hooks.example.json" "PostToolUse"
require_text "docs/ai-commands/claude-settings-hooks.example.json" "Stop"
require_text "docs/ai-commands/claude-settings-hooks.example.json" "tools/ai/claude-hook-pretool.sh"
require_text ".cursor/rules/jboot-ai-architecture.mdc" "Agent Activation"
require_text ".cursor/rules/jboot-ai-architecture.mdc" "docs/AI-COMMANDS.md"
require_text ".cursor/rules/jboot-ai-architecture.mdc" "platform-crud-ui.md"
require_text ".cursor/rules/jboot-ai-architecture.mdc" "Usuario Teste"
require_text ".cursor/rules/jboot-ai-architecture.mdc" "docs/agents/orchestration/ui-ux.md"
require_text ".cursor/rules/jboot-ai-architecture.mdc" "docs/agents/stacks/*"
require_text ".github/copilot-instructions.md" "Agent Activation"
require_text ".github/copilot-instructions.md" "docs/AI-COMMANDS.md"
require_text ".github/copilot-instructions.md" "platform-crud-ui.md"
require_text ".github/copilot-instructions.md" "Usuario Teste"
require_text ".github/copilot-instructions.md" "docs/agents/orchestration/ui-ux.md"
require_text ".github/copilot-instructions.md" "docs/agents/stacks/*"
require_text "docs/AI-COMMANDS.md" "Hooks De Automacao"
require_text "docs/AI-COMMANDS.md" "Codex"
require_text "AGENTS.md" "mapear implementacao"
require_text "docs/agents/orchestration/product-engineer.md" "mapear implementacao"
require_text "docs/AI-COMMANDS.md" "mapear implementacao"
require_text "docs/ai-commands/jboot-plan-feature.md" "PE Decision"
require_text "docs/ai-commands/jboot-plan-feature.md" "blocking_status"
require_text ".codex.d/AGENTS.md" "PE Decision"
require_text ".claude/CLAUDE.md" "PE Decision"
require_text ".cursor/rules/jboot-ai-architecture.mdc" "PE Decision"
require_text ".github/copilot-instructions.md" "PE Decision"
require_text ".codex.d/skills/jboot-orchestration/SKILL.md" "PE Decision"
require_text ".claude/skills/jboot-orchestration.md" "PE Decision"
require_text ".codex.d/skills/jboot-orchestration/SKILL.md" "target_project"
require_text ".codex.d/skills/jboot-platform-execution/SKILL.md" "target_module"
require_text ".github/copilot-instructions.md" "target_project"
require_text ".github/copilot-instructions.md" "target_module"

for adapter in \
  "AGENTS.md" \
  ".codex.d/AGENTS.md" \
  ".claude/CLAUDE.md" \
  ".cursor/rules/jboot-ai-architecture.mdc" \
  ".github/copilot-instructions.md"; do
  for control in \
    AIF-GOV-001 AIF-GOV-002 AIF-CTX-001 AIF-EXEC-001 AIF-EXEC-002 \
    AIF-EVAL-001 AIF-EVAL-002 AIF-SEC-001 AIF-SEC-002 AIF-OBS-001 \
    AIF-LCM-001 AIF-ADP-001; do
    require_text "$adapter" "$control"
  done
done

if [ "$missing" -ne 0 ]; then
  echo "ai runtime adapter validation failed"
  exit 1
fi

echo "ai runtime adapter validation ok"
