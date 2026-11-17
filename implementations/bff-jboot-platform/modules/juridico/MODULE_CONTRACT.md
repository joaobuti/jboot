# Module Contract: bff-jboot-platform/modules/juridico

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: modulo NestJS com facade DataJud, JWT s2s, auditoria HMAC tenant-aware e suites automatizadas aprovadas
last_status_review: 2026-08-27
```

Contrato criado para o modulo Juridico dentro da Platform. A implementacao runtime deve viver em `src/modules/juridico`.

## Responsabilidade

API do modulo Juridico para captação, credenciais, consultas, acompanhamentos, auditoria e integracao com workers/Temporal.

## Agents Do Modulo

- `agents/juridico-domain.md` quando existir agent especifico do modulo; ate la, usar os agents globais do projeto.

## Skills Do Modulo

- `skills/juridico-api.md` quando existir skill especifica do modulo; ate la, usar as skills globais do projeto.

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/bff-jboot-platform`.

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/juridico
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
```

## Fonte De Verdade

- `implementations/bff-jboot-platform/modules/juridico/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/juridico/AI_CONTEXT.md`
- `docs/architecture/decisions/004-jboot-juridico.md`
- `docs/architecture/decisions/009-juridico-official-data-service.md`
- `docs/product/juridico-official-data-sprints.md`
- `docs/product/juridico-official-data-sprint-1-gate.md`
 - `docs/product/juridico-official-data-sprint-2-gate.md`
 - `docs/product/juridico-official-data-sprint-3-gate.md`
- `docs/api/juridico-data-sprint-1-bff-openapi.yaml`
- `docs/api/juridico-data-sprint-1-service-openapi.yaml`
- `docs/data/juridico-data-sprint-1-data-model.md`
- `docs/product/domain-flow-integration-sprints.md`
- `docs/product/domain-flow-integration-sprint-1-gate.md`
- `docs/data/domain-flow-integration-sprint-1-data-model.md`
- `docs/api/domain-flow-integration-sprint-1-openapi.yaml`
- `docs/product/juridico-datajud-flow-sprints.md`

## Banco De Dados

- Estrategia obrigatoria: `dedicated_database`.
- Cada cliente possui um banco fisico proprio para dados juridicos.
- Todas as tabelas de negocio mantem `client_id` mesmo em banco dedicado.
- O banco deve ser resolvido somente via `database_ref` emitido pelo Identity.
- Nao inferir banco por parametro de request, subdominio, slug ou payload.

## Regras Multi-Tenant

- Toda query deve filtrar por `client_id` do contexto autenticado.
- Credenciais e dados de processos de clientes diferentes nunca compartilham o mesmo banco juridico.
- Operacoes administrativas devem registrar `client_id`, `identity_id`, `database_ref` e evento auditavel.

## Contratos

- JWT vem do `bff-jboot-identity`.
- Scopes esperados: `juridico:read`, `juridico:write`, `juridico:admin`.
- Workers nao acessam banco diretamente; recebem payload seguro do BFF.

## Portal PJe/DJEN

Rotas sob `juridico/pje` (guard `JuridicoAuthGuard`, scope `juridico:read`):

| Metodo | Rota | Uso |
|---|---|---|
| GET | `juridico/pje/config` | Configuracao de monitoramento do tenant |
| PUT | `juridico/pje/config` | Define filtro (OAB+UF, advogado, parte ou tribunais) e janela |
| GET | `juridico/pje/resumo` | Total capturado e ultima disponibilizacao |
| GET | `juridico/pje/comunicacoes` | Listagem paginada com filtros |
| GET | `juridico/pje/comunicacoes/:id` | Teor completo de uma comunicacao |
| POST | `juridico/pje/sync` | Dispara sincronizacao no worker |
| GET | `juridico/pje/sync/active` | Job ativo ou ultimo job |
| GET | `juridico/pje/sync/:jobId` | Status do job |
| POST | `juridico/pje/sync/:jobId/cancel` | Cancela job em andamento |
| GET | `juridico/pje/tribunais` | Proxy do catalogo de tribunais do CNJ |

Regras:

- A consulta DJEN e publica: o BFF nao envia credenciais ao worker nesse fluxo.
- A credencial do portal `pje` e opcional, fica cifrada em `juridico_portal_credentials` e existe
  apenas para escopos autenticados futuros (endpoints exclusivos de tribunais).
- Erro 4xx do worker e regra de negocio e deve chegar ao usuario com o status original;
  somente falha de transporte ou 5xx vira `503`.
- Tabelas: `juridico_pje_monitoring_configs`, `juridico_pje_comunicacoes`, `juridico_pje_sync_jobs`
  (`docker/postgres/init/037_juridico_pje_comunicacoes.sql`).

## Dados Juridicos Oficiais / DataJud

Integracao planejada e aprovada em 2026-08-27 para a Sprint 1 descrita em
`docs/product/juridico-official-data-sprints.md`.

Fronteira:

- o frontend consome somente o BFF;
- o BFF exige `juridico:read`, resolve `client_id`/`database_ref`, emite token
  s2s e chama `svc-jboot-juridico-data`;
- o JWT do usuario nao e encaminhado ao servico;
- a Sprint 1 persiste apenas auditoria HMAC no banco dedicado, nunca o payload
  integral do processo;
- `client_id`, `database_ref`, URL, host ou indice DataJud sao proibidos no
  payload de produto;
- contratos: `docs/api/juridico-data-sprint-1-bff-openapi.yaml` e
  `docs/api/juridico-data-sprint-1-service-openapi.yaml`.

Rotas funcionais sob o guard `JuridicoAuthGuard`:

| Metodo | Rota | Uso |
|---|---|---|
| GET | `juridico/datajud/tribunais` | Catalogo allowlisted para a UI |
| POST | `juridico/datajud/processos/consulta` | Consulta manual por numero CNJ |

MCP, prazo, DJe autenticado e providers comerciais permanecem fora do escopo
atual.

## Monitoramento DataJud — Sprint 2 Funcional

- o BFF e owner exclusivo de `juridico_data_monitors`, snapshots, diffs,
  retencao e purga no banco dedicado;
- o worker Temporal chama somente a rota interna contratada em
  `docs/api/juridico-data-sprint-2-worker-openapi.yaml`, por JWT S2S com
  `aud=svc:platform-api` e caller `juridico-worker`;
- o BFF continua sendo o unico caller de `svc-jboot-juridico-data`;
- contratos de produto, dados e gate estao em `docs/api/juridico-data-sprint-2-bff-openapi.yaml`,
  `docs/data/juridico-data-sprint-2-data-model.md` e
  `docs/product/juridico-official-data-sprint-2-gate.md`.

## Acompanhamento De Processos — ADR 021

Desde a Sprint 2 de `docs/product/process-monitoring-sprints.md` (concluida em
2026-11-08), o acompanhamento DataJud (monitores, execucoes, retratos,
movimentacoes, eventos e retencao) e da capacidade `monitoramento-processual`,
modulo `modules/process-monitoring`, banco `jboot_process_monitoring`. A tela
Acompanhamentos usa a capacidade com destino `juridico`; as rotas
`juridico/datajud/acompanhamentos` mantem contrato e formato. Criar ou retomar
exige a capacidade contratada pelo cliente. A consulta manual (snapshot
`manual_query`) e sua purga continuam neste modulo. A secao "Monitoramento
DataJud" acima descreve o desenho anterior e vale como historico.

## Decisoes De Contexto E Operacao

- Endpoints vinculados a um portal especifico devem tratar o portal como contexto implicito da rota/servico.
- Nao exigir nem propagar selecao explicita de portal quando a rota ja determina o portal, por exemplo fluxos sob `juridico/eproc`.
- Se a operacao for multiportal, isso deve aparecer no desenho da rota/servico e no contrato de entrada de forma explicita.
- Consulta manual em rota de portal especifico pode aceitar CPF e filtros, mas nao deve reinterpretar o portal informado pelo usuario para executar outro adapter.
- Quando faltar contexto de negocio, UX, seguranca ou persistencia, nao inferir silenciosamente; pedir validacao do usuario e registrar a decisao no contrato ou documento de sprint.

## Integracao Juridico -> Flow

A partir de `docs/product/domain-flow-integration-sprint-1-gate.md`, registros
juridicos podem ser exportados para cards do Flow por meio do modulo interno
`modules/domain-integrations`. O Juridico continua dono dos dados de origem; a
integracao valida acesso ao registro e delega a criacao do card ao dominio
Flow/Kanban, usando a coluna padrao do board selecionado.

O card exportado e copia, nao referencia: titulo, descricao e `source_payload`
sao gravados no banco do Flow, e o modulo `kanban` nao le o banco do juridico. O
Flow e o dono do dado permanente do cliente.

`docs/product/juridico-datajud-flow-sprints.md` (escopo confirmado em
2026-09-09, sprints 5-7 pendentes) estende essa integracao para o DataJud, com
metodo de export proprio, snapshot `manual_query` como origem, retencao de 180
dias no juridico e monitoramento marcado pelo card. Regras que valem desde ja:

- dados de origem de um card sao imutaveis; mudanca de estado do processo entra
  como `system_event` na linha do tempo, nunca reescrevendo o card;
- o baseline de comparacao vive no juridico apenas enquanto o monitoramento
  estiver ativo;
- todo export deve gravar auditoria em `juridico_audit_events`. O exportador
  PJe hoje nao grava, divergindo de
  `docs/product/domain-flow-integration-sprints.md`; a correcao esta na
  Sprint 6.
