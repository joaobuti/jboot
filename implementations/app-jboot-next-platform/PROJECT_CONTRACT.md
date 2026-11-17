# Project Contract: app-jboot-next-platform

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: frontend modular; fluxo Checkout Pix do PDV testado; typecheck, testes e build aprovados
last_status_review: 2026-10-05
```

Projeto alvo para frontend web modular em Next.js, criado apos ADR 003.

## Stack

- React
- Next.js
- TypeScript
- Template compativel: `implementations/templates/original/Next-TS`

## Responsabilidade

Frontend web platform para produtos JBoot com stack Next.js/React/TypeScript, compartilhando shell, layout, design tokens, autorizacao visual, clients HTTP e navegacao por modulos.

`platform` e shell tecnico. O usuario nunca deve operar em contexto generico `platform`; ele opera em contexto de modulo selecionado pelo Identity, como `pdv` ou `juridico`.

## Agents Globais

- `agents/frontend-next-typescript.md`
- `agents/platform-layout.md`
- `agents/backend-contract-client.md`

## Skills Globais

- `skills/next-module-pattern.md`
- `skills/platform-design-system.md`
- `skills/platform-crud-ui.md`
- `skills/api-client.md`

## Modulos

| Modulo | Contrato |
|---|---|
| `modules/pdv` | `modules/pdv/MODULE_CONTRACT.md` |
| `modules/juridico` | `modules/juridico/MODULE_CONTRACT.md` |
| `modules/comanda` | `modules/comanda/MODULE_CONTRACT.md` |
| `modules/kanban` | `modules/kanban/MODULE_CONTRACT.md` |

## Padrao De Permissao E Navegacao

- Cada modulo hospedado no Platform deve existir como `application` propria no Identity.
- A selecao pos-login lista os modulos contratados, nao o shell `platform`.
- O `launchUrl` do modulo aponta para uma rota deste app.
- O menu principal deve ser derivado do `application_slug` selecionado e exibir apenas menus do modulo atual.
- A web apenas reflete o contexto emitido pelo Identity; permissoes efetivas continuam nos BFFs dos modulos.

## Ativacao Obrigatoria

Antes de qualquer codigo neste projeto, declarar:

```text
Agent Activation:
  project: implementations/app-jboot-next-platform
  module: modules/<module> | none
  using_agent:
    - implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
    - implementations/app-jboot-next-platform/agents/platform-layout.md
    - implementations/app-jboot-next-platform/agents/backend-contract-client.md
    - implementations/app-jboot-next-platform/modules/<module>/agents/<agent>.md
  using_skill:
    - implementations/app-jboot-next-platform/skills/next-module-pattern.md
    - implementations/app-jboot-next-platform/skills/platform-design-system.md
    - implementations/app-jboot-next-platform/skills/platform-crud-ui.md # quando houver CRUD administrativo
    - implementations/app-jboot-next-platform/skills/api-client.md
    - implementations/app-jboot-next-platform/modules/<module>/skills/<skill>.md
```

Se o bloco nao for mostrado ao usuario antes da implementacao, a execucao nao e aderente ao contrato.

## Entrypoints Planejados

- `src/app/*`
- `src/layouts/*`
- `src/lib/platform-api.ts`
- `src/modules/<module>/*`
- Telas publicas de conta (`/login`, criar senha, esqueci minha senha):
  `docs/product/account-access-email-sprints.md` (S2–S3).

## Restricoes

- Nao editar `implementations/templates/original/Next-TS`.
- Reutilizar template apenas por copia derivada.
- Nao duplicar autorizacao de backend; web apenas reflete permissao/contexto.
- Clients HTTP devem ser tipados.
- Modulos nao devem importar componentes internos de outro modulo sem contrato.
- Nao adicionar card, menu ou regra de acesso para `platform` como produto selecionavel.

## Validacao

Quando houver codigo:

```bash
npm run type-check
npm run build
```

## Desenvolvimento Local

- Porta padrao: `3002`.
- O Identity Admin fica em `3000` e deve poder rodar simultaneamente.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:platform`
  - purpose: desenvolvimento do shell Platform e menus modulares.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `rabbitmq`, `temporal`, `minio`, `otel-collector` quando modulo exigir.
    - forbidden_by_default: `mongodb`, `redpanda`, `clickhouse`, `qdrant`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
    - optional: BFFs/workers de modulo quando a feature justificar.
    - forbidden_by_default: apps mobile e workers nao relacionados.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: Identity API, Platform API e abertura de `http://localhost:3002`.
  - seed_dependencies: seeds Identity/Platform conforme modulo selecionado.
  - expected_resource_profile: medio por causa de dois Next dev servers.

- target: `code-up:juridico`
  - purpose: login e navegacao do modulo Juridico em `/juridico`.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `temporal`, `rabbitmq`, `otel-collector` quando automacao juridica exigir.
    - forbidden_by_default: `mongodb`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`, `juridico-worker`.
    - optional: BFF Juridico standalone somente para migracao/diagnostico explicito.
    - forbidden_by_default: workers nao relacionados.
  - python_runtime: `juridico-worker` roda dentro do container `jboot` em `implementations/wrk-jboot-juridico` usando `.venv/bin/python -m src.workers.main`.
  - ports: `3000`, `3002`, `8000`, `8010`, `8020`, `5432`.
  - healthchecks: Identity API, Platform API, Worker API e abertura de `http://localhost:3002/juridico`.
  - seed_dependencies: seed do Identity para `juridico`.
  - expected_resource_profile: medio-alto por incluir worker Python/Temporal do Juridico.

- target: `code-up:pdv`
  - purpose: login, navegacao do modulo PDV e Checkout PIX integrado em `/pdv`.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `minio` quando cadastro de produto usar upload de imagem.
    - optional: `rabbitmq` quando sync/offline/eventos exigirem.
    - forbidden_by_default: `mongodb`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`, `payments-api`, `payments-worker`.
    - optional: PDV legacy BFF somente para migracao/comparacao.
    - forbidden_by_default: app mobile, workers nao relacionados.
  - ports: `3000`, `3002`, `8000`, `8010`, `8040`, `5432`.
  - healthchecks: Identity API, Platform API, Payments API e abertura de `http://localhost:3002/pdv`.
  - seed_dependencies: seed do Identity para `pdv`, schema PDV e migrations do Payments.
  - expected_resource_profile: medio; nao deve iniciar app mobile/offline sync.

### Rules

- `make code-up TARGET=<target>` e o fluxo recomendado para codar.
- `make code-down TARGET=<target>` para processos do target sem parar containers.
- `make code-restart TARGET=<target>` equivale a `code-down` seguido de `code-up`.
- `make dev-up` deve ser tratado como legado/full ate a separacao completa por profiles Docker.
