# Module Contract: bff-jboot-platform/modules/domain-integrations

## Status

```yaml
lifecycle_status: in_progress
production_readiness: not_assessed
status_evidence: fluxos PJe/DataJud -> Flow ativos; hardening cross-domain H1-H5 em andamento
last_status_review: 2026-10-06
```

Modulo interno da Platform backend. A implementacao runtime deve viver em
`src/modules/domain-integrations`.

## Responsabilidade

Orquestrar integracoes cross-module entre produtos do Hub, com use cases e
adapters explicitos por origem/destino. Os fluxos ativos conectam Juridico
(PJe/DataJud) ao Flow, incluindo monitoramento e propagacao de mudancas.

O modulo e dono da coordenacao, da autorizacao cruzada, da idempotencia e da
evidencia operacional da integracao. Regras e dados de negocio permanecem nos
dominios de origem/destino.

Este modulo **nao e application Identity**: nao aparece no seletor pos-login,
nao tem entitlement proprio e nao possui UI direta. Ele opera sempre dentro do
contexto autenticado de um modulo chamador e valida as capacidades dos produtos
envolvidos server-side.

## Agents Do Modulo

- `agents/domain-integrations.md`

## Skills Do Modulo

- `skills/domain-flow-import.md`

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/bff-jboot-platform`.

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/domain-integrations
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
    - implementations/bff-jboot-platform/modules/domain-integrations/agents/domain-integrations.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - implementations/bff-jboot-platform/modules/domain-integrations/skills/domain-flow-import.md
```

## Contratos Obrigatorios

- `implementations/bff-jboot-platform/modules/domain-integrations/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/domain-integrations/AI_CONTEXT.md`
- `docs/product/domain-flow-integration-sprints.md`
- `docs/product/domain-flow-integration-sprint-1-gate.md`
- `docs/data/domain-flow-integration-sprint-1-data-model.md`
- `docs/api/domain-flow-integration-sprint-1-openapi.yaml`
- `docs/product/juridico-datajud-flow-sprints.md`
- `docs/product/domain-integrations-hardening-sprints.md`
- `docs/product/domain-integrations-hardening-sprint-1-gate.md`
- `docs/ai-governance/records/decisions/2026-10-06-domain-integrations-priority.md`
- `docs/product/flow-card-actions-sprints.md` (Sprint 2: acao Monitorar)
- `docs/product/process-monitoring-sprints.md` (ADR 021: Monitorar, importacao e toggle do card passam a usar `modules/process-monitoring` com destino `flow`, sem `juridico:read`; S1-S3 `concluida`: Monitorar, importacao e toggle usam a capacidade com destino `flow`, sem `juridico:read`; a exportacao Juridico -> Flow checa duplicidade no Kanban)
- `docs/api/flow-card-actions-openapi.yaml`
- `docs/product/flow-process-import-sprints.md` (importacao por planilha)
- `docs/api/flow-process-import-openapi.yaml`

## Banco De Dados

- O modulo nao possui banco dedicado proprio.
- Dados de origem permanecem no banco do modulo origem.
- Cards e metadados de origem externa ficam no banco do Flow/Kanban.
- Vinculos necessarios ao caminho inverso ficam no banco do Juridico, owner do
  monitoramento processual.
- Toda query deve filtrar por `client_id`.
- O `database_ref` do token identifica apenas o application context chamador.
  Contextos dos demais produtos devem ser resolvidos server-side por
  identidade, cliente, application slug, entitlement e scopes; nunca por
  payload do frontend.

## Contratos

- `GET /domain-integrations/flow/boards`;
- `POST /domain-integrations/juridico/pje/comunicacoes/:id/export-flow`;
- `POST /domain-integrations/juridico/datajud/processos/:snapshotId/export-flow`;
- `GET /domain-integrations/flow/cards/:cardId/monitoramento`;
- `POST /domain-integrations/flow/cards/:cardId/monitoramento`;
- `PATCH /domain-integrations/flow/cards/:cardId/monitoramento/cadencia`, apos
  transporte e validacao do incremento dependente.
