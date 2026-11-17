# Non-Conformity: PDV Sprint 1 Without Traceable Agent Activation

date: 2026-05-19
severity: high
status: corrected
owner: ai-governance
regression_test: AIF-EVAL-NC-001 in docs/ai-governance/evals/scenarios.yaml

## Expected

Antes de codigo funcional, a execucao deveria declarar `Agent Activation` com agents e skills usados.

## Actual

A Sprint 1 do PDV foi implementada e validada tecnicamente, mas sem feedback rastreavel de agents/skills antes do codigo.

## Impact

- Rastreabilidade quebrada.
- Contratos usados como referencia, mas sem ativacao formal auditavel.
- Processo nao aderente apesar de entrega tecnica validada.

## Correction

- Criada regra explicita de `Agent Activation`.
- Criados adapters de runtime.
- Criados validadores e evals iniciais.

## Prevention

Executar `tools/ai/preflight-check.sh` e `tools/ai/run-evals.sh` antes de novas sprints funcionais.
