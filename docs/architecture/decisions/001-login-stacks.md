# ADR 001: Login Hub Stacks

## Status

Aceita para as implementacoes iniciais `bff-jboot-identity` e `app-jboot-identity-admin`.

## Contexto

O login sera centralizado em um identity hub. O usuario autentica por CPF/CNPJ, pode pertencer a multiplos clientes e pode acessar multiplas aplicacoes. Apos login, o hub resolve `cliente + aplicacao`, emite JWT proprio e informa o `database_ref` autorizado.

## Decision

```text
stack:
  backend_login: Node.js 24 + TypeScript + NestJS + PostgreSQL
  frontend_login: React 19 + Next.js 16 + TypeScript
  app: React Native + Expo
agent:
  backend_login: implementations/bff-jboot-identity/agents/backend-node-typescript.md
  frontend_login: implementations/app-jboot-identity-admin/agents/frontend-web.md
  app: mobile-react-native
architecture:
  Identity Hub + contract-first + hexagonal dentro do backend
rationale:
  Login e fluxo transacional, de seguranca, auditoria e integracao. TypeScript/NestJS entrega contratos fortes, guardas, middlewares, modularidade, OpenAPI e boa aderencia a JWT/OIDC-like flows. Next.js e adequado para login web, selecao de cliente/aplicacao e redirects. Expo/React Native reaproveita TypeScript e pode consumir o mesmo contrato do hub.
rejected:
  Python/FastAPI: bom para IA, mas nao e a melhor escolha primaria para identity transacional.
  Laravel: produtivo, mas menos alinhado ao hub multi-stack TypeScript/frontend/app neste ponto.
  Go: bom para gateways/workers, mas menor velocidade para fluxo de produto/auth completo.
  Flutter: bom app-first, mas menor reaproveitamento com frontend web e contratos TS.
  Java/Kotlin: fora do escopo atual informado.
contracts:
  OpenAPI para backend login.
  JWT assinado pelo hub.
  JSON Schema/Zod para payloads compartilhados.
  database_ref resolvido somente pelo hub.
risks:
  CPF/CNPJ e dado sensivel; nao deve vazar em JWT ou logs.
  JWT precisa rotacao de chaves, expiracao curta e revogacao.
  Multi-tenant exige auditoria forte em toda troca de contexto.
  DB/schema target nao pode ser inferido pelo cliente.
validation:
  testes de login, falha, MFA, selecao de contexto, redirect direto e negacao.
  testes de contrato OpenAPI.
  testes de auditoria obrigatoria.
  testes de permissao por cliente/aplicacao.
```

Os nomes de stack continuam validos como referencia tecnica em `docs/agents/stacks/*`. Para projetos ja criados, a execucao deve seguir `PROJECT_CONTRACT.md` e agents/skills locais.

## Backend Login

Escolha: `Node.js 24 + TypeScript + NestJS`.

Motivos:

- dominio de auth exige guards, interceptors, middlewares, modules e DI bem estruturados;
- OpenAPI e DTOs ficam naturais;
- bom encaixe com JWT, refresh tokens, RBAC/ABAC, auditoria e rate limit;
- integra bem com PostgreSQL, Redis/Valkey, RabbitMQ/Temporal quando necessario;
- reduz friccao com frontend web e app em TypeScript.

Banco:

- `jboot_identity` no PostgreSQL;
- Valkey para rate limit, sessoes efemeras, nonce e anti-bruteforce;
- RabbitMQ ou Temporal apenas se workflows assincronos reais surgirem, como verificacao documental, provisionamento ou notificacoes criticas.

## Frontend Login

Escolha: `React 19 + Next.js 16 + TypeScript`.

Motivos:

- login, MFA, selecao de cliente/aplicacao e redirect precisam SSR/edge-aware routing e UX web robusta;
- permite console administrativo do identity hub na mesma stack;
- bom suporte a forms, validacao, acessibilidade e fluxo multi-step;
- facilita compartilhamento de tipos/contratos com backend.

## App

Escolha: `React Native + Expo`.

Motivos:

- reaproveita TypeScript e contratos do hub;
- bom para login mobile, MFA, push, biometria e deep links;
- menor custo de duplicacao com frontend web;
- adequado enquanto o app nao exigir UX nativa extrema.

Regra: o app nao deve implementar logica propria de autorizacao. Ele autentica no hub, recebe JWT/contexto e acessa apenas aplicacoes permitidas.
