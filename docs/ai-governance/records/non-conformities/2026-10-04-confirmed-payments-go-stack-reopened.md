# Confirmed Payments Go Stack Reopened

date: 2026-10-04
severity: high
status: corrected
owner: ai-architecture
regression_test: AIF-EVAL-NC-007 in docs/ai-governance/evals/scenarios.yaml

## Non-Conformity

Depois de o usuario definir Go para o backend do servico independente de
pagamentos considerando crescimento potencial, footprint e throughput, uma
saida posterior voltou a recomendar Java/Spring como se a stack ainda estivesse
aberta.

## Impact

- contradiz decisao arquitetural humana;
- faz o planejamento oscilar entre stacks;
- pode materializar contrato, agents e codigo na stack errada;
- reduz a confianca na rastreabilidade de decisoes confirmadas.

## Root Cause

A decisao permaneceu apenas no contexto conversacional. Nao havia ADR nem
roadmap persistido marcando Go como `confirmed_by_human`, e a recomendacao de um
agent posterior foi tratada como capaz de substituir a decisao humana.

## Correction

- ADR 011 registra Go + PostgreSQL como decisao aceita e vinculante;
- `docs/product/payments-sprints.md` referencia a ADR e fixa Go em todas as
  etapas da fundacao;
- Spring, NestJS e Laravel ficam explicitamente rejeitados para este servico;
- perguntas ainda abertas permanecem bloqueantes sem reabrir a linguagem;
- regressao deterministica valida a persistencia da decisao.

## Expected Behavior

Uma decisao `confirmed_by_human` permanece ativa ate o usuario pedir
explicitamente reavaliacao ou surgir requisito materialmente incompatível. Um
agent pode comunicar conflito, mas nao substituir silenciosamente a decisao.
