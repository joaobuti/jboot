# Project Contract: app-jboot-identity-admin

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: console Next.js, build/typecheck e testes contratuais automatizados
last_status_review: 2026-08-05
```

## Stack

- React 19
- Next.js 16
- TypeScript
- Bootstrap/Reactstrap
- Template base Velzon em `implementations/templates/original/Next-TS`

## Responsabilidade

Console administrativo global do Identity Hub: login admin, dashboard, onboarding de clientes, usuarios, apps, databases e vinculos app/database.

## Agents

- `agents/frontend-web.md`: executor principal do console Next.js/React.
- `agents/backend-contract-client.md`: contratos HTTP com o BFF.
- Referencias globais opcionais:
  - `docs/agents/stacks/frontend-web.md` para padroes gerais da stack.
  - `docs/agents/stacks/backend-node-typescript.md` apenas quando a tela exigir ajuste no contrato/API do BFF.

## Skills

- `skills/admin-ui.md`
- `skills/admin-api-client.md`
- Referencias globais opcionais:
  - `crud-jboot-identity` quando a tela consumir ou alterar CRUDs admin do BFF.
  - `nextjs-console` quando existir.
  - `agent-review` quando menus/fluxos/skills forem alterados.

## Entrypoints

- `src/app/(with-layout)/*`
- `src/app/(with-nonlayout)/auth/login/page.tsx`
- `src/lib/admin-api.ts`
- `src/lib/jboot-identity.ts`
- `src/layouts/Layouts/LayoutMenuData.tsx`
- `middleware.ts`

## Rotas JBoot

- `/dashboard`
- `/onboarding-clientes`
- `/usuarios`
- `/apps`
- `/databases`
- `/app-databases`
- `/clientes` redireciona para `/onboarding-clientes`

## Contratos

- E-mail do sistema, convite e recuperacao de senha:
  `docs/product/account-access-email-sprints.md` (S1–S3).
- Consome `bff-jboot-identity`.
- API base: `NEXT_PUBLIC_JBOOT_IDENTITY_API_URL` ou `NEXT_PUBLIC_API_URL`.
- Cookie de sessao admin: `authUser`.
- Login admin exige `global_admin` e `identity:admin`.
- `?returnTo=` no login: aceito somente para sessao Flow e destino exatamente
  `<NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL>/oauth/consentimento` (consentimento do
  conector Claude, `docs/product/kanban-claude-connector-sprints.md`); qualquer
  outro valor e ignorado.

## Validacao

Rodar dentro do container `jboot`:

```bash
cd implementations/app-jboot-identity-admin
npm run type-check
npm run test
npm run build
```

Para desenvolvimento:

```bash
npm run dev
```

O dev server deve rodar em `0.0.0.0:3000`.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:identity`
  - purpose: desenvolvimento do login/admin Identity com BFF Identity.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: nenhum.
    - forbidden_by_default: `mongodb`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-admin` em `3000`, `identity-api` em `8000`.
    - optional: nenhum.
    - forbidden_by_default: `platform-api`, `platform-web`, BFFs de produto, workers.
  - ports: `3000`, `8000`, `5432`.
  - healthchecks: `GET http://localhost:8000/health` e abertura de `http://localhost:3000/login`.
  - seed_dependencies: seeds Identity em `docker/postgres/init`.
  - expected_resource_profile: medio; um Next dev server, um watcher NestJS e PostgreSQL.

### Rules

- `code-up:identity` deve ser suficiente para validar login sem subir infra global.
- `code-down:identity` para os processos `identity-api` e `identity-admin` sem parar containers.
- `code-restart:identity` equivale a `code-down:identity` seguido de `code-up:identity`.

## Restricoes

- Este contrato e fonte de verdade para execucao neste projeto.
- Agents globais de stack servem como referencia, nao como executor principal quando este projeto for o alvo.
- Nao editar o template original em `implementations/templates/original/Next-TS`.
- Antes de criar tela/menu, verificar se uma rota existente ja possui a responsabilidade.
- Se o usuario citar rota/tela/arquivo, revisar esse alvo primeiro e limitar contexto ao entorno necessario.
- Nao criar menu duplicado para o mesmo fluxo de negocio.
- `Clientes` nao deve ser CRUD isolado; onboarding e o fluxo oficial de criacao de cliente.
- Usar `src/lib/admin-api.ts` para contratos HTTP admin.
- Manter tema padrao: `minimal` + `dark`.

## Riscos Conhecidos

- Build Next pode consumir muita memoria por causa do template grande. Parar `next dev` antes de `npm run build` se ocorrer `Killed`.
- O template contem muitas rotas legadas; evitar acoplar novas regras JBoot a telas de exemplo.
- O lint flat esta operacional, mas o baseline legado possui 752 violacoes. Risco aceito em 2026-08-05 para nao bloquear o primeiro deploy de producao do Identity: nao impede `deploy-production` no pipeline, mas novas mudancas nao devem ampliar a contagem e o backlog deve ser reduzido de forma incremental. Essa aceitacao cobre apenas o item de lint; os demais itens do Definition of Done (`docs/architecture/implementation-lifecycle.md`) continuam nao avaliados e por isso `production_readiness` permanece `not_assessed`, nao `ready`.
