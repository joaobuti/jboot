# Project Contract: bff-jboot-platform

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: codigo NestJS modular; integracao PDV-Payments testada; suites automatizadas versionadas
last_status_review: 2026-10-05
```

Projeto alvo para backend modular monolith de produtos JBoot, criado apos ADR 003.

## Stack

- Node.js 24
- TypeScript
- NestJS
- PostgreSQL multi-tenant com estratégia por módulo
- Redis/Valkey para cache, locks, rate limit e estado efemero
- RabbitMQ quando eventos/comandos assincronos justificarem
- Temporal quando workflows duraveis justificarem

## Responsabilidade

Backend platform para produtos web/backend que compartilham autenticacao, tenant context, autorizacao, observabilidade, validacao e padroes NestJS.

O Identity Hub permanece separado.

## Agents Globais

- `agents/backend-node-typescript.md`: padrao NestJS/TypeScript da platform.
- `agents/platform-auth-context.md`: consumo do JWT do Identity Hub, tenant context, scopes e roles.
- `agents/platform-postgres.md`: padrao PostgreSQL multi-tenant por estrategia do modulo.

## Skills Globais

- `skills/nest-module-pattern.md`
- `skills/tenant-context.md`
- `skills/api-contract.md`

## Modulos

| Modulo | Contrato |
|---|---|
| `modules/pdv` | `modules/pdv/MODULE_CONTRACT.md` |
| `modules/juridico` | `modules/juridico/MODULE_CONTRACT.md` |
| `modules/catalog` | `modules/catalog/MODULE_CONTRACT.md` |
| `modules/comanda` | `modules/comanda/MODULE_CONTRACT.md` |
| `modules/establishment-customers` | `modules/establishment-customers/MODULE_CONTRACT.md` |
| `modules/domain-integrations` | `modules/domain-integrations/MODULE_CONTRACT.md` |
| `modules/platform-files` | `modules/platform-files/MODULE_CONTRACT.md` |
| `modules/kanban` | `modules/kanban/MODULE_CONTRACT.md` |

## Ativacao Obrigatoria

Antes de qualquer codigo neste projeto, declarar:

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/<module> | none
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
    - implementations/bff-jboot-platform/modules/<module>/agents/<agent>.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - implementations/bff-jboot-platform/modules/<module>/skills/<skill>.md
```

Se o bloco nao for mostrado ao usuario antes da implementacao, a execucao nao e aderente ao contrato.

## Entrypoints Planejados

- `src/main.ts`
- `src/app.module.ts`
- `src/platform/auth-context/*`
- `src/platform/database/*`
- `src/platform/audit/*`
- `src/modules/<module>/*`
- `docker/postgres/init/*`

## Contratos

- E-mail do sistema, convite e recuperacao de senha:
  `docs/product/account-access-email-sprints.md` (S1–S3).
- Identity Hub -> Platform:
  - validar JWT emitido pelo `bff-jboot-identity`;
  - exigir `client_id`, `application_id`, `database_ref`, roles/scopes;
  - nao autenticar CPF/CNPJ diretamente.
- Platform -> Web:
  - OpenAPI por modulo.
- Platform -> Servicos externos:
  - contratos dedicados por modulo.

## Regras Multi-Tenant

- Todas as tabelas de negocio devem ter `client_id`.
- Toda query de negocio deve filtrar por `client_id` do JWT/contexto.
- `pdv` usa `shared_db`: um banco compartilhado e isolamento logico por `client_id`.
- `juridico` usa `dedicated_database`: um banco fisico por cliente, mantendo `client_id` em todas as tabelas para auditoria e defesa operacional.
- Modulos com `dedicated_database` devem resolver a conexao exclusivamente por `database_ref` emitido pelo Identity.
- IDs devem usar UUID.
- Modulos nao acessam tabelas de outros modulos diretamente sem contrato interno explicito.

## Validacao

Quando houver codigo:

```bash
npm run lint
npm run typecheck
npm run build
```

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:platform`
  - purpose: desenvolvimento do BFF Platform com Identity e web Platform.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `rabbitmq`, `temporal`, `minio`, `otel-collector`.
    - forbidden_by_default: `mongodb`, `redpanda`, `clickhouse`, `qdrant`.
  - app_processes:
    - required: `identity-api` em `8000`, `identity-admin` em `3000`, `platform-api` em `8010`, `platform-web` em `3002`.
    - optional: BFFs/workers de modulo quando a feature justificar.
    - forbidden_by_default: apps mobile, workers nao relacionados.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET http://localhost:8000/health`, `GET http://localhost:8010/health`.
  - seed_dependencies: seeds Identity, Platform, PDV/Juridico quando o modulo exigir database refs.
  - expected_resource_profile: medio; dois watchers NestJS, dois Next dev servers e PostgreSQL.

- target: `code-up:juridico`
  - purpose: login, selecao e shell do modulo Juridico dentro da Platform.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `temporal`, `rabbitmq`, `otel-collector` quando workflows/scraping exigirem.
    - forbidden_by_default: `mongodb`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
    - optional: BFF Juridico standalone somente para migracao/diagnostico explicito.
    - forbidden_by_default: workers de scraping.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: Identity e Platform APIs.
  - seed_dependencies: `010_identity_juridico_dev_seed.sql` e database refs relacionados.
  - expected_resource_profile: medio; nao deve iniciar stack de automacao/scraping.

- target: `code-up:pdv`
  - purpose: login, selecao, admin online e Checkout PIX integrado do modulo PDV dentro da Platform.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `minio` quando cadastro de produto usar upload de imagem.
    - optional: `rabbitmq` quando sync/offline/eventos exigirem.
    - forbidden_by_default: `mongodb`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`, `payments-api`, `payments-worker`.
    - optional: PDV legacy BFF somente para migracao/comparacao.
    - forbidden_by_default: app mobile, workers nao relacionados.
  - ports: `3000`, `3002`, `8000`, `8010`, `8040`, `5432`.
  - healthchecks: Identity, Platform e Payments APIs.
  - seed_dependencies: seeds Identity/PDV, `006_pdv.sql` e migrations do Payments.
  - expected_resource_profile: medio; nao deve iniciar mobile/offline sync por padrao.

### Rules

- `code-up` e o caminho minimo de desenvolvimento.
- `code-down:<target>` para processos do target sem parar containers.
- `code-restart:<target>` equivale a `code-down:<target>` seguido de `code-up:<target>`.
- `dev-up` permanece legado/full enquanto a infra global nao for perfilada.
- Servicos pesados so podem entrar no target minimo se estiverem justificados no contrato do modulo.

## Restricoes

- Nao misturar autenticacao global dentro da platform.
- Nao colocar regra fiscal regulada dentro da platform.
- Nao criar controller/service/repository generico para dominios diferentes.
- Controller orquestra HTTP; service aplica regra; repository acessa SQL.
- Modulo nao deve depender de outro modulo por acesso direto a banco.

## Riscos Conhecidos

- Modular monolith exige fronteiras fortes.
- Deploy da platform afeta todos os modulos.
- Modulos com escala ou risco proprio podem precisar ser extraidos.
