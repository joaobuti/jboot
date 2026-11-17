# Domain Integrations Hardening Gate

## Status

Iniciativa autorizada pelo usuario em 2026-10-06. Gate em andamento.

## PE Decision

| Campo | Decisao |
|---|---|
| `execution_mode` | `architectural` + `cross_project` |
| `target_project` | `implementations/bff-jboot-platform` |
| `target_module` | `modules/domain-integrations` |
| `delivery_type` | modulo interno de integracao |
| `sprint_artifact` | `docs/product/domain-integrations-hardening-sprints.md` |
| `sprint_gate` | este documento |
| `open_questions` | nenhuma funcional; baseline Git isolado por worktree dedicado |
| `blocking_status` | implementacao autorizada |

## Deployment Boundary Gate

Classificacao: `embedded_module`.

Evidencia: as operacoes reutilizam JWT/contexto Identity, pools por
`database_ref`, repositories Juridico/Flow e o mesmo deploy do
`bff-jboot-platform`. Nao existe SLA, escala, runtime, fila ou consumidor
externo que justifique unidade independente.

`stack_decision: inherited_from_host`.

## Stack Fit Gate

`not_applicable_inherited_from_host`. Inserir segundo runtime no processo ou
extrair microservico foi rejeitado. Nova avaliacao exige requisito operacional
novo e confirmacao humana.

## Agent Activation

- `docs/agents/orchestration/product-owner.md`;
- `docs/agents/orchestration/product-engineer.md`;
- `docs/agents/orchestration/architect.md`;
- `docs/agents/orchestration/ai-graph-architect.md`;
- `implementations/bff-jboot-platform/agents/backend-node-typescript.md`;
- `implementations/bff-jboot-platform/agents/platform-auth-context.md`;
- `implementations/bff-jboot-platform/agents/platform-postgres.md`;
- `implementations/bff-jboot-platform/modules/domain-integrations/agents/domain-integrations.md`.

Skills:

- `docs/skills/ai-first-governance/SKILL.md`;
- `docs/skills/security-checklist/SKILL.md`;
- `implementations/bff-jboot-platform/skills/nest-module-pattern.md`;
- `implementations/bff-jboot-platform/skills/tenant-context.md`;
- `implementations/bff-jboot-platform/skills/api-contract.md`;
- `implementations/bff-jboot-platform/modules/domain-integrations/skills/domain-flow-import.md`.

## Contratos E Consumidores

Superficie inicial lida com `make ai-api-context MODULE=domain-integrations`:

- `GET /domain-integrations/flow/boards`;
- `POST /domain-integrations/juridico/pje/comunicacoes/:id/export-flow`;
- `POST /domain-integrations/juridico/datajud/processos/:snapshotId/export-flow`;
- `GET /domain-integrations/flow/cards/:cardId/monitoramento`;
- `POST /domain-integrations/flow/cards/:cardId/monitoramento`;
- `PATCH /domain-integrations/flow/cards/:cardId/monitoramento/cadencia`, quando
  transportado do trabalho dependente validado.

Consumidores afetados: clientes Juridico e componentes de monitoramento do
Kanban em `app-jboot-next-platform`.

## Architecture Graph

- node principal: `module:bff-jboot-platform/domain-integrations`;
- relacoes explicitas com `juridico`, `kanban`, Identity, Temporal e o sprint;
- API endpoints continuam derivados do API Contract Graph;
- owner: `module-contract:bff-jboot-platform/domain-integrations`;
- provenance: contracts, registry e API Contract Graph;
- steward: `ai-graph-architect` para reconciliar o drift estrutural.

## Gate Funcional E Tecnico

### H1 — Verdade arquitetural

- [ ] contrato lista responsabilidades, rotas e sprints reais;
- [ ] ADR aprovada esta versionada;
- [ ] idempotencia antiga deixa de constar como pergunta aberta;
- [ ] Architecture Graph representa as integracoes cross-domain;
- [ ] AI context regenerado;
- [ ] API Graph e Architecture Graph aprovados.

### H2 — Contexto e autorizacao

- [ ] resolver server-side retorna contextos tipados por application slug;
- [ ] token Juridico nao fornece implicitamente database do Flow;
- [ ] token Flow nao fornece implicitamente database do Juridico;
- [ ] tenant e identidade sempre derivam do JWT verificado;
- [ ] acesso ao card/board e validado antes de operar monitoramento;
- [ ] testes negativos cobrem entitlement, scopes, membership e tenant.

### H3 — Adapters

- [ ] exporters PJe e DataJud sao use cases separados;
- [ ] mappers sao puros e testados;
- [ ] monitoramento e subscriber de eventos possuem servicos proprios;
- [ ] controller/facade nao concentram regras de dominio;
- [ ] nenhuma rota existente quebra contrato.

### H4 — Consistencia e observabilidade

- [ ] retries nao duplicam cards, atividades ou automacoes;
- [ ] falha parcial possui estado/erro operacional verificavel;
- [ ] logs estruturados nao contem PII, token ou numero CNJ em claro;
- [ ] metricas indisponiveis sao declaradas, nunca representadas como zero;
- [ ] estrategia de rollback/compensacao esta documentada e testada.

### H5 — Fechamento

- [ ] testes backend passam dentro do container;
- [ ] testes/type-check/build dos consumidores frontend passam no container;
- [ ] lint focado e auditoria de dependencias aprovados;
- [ ] security checklist sem item aberto;
- [ ] `make ai-api-graph-gate` aprovado;
- [ ] `make ai-architecture-graph-gate` aprovado;
- [ ] `make ai-conformance` aprovado;
- [ ] attestation e evidence pack gerados do mesmo revisionamento;
- [ ] lifecycle/readiness revisados com evidencia;
- [ ] arvore Git limpa no fechamento terminal.

## Riscos

| Risco | Mitigacao |
|---|---|
| service vira ESB/god module | use cases por integracao; regra permanece no dominio |
| confusao de `database_ref` | resolver application contexts server-side |
| UUID de card usado como autorizacao | validar board membership e roles |
| falha entre bancos | idempotencia, operation id e reconciliacao explicita |
| graph/documentacao stale | update no mesmo diff e gates bloqueantes |
| transportar WIP alheio | worktree isolado e selecao por dependencia comprovada |

## Fora De Escopo

- novo produto ou adapter de negocio;
- novo microservico, banco ou broker;
- alteracao da politica comercial de scopes;
- sincronizacao bidirecional generica;
- edicao pelo Architecture Graph Viewer.

