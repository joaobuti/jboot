# Project Contract: bff-jboot-identity

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: API NestJS, migrations/seeds e suites automatizadas versionadas
last_status_review: 2026-10-14
```

## Stack

- Node.js 24
- TypeScript
- NestJS
- PostgreSQL `jboot_identity`

## Responsabilidade

Backend do Identity Hub: autenticacao, JWT, admin APIs, onboarding de cliente, contratos cliente/app, memberships, entitlements, database refs e auditoria.

## Agents

- `agents/backend-node-typescript.md`: executor principal do backend NestJS.
- `agents/postgres-identity.md`: modelo relacional, databases, database refs, contratos e auditoria.
- Referencias globais opcionais:
  - `docs/agents/stacks/data-analytics.md` quando envolver auditoria/telemetria.
  - `docs/agents/stacks/platform-temporal.md` quando provisionamento assincrono de databases dedicados for implementado.
  - `docs/agents/stacks/platform-redis-valkey.md` quando rate limit, nonce ou sessoes efemeras forem implementados.

## Skills

- `skills/crud-jboot-identity.md`
- `skills/identity-onboarding.md`
- Referencias globais opcionais:
  - `contract-first-api` quando OpenAPI/contratos forem alterados de forma relevante.
  - `agent-review` quando agentes/skills/fluxos forem alterados.

## Entrypoints

- `src/main.ts`
- `src/app.module.ts`
- `src/auth/*`
- `src/admin/*`
- `src/oauth/*` (authorization server do conector Claude do Flow)
- `src/database/database.service.ts`
- `docker/postgres/init/*identity*.sql`

## Contratos

- E-mail do sistema, convite e recuperacao de senha:
  `docs/product/account-access-email-sprints.md` (S1–S3).
- Planejamento cross-project de permissoes por modulo e gateway BYOK:
  `docs/product/kanban-sprint-10-12-gate.md` (nenhum codigo autorizado enquanto
  os bloqueios do gate permanecerem abertos).
- OpenAPI: `GET /docs`
- Health: `GET /health`
- Auth:
  - `POST /auth/login`
  - `POST /auth/context`
  - `POST /auth/password/check`, `POST /auth/password/set`,
    `POST /auth/password/forgot` — publicos; link de uso unico de criar ou
    redefinir senha (convite 72 h, recuperacao 1 h, so o hash no banco);
    "esqueci" responde sempre 202 igual
    (`docs/product/account-access-email-sprints.md`)
  - `POST /admin/identities/:id/invite` — reenvia o convite (conta `pending`)
  - `GET /admin/clients/:clientId/databases`, `POST .../:applicationId/apply-rule`,
    `GET|POST /admin/applications/:applicationId/client-databases[/apply-rule]` —
    banco de cada modulo do cliente x regra do app; aplicar corrige o proprio registro
    (mesmo id) e recusa cliente ativo em outro banco
    (`docs/product/tenant-isolation-sprints.md`, Sprint 0)
  - `POST /admin/clients/:clientId/admin-access` — admin do cliente recebe o pacote de admin
    (catalogo, `client_admin_default`) em todos os modulos contratados; o mesmo acontece no
    cadastro e ao contratar/reativar modulo (Sprint 0.1)
  - E-mail do sistema: `MailService` (nodemailer) com `SMTP_HOST`,
    `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; links
    para `JBOOT_IDENTITY_WEB_URL`; atras de proxy reverso definir
    `JBOOT_IDENTITY_TRUST_PROXY` (saltos), senao o limite por IP vale para
    todos juntos
  - `POST /auth/service-token` — emissao curta e allowlisted para
    `platform-api -> svc:juridico-data|svc:payments|svc:ai-gateway|svc:identity-oauth` e
    `juridico-worker -> svc:platform-api`; credencial somente por ambiente
- Conector Claude do Flow (authorization server OAuth 2.1; plano
  `docs/product/kanban-claude-connector-sprints.md`, contrato
  `docs/api/kanban-claude-connector-openapi.yaml`, runbook
  `docs/runbooks/flow-claude-connector.md`):
  - protocolo pelos handlers do `@modelcontextprotocol/sdk`:
    `GET /.well-known/oauth-authorization-server`, `GET /oauth/authorize`,
    `POST /oauth/token`, `POST /oauth/revoke`;
  - clientes so por CIMD de host allowlisted (`claude.ai`), sem DCR; PKCE S256;
    redirect claude.ai ou loopback; tokens opacos (hash SHA-256 no banco),
    refresh rotacionado e reuso revoga a conexao;
  - JSON com JWT de usuario Flow: `GET /oauth/requests/:id`,
    `POST /oauth/requests/:id/decision`, `GET /oauth/grants`,
    `DELETE /oauth/grants/:id`;
  - `POST /oauth/introspect` somente para `platform-api` com token s2s
    `svc:identity-oauth` (adicionada a allowlist de `POST /auth/service-token`);
  - tabelas `oauth_authorization_requests`, `oauth_grants`,
    `oauth_authorization_codes`, `oauth_tokens`
    (`docker/postgres/init/081_identity_oauth_connector.sql`).
- Admin exige JWT com:

```text
role: global_admin
scope: identity:admin
```

## Modelo Operacional

- `identities`: usuarios globais.
- `credentials`: credenciais dos usuarios.
- `clients`: clientes/tenants.
- `applications`: apps/servicos. Produtos standalone e modulos do Platform sao applications selecionaveis; o shell tecnico `platform` nao e permissao de usuario.
- `databases`: catalogo de databases disponiveis.
- `application_databases`: regra app -> database/estrategia.
- `client_applications`: contrato cliente/app.
- `memberships`: usuario pertence ao cliente.
- `entitlements`: usuario pode acessar app naquele cliente.
- `database_refs`: materializacao do database/schema por cliente/app.
- `session_contexts`: contexto JWT emitido.
- `audit_events`: auditoria.

## Regra Platform Modular

- Nao emitir destino de login para `platform`.
- Modulos hospedados no Platform devem ser cadastrados e autorizados como `applications` proprias, por exemplo `pdv` e `juridico`.
- `client_applications.config.launchUrl` do modulo aponta para a rota dentro de `app-jboot-next-platform`.
- `entitlements` devem ser por identity/client/modulo, com roles e scopes do modulo.
- O JWT de contexto deve carregar o `application_slug` do modulo selecionado, nunca uma permissao generica `platform`.

## Validacao

Rodar dentro do container `jboot`:

```bash
cd implementations/bff-jboot-identity
npm run lint
npm run typecheck
npm run build
```

Smoke minimo:

```bash
curl -fsS http://127.0.0.1:8000/health
POST /auth/login com CPF 00000000191 e senha Jboot@123
```

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:identity`
  - purpose: desenvolvimento e smoke de login do Identity Hub.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: nenhum.
    - forbidden_by_default: `mongodb`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-api` em `8000`.
    - optional: nenhum.
    - forbidden_by_default: `platform-api`, `platform-web`, BFFs de produto, workers.
  - ports: `5432`, `8000`.
  - healthchecks: `GET http://localhost:8000/health`.
  - seed_dependencies: `docker/postgres/init/*identity*.sql`.
  - expected_resource_profile: baixo; um banco PostgreSQL e um watcher NestJS.

### Rules

- `code-up` nao deve subir infra global.
- `code-down:identity` para os processos `identity-api` e `identity-admin` sem parar containers.
- `code-restart:identity` equivale a `code-down:identity` seguido de `code-up:identity`.
- Servicos de fila, analytics, busca vetorial, storage e observabilidade sao opt-in por feature.

## Restricoes

- Este contrato e fonte de verdade para execucao neste projeto.
- Agents globais de stack servem como referencia, nao como executor principal quando este projeto for o alvo.
- Usar UUID.
- Nao acessar banco no controller.
- Controller orquestra HTTP; service aplica regra; repository acessa SQL.
- Toda mutacao admin relevante registra `audit_events`.
- Nao criar controller/service/repository generico para dominios diferentes.
- Nao criar cliente isolado como fluxo principal; cliente nasce por onboarding com app e admin.
- Nao criar permissao generica `platform` para liberar acesso a produtos; conceder o modulo/produto especifico.
- `dedicated_database` cria `database_refs.status = provisioning`; criacao fisica deve ser assincrona.
- Backend deve usar `JBOOT_IDENTITY_DATABASE_URL` para apontar para `jboot_identity`.

## Riscos Conhecidos

- Criar `clients` sem `client_applications`, `memberships` e `entitlements` gera estado incompleto.
- `shared_db` exige `client_id` nas tabelas de negocio do app.
- Provisionamento fisico de database dedicado ainda nao esta implementado.
