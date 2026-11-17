#!/usr/bin/env sh
set -eu

failed=0
fail() {
  echo "fail: $1"
  failed=1
}

expect_fail() {
  label="$1"
  shift
  if "$@" >/tmp/jboot-eval-negative.log 2>&1; then
    fail "$label should have failed"
  fi
}

contains() {
  file="$1"
  text="$2"
  grep -Fq "$text" "$file" || fail "$file missing '$text'"
}

contains "docs/agents/orchestration/product-engineer.md" "Agent Activation"
contains "docs/agents/orchestration/product-engineer.md" "target_project"
contains "docs/agents/orchestration/product-engineer.md" "target_module"
contains "docs/architecture/implementation-contracts.md" "target_module"
contains "docs/architecture/implementation-lifecycle.md" "production_ready"
contains "docs/ai-architecture.md" "AI-first engineering"
contains "src/ai/README.md" "runtime_status: planned"
contains "docs/product/pdv-sprint-1-gate.md" "destino atual"
contains "docs/product/pdv-sprint-1-gate.md" "Agents E Skills"
contains "GUIA-NOVO-PROJETO.md" "Sem esse preflight"
contains "AGENTS.md" "mapear implementacao"
contains "docs/agents/orchestration/product-engineer.md" "blocking_status"
contains "docs/AI-COMMANDS.md" "workflows auditaveis de planejamento"
contains ".codex.d/AGENTS.md" "PE Decision"
contains ".claude/CLAUDE.md" "PE Decision"
contains ".cursor/rules/jboot-ai-architecture.mdc" "PE Decision"
contains ".github/copilot-instructions.md" "PE Decision"
contains ".github/copilot-instructions.md" "Agent Activation"
contains ".cursor/rules/jboot-ai-architecture.mdc" "Do not implement functional code"

tools/ai/validate-runtime-adapters.sh >/tmp/jboot-eval-runtime.log
tools/ai/validate-contract-adapters.sh >/tmp/jboot-eval-contract.log
tools/ai/governance-report.sh >/tmp/jboot-eval-governance-report.log
python3 tools/ai/behavioral-evals.py >/tmp/jboot-eval-behavioral.log
tools/ai/preflight-check.sh \
  --project implementations/bff-jboot-platform \
  --module modules/pdv \
  --gate docs/product/pdv-sprint-1-gate.md \
  --activation-file docs/ai-governance/evals/sample-agent-activation.txt >/tmp/jboot-eval-preflight.log

expect_fail "missing using_skill" \
  tools/ai/preflight-check.sh \
    --project implementations/bff-jboot-platform \
    --module modules/pdv \
    --gate docs/product/pdv-sprint-1-gate.md \
    --activation-file docs/ai-governance/evals/invalid-agent-activation-missing-skill.txt

expect_fail "missing module directory" \
  tools/ai/preflight-check.sh \
    --project implementations/bff-jboot-platform \
    --module modules/inexistente \
    --gate docs/product/pdv-sprint-1-gate.md \
    --activation-file docs/ai-governance/evals/sample-agent-activation.txt

if [ "$failed" -ne 0 ]; then
  echo "ai governance evals failed"
  exit 1
fi

echo "ai governance evals ok"
