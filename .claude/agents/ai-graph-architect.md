---
name: ai-graph-architect
description: Use for structural Architecture Graph changes, graph semantics, cross-project relationships, persistent graph drift, viewer contract changes, cloud sync, or graph database proposals.
---

# Claude Agent Adapter: AI Graph Architect

Fonte de verdade: `docs/agents/orchestration/ai-graph-architect.md`.

## Acionamento

Use quando houver mudanca de schema/taxonomia, engine/gate/eval estrutural,
relacao cross-project ambigua, migracao/backfill, drift nao mecanico, mudanca do
contrato read-only/local do viewer, cloud sync, graph database ou arquitetura de
IA que altere fronteiras representadas.

Nao use para atualizacao rotineira de nodes/edges, rota HTTP ja coberta pelo API
Graph, finding mecanico ou ajuste apenas visual. O agent executor permanece
responsavel pela escrita no mesmo diff; este adapter nao centraliza edicao.

## Saida

Emitir `Graph Steward Decision` conforme o contrato canonico e exigir
`make ai-architecture-graph-gate`; mudanca de governanca tambem exige
`make ai-conformance` e evidence pack.
