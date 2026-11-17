# PE formal planning not triggered for implementation mapping

date: 2026-08-26
severity: blocking
status: corrected
owner: ai-governance
regression_test: AIF-EVAL-NC-004 in docs/ai-governance/evals/scenarios.yaml

## Non-Conformity

Ao receber pedido em linguagem natural para mapear a implementacao de uma nova integracao cross-module em `implementations/*`, a resposta tratou o assunto como arquitetura conceitual e recomendou desenho tecnico antes de executar formalmente o Product Engineer e o `Stack Fit Gate`.

## Impact

- Permite planejamento por inferencia em ponto sensivel do repositorio.
- Pode pular `PE Decision`, `sprint_artifact`, `sprint_gate`, perguntas abertas e confirmacao humana.
- Enfraquece rastreabilidade entre conversa, artefatos versionados e implementacao futura.

## Root Cause

A regra existente bloqueava claramente criacao de contrato/codigo, mas nao explicitava que pedidos como "mapear implementacao", "planejar implementacao", "nova integracao" ou "feature cross-module" ja iniciam planejamento governado antes de qualquer edicao.

## Correction

- `AGENTS.md`, `docs/agents/orchestration/product-engineer.md`, `docs/AI-COMMANDS.md` e `docs/ai-commands/jboot-plan-feature.md` passaram a declarar o gatilho de planejamento governado.
- Adapters Codex, Claude, Cursor e GitHub Copilot receberam a mesma regra operacional.
- `tools/ai/validate-runtime-adapters.sh` e `tools/ai/run-evals.sh` passaram a validar a presenca da regra.
- `docs/ai-governance/evals/scenarios.yaml` ganhou regressao `AIF-EVAL-NC-004`.

## Expected Behavior

Pedidos para mapear implementacao, planejar implementacao, desenhar arquitetura, criar servico, nova integracao, integrar produtos ou feature cross-module em `implementations/*` devem emitir PE formal antes de recomendacao tecnica/arquitetural fechada:

- `PE Decision`;
- `Stack Fit Gate`, quando aplicavel;
- `sprint_artifact`;
- `sprint_gate`;
- `open_questions`;
- `blocking_status`.
