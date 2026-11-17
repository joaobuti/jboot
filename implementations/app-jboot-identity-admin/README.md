# App JBoot Identity Admin

Frontend administrativo global do JBoot Identity Hub.

## Stack

- React 19
- Next.js 16
- TypeScript
- Bootstrap/Reactstrap via template Velzon

## Responsabilidade

- Login do administrador global.
- Consumir o `bff-jboot-identity`.
- Gerenciar onboarding de clientes, aplicacoes, databases, vinculos app/database, usuarios e auditoria.

## Rotas JBoot

- `/dashboard`: home administrativa com metricas de clientes e apps.
- `/onboarding-clientes`: fluxo oficial para criar cliente com app contratado e admin do cliente.
- `/usuarios`: listagem administrativa de usuarios.
- `/apps`: listagem administrativa de apps/servicos com adicionar, editar e remover.
- `/databases`: catalogo de databases.
- `/app-databases`: vinculo entre apps e databases.
- `/clientes`: redireciona para `/onboarding-clientes`; nao e CRUD principal.

## Tema Padrao

- Theme: `minimal`
- Color scheme: `dark`

## Regra

Este app foi derivado de `implementations/templates/original/Next-TS`.
Nao editar o template original para regras especificas do JBoot.

Antes de alterar este app, leia `PROJECT_CONTRACT.md` e use os agents/skills locais em `agents/*` e `skills/*`.

## Login Admin

Usa `POST /auth/login` do `bff-jboot-identity`.

O acesso ao painel exige:

```text
role: global_admin
scope: identity:admin
```

## Rodar

```bash
docker compose exec jboot bash -lc 'cd implementations/app-jboot-identity-admin && npm run dev'
```

O dev server deve usar `0.0.0.0:3000` dentro do container. A URL no host fica:

```text
http://localhost:3000/login
```

O Identity Admin e o conector de login/contexto. Ele deve permanecer em `3000`; apps web de produto devem usar outra porta, por padrao `3001`.
