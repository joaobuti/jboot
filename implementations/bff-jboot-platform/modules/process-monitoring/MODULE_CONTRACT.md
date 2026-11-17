# Module Contract: bff-jboot-platform/modules/process-monitoring

## Status

```yaml
lifecycle_status: in_progress
production_readiness: not_assessed
status_evidence: Sprints 1 a 3 concluidas em 2026-11-08; Juridico e Flow usam a capacidade e o Flow nao depende do Juridico; migracao validada no banco local; sem teste ponta a ponta com Temporal/DataJud reais
last_status_review: 2026-11-08
```

Modulo interno da Platform backend. A implementacao runtime deve viver em
`src/modules/process-monitoring`.

## Responsabilidade

Acompanhar processos judiciais no DataJud como capacidade independente
(`monitoramento-processual`), usada pelo Juridico e pelo Flow sem que um
dependa do outro. E dono do registro de acompanhamentos, execucoes, retratos,
movimentacoes, eventos e retencao, no banco exclusivo
`jboot_process_monitoring`.

Este modulo **nao e application Identity**: nao aparece no seletor pos-login e
nao tem entitlement por usuario. O cliente contrata a capacidade em
`client_capabilities`. Quem pode pedir acompanhamento e decidido pelo produto
chamador.

## Fronteiras

- Nao importa codigo de `juridico`, `kanban` nem `domain-integrations`.
- Produtos usam a interface publica `ProcessMonitoringService`.
- Movimentacoes novas sao entregues so ao destino atual por adaptadores
  registrados no bootstrap (`juridico`, `flow`).
- Consulta ao DataJud e ao DJEN somente via `svc-jboot-juridico-data` (sem estado).
- Publicacoes do DJEN (ADR 022): capacidade `publicacoes-processuais`, dependente
  desta; texto puro cifrado, nunca o HTML do provedor.
- O worker `wrk-jboot-juridico` agenda e dispara a rota interna S2S; nao acessa
  banco nem DataJud. As consultas passam pela fila Temporal `process-monitoring`,
  uma por vez e com ritmo limitado (Sprint 4).

## Regras

- Um acompanhamento fora de `deleted` por `(client_id, process_number_hmac)`.
- Toda tabela tem `client_id`; toda consulta filtra por ele.
- Numero do processo cifrado; comparacao so por HMAC.
- `origin_product` e `destination_product` em `juridico` ou `flow`;
  `destination_ref` em jsonb com a referencia no produto de destino.
- Criar ou retomar exige `monitoramento-processual` habilitada; ler e listar
  o que ja existe nao exige.
- Execucao idempotente por chave do workflow.

## Ativacao Obrigatoria

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/process-monitoring
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - docs/skills/dev-runtime-profile/SKILL.md
```

## Contratos Obrigatorios

- `implementations/bff-jboot-platform/modules/process-monitoring/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/process-monitoring/AI_CONTEXT.md`
- `docs/architecture/decisions/021-process-monitoring-capability.md`
- `docs/architecture/decisions/022-process-publications-capability.md`
- `docs/product/process-monitoring-sprints.md` (S1, S2 e S3 `concluida`; S4 `concluida`: fila das consultas, limite de 60 s e ultima consulta no card; S5 `concluida`: movimentacoes do processo no card; S6 `concluida`: complemento no texto da movimentacao; S7 `concluida`: fontes separadas e DJEN; S8 `concluida`: gatilho de automacao do DJEN; S9 `concluida`: Ver no DJEN e data de ajuizamento)
- `docs/architecture/decisions/009-juridico-official-data-service.md`
- `docs/architecture/decisions/010-juridico-data-monitoring.md`
- `docs/architecture/decisions/006-client-capabilities.md`
- `docs/api/process-monitoring-worker-openapi.yaml` (rotas internas S2S do worker)

## Banco De Dados

- Banco: `jboot_process_monitoring`, unico, separado por `client_id`.
- Conexao: `JBOOT_PROCESS_MONITORING_DATABASE_URL` (padrao derivado de
  `DATABASE_URL`).
- Migracoes em `docker/postgres/init/`, idempotentes.
- Chaves de cifra e HMAC compartilhadas com o Juridico na migracao.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `make code-up TARGET=juridico`
  - purpose: acompanhamento pela tela do Juridico (cenario 1)
  - containers:
    - required: postgres, temporal
    - optional: otel-collector
    - forbidden_by_default: clickhouse, qdrant, redpanda
  - app_processes:
    - required: identity-api, platform-api, platform-web, juridico-worker, juridico-data-service
    - optional: nenhum
    - forbidden_by_default: nenhum
  - ports: 8010 (platform-api), 8020 (juridico-worker), 8030 (juridico-data-service)
  - healthchecks: platform-api `/health`; worker API `/health`
  - env do worker: `JBOOT_PROCESS_MONITORING_MAX_CONCURRENCY` (padrao 1) e
    `JBOOT_PROCESS_MONITORING_RATE_PER_SECOND` (padrao 1) para a fila
    `process-monitoring`; `JBOOT_PROCESS_PUBLICATIONS_MAX_CONCURRENCY` (padrao 1)
    e `JBOOT_PROCESS_PUBLICATIONS_RATE_PER_SECOND` (padrao 2) para a fila
    `process-publications` (DJEN, ADR 022)
  - seed: `docker/postgres/init/128_process_monitoring_snapshot_details.sql` (dados do
    processo no retrato, Sprint 9) e `docker/postgres/init/126_process_monitoring_sources_publications.sql`
    (fontes por acompanhamento, publicacoes, capacidade `publicacoes-processuais`)
  - seed_dependencies: init do banco `jboot_process_monitoring`; capacidade em
    `capability_registry` e `client_capabilities` dos clientes JBoot e Demo JBoot
  - expected_resource_profile: Temporal e o unico container pesado

- target: `make code-up TARGET=kanban-monitoring` (Sprint 3)
  - purpose: acompanhamento pelo Flow sem Juridico (cenario 2)
  - containers:
    - required: postgres, valkey, jboot, jboot-fiscal, temporal
    - optional: otel-collector, mailpit
    - forbidden_by_default: mongodb, rabbitmq, redpanda, minio, clickhouse, qdrant, temporal-ui, gotenberg
  - app_processes:
    - required: identity-api, identity-admin, platform-api, platform-web, juridico-worker, juridico-data-service
    - optional: nenhum
    - forbidden_by_default: nenhum
  - ports: 8000, 3000, 8010, 3002, 8020, 8030
  - healthchecks: platform-api `/health`; juridico-data-service `/health`
  - seed_dependencies: mesmos do target `juridico`
  - expected_resource_profile: Temporal e o unico container pesado

- target: `make code-up TARGET=kanban`
  - purpose: Flow sem acompanhamento rodando; o Monitorar cria o acompanhamento, mas sem worker ele nao executa
  - containers e processos: os do target `kanban` (sem Temporal, worker e servico de dados)

### Rules

- Full stack somente via target `full`.
- Temporal, worker e servico de dados ficam fora do target `kanban`; quem precisa do acompanhamento usa `kanban-monitoring`.
- O banco `jboot_process_monitoring` sobe com o Postgres em qualquer target.
