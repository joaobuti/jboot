# BFF JBoot Identity

Backend de autenticacao do JBoot Identity Hub.

## Responsabilidade

- Autenticar usuarios por CPF/CNPJ.
- Resolver destinos `cliente + aplicacao`.
- Validar contrato ativo/trial em `client_applications`.
- Validar permissao do usuario em `entitlements`.
- Emitir JWT proprio com contexto autorizado.
- Registrar auditoria de login, falha, selecao de contexto e emissao de token.

## Relacao Cliente x Aplicacao

- `client_applications`: contrato/ativacao da aplicacao para o cliente.
- `memberships`: vinculo do usuario ao cliente.
- `entitlements`: permissao do usuario para acessar a aplicacao naquele cliente.
- `database_refs`: alvo de dados permitido para o par `cliente + aplicacao`.

## Stack

- Node.js 24
- TypeScript
- NestJS
- PostgreSQL `jboot_identity`
- Valkey futuramente para rate limit, nonce e sessoes efemeras

## Endpoints

- `GET /health`
- `POST /auth/login`
- `POST /auth/context`
- `GET|POST /admin/applications`
- `POST /admin/client-onboarding`
- `GET|POST /admin/identities`
- `GET|POST /admin/databases`
- `GET|POST /admin/applications/:applicationId/databases`
- `GET|POST /admin/clients`
- `GET|POST /admin/clients/:clientId/applications`
- `GET|POST /admin/clients/:clientId/memberships`
- `GET|POST /admin/clients/:clientId/entitlements`
- `GET|POST /admin/database-refs`
- `GET /admin/audit-events`

Rotas admin exigem JWT com:

```text
role: global_admin
scope: identity:admin
```

## Rodar

```bash
docker compose exec jboot bash -lc 'cd implementations/bff-jboot-identity && JBOOT_IDENTITY_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_identity npm run start:dev'
```

O backend deve usar o banco `jboot_identity`. Dentro do container, a variavel preferencial e:

```text
JBOOT_IDENTITY_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_identity
```

Seed local:

```bash
docker compose exec -T postgres psql -U jboot -d postgres -f /docker-entrypoint-initdb.d/003_identity_dev_seed.sql
```

Credencial local:

```text
CPF: 000.000.001-91
Senha: Jboot@123
Role: global_admin
Scope: identity:admin
```

Swagger:

```text
http://localhost:8000/docs
```

Antes de alterar este backend, leia `PROJECT_CONTRACT.md` e use os agents/skills locais em `agents/*` e `skills/*`.