- `GET/POST /domain-integrations/flow/cards/:cardId/peticoes/monitoramento`
  (Sprint 2 de flow-card-actions).
- `GET /domain-integrations/flow/process-imports/options`,
  `POST .../process-imports/preview`, `POST .../process-imports`,
  `GET .../process-imports/:importId`, `POST .../process-imports/:importId/resume`.

## Regras De Negocio

- A camada de integracao nunca recebe `client_id`, `database_ref` ou
  `boardColumnId` do frontend.
- Cliente sem Flow contratado nao pode exportar, mesmo que tenha Juridico.
- Usuario precisa ter entitlement/scopes efetivos e acesso ao registro de
  origem e ao board destino.
- Identificador UUID nunca substitui autorizacao de recurso.
- Coluna destino e sempre a coluna padrao do board.
- O adapter concreto decide como transformar dados do dominio em titulo,
  descricao e payload de origem do card.
- Exportacao da mesma origem para o mesmo board deve ser idempotente: retornar o
  card existente quando a referencia externa ja existir.
- Falha entre bancos nao pode ser reportada como sucesso integral; retry deve
  recuperar a operacao sem duplicar o recurso de destino.
- Exportacao exige `officeId` (2026-10-16): o card do Flow sempre tem
  escritorio; a regra e a do Kanban (`CardOfficePolicy`), e
  `GET /domain-integrations/flow/boards` devolve os escritorios permitidos.
- Monitoramento DataJud pelo card (`GET/POST .../monitoramento`,
  `PATCH .../cadencia`) aplica a visibilidade do Flow (B8, 2026-10-16): ler exige
  enxergar o card (membro do quadro + escritorio, `CardVisibilityService`);
  alterar exige `board_admin`/`board_member`; card fora do alcance ou de outro
  banco do Flow responde 404.
- Card de monitoramento de peticao (Sprint 2 de flow-card-actions, 2026-11-06):
  o Kanban cria o card (`PetitionMonitoringService`); este modulo garante o
  acompanhamento DataJud diario (`DataJudMonitorService.ensureActive`, que
  reaproveita e reinicia o existente) e grava o vinculo em
  `juridico_data_flow_exports` com `origin = 'flow_petition'` e `snapshot_id`
  nulo. Um card por numero CNJ no tenant: vinculo existente de outro card
  responde 409 com o link, antes de criar o card. O export DataJud recusa
  processo que ja tem card de peticao. Exige `juridico:read`.
- Importacao de processos por planilha (2026-11-06): conferencia sem gravar e
  lote em fila BullMQ (`flow-process-import`, concorrencia 1, payload so com
  ids). O job reautoriza pelo usuario que importou; por linha, o Kanban cria
  cliente/card e este modulo garante o monitor diario e o vinculo
  `origin = 'flow_import'` (migration 121). Um card por numero CNJ no tenant,
  conferido no Flow e no Juridico; o export DataJud recusa processo com card
  importado.

## Fronteiras

- Nao importar componentes de frontend entre modulos.
- Nao criar chamada direta de UI Juridico para client interno de Kanban.
- Nao duplicar regra de permissao do Kanban no Juridico.
- Nao confiar no application context chamador como contexto de todos os
  dominios participantes.
- Nao concentrar adapters, mappers, monitoramento e subscribers em um unico
  service.
- Nao criar microservico separado sem novo Stack Fit Gate.

## Validacoes

- Testes unitarios/servico para adapter Juridico -> Flow.
- Testes de repository/service para coluna padrao do board.
- Testes de autorizacao para cliente sem Flow contratado.
- Testes negativos de tenant, scopes, entitlement, board membership e
  `database_ref` cross-domain.
- Testes de retry/falha parcial sem duplicacao.
- `make code-up TARGET=kanban` ou target equivalente antes de testes.
- Testes/type-check/build dentro do container do projeto.
- `make ai-api-graph-gate`, `make ai-architecture-graph-gate` e
  `make ai-conformance` no fechamento.

## Prioridade Ativa

Por decisao humana de 2026-10-06, executar H1-H5 de
`docs/product/domain-integrations-hardening-sprints.md` antes de novos adapters
de produto, salvo ordem humana em contrario.
