# Module Contract: bff-jboot-platform/modules/catalog

Arquivo: `MODULE_CONTRACT.md`

Materializado via fluxo `PO -> PE -> Architect -> confirmacao humana` (ver `.claude/CLAUDE.md`), seguindo o procedimento `ai-first-governance` (`docs/skills/ai-first-governance/SKILL.md`) e `make ai-conformance`, na branch `feature/comanda-autoatendimento`, como parte da fundacao da feature de autoatendimento/comanda digital.

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: modulo NestJS de catalogo (produtos/categorias) em producao dentro da platform, consumido por pdv; contrato formalizado retroativamente
last_status_review: 2026-08-20
```

Debito de governanca preexistente sanado por este contrato: o modulo `catalog` ja existia como codigo funcional (`src/modules/catalog/`, com `products` e `categories`) sem `MODULE_CONTRACT.md` proprio. Este arquivo formaliza o que ja existia e documenta a extensao feita para a feature de comanda.

Destino tecnico:

- `implementations/bff-jboot-platform/src/modules/catalog`

## Responsabilidade

Dominio de produto e categoria da platform: cadastro administrativo (CRUD de `catalog_products`/`catalog_categories`, tabelas originadas do rename de `pdv_products`/`pdv_categories`) e distribuicao de leitura de produto para os demais modulos que consomem catalogo. E a fonte unica de dado de produto/categoria da platform — nenhum outro modulo deve manter copia propria de produto.

Consumidores confirmados:

- `pdv` (admin/inventory/dashboard, leitura direta de `catalog_products` via SQL hoje).
- `comanda` (leitura publica via endpoint novo, ver abaixo).

## Visibilidade multicanal

`catalog_products` ja possui `visible_in_pdv`, `visible_in_cardapio` e `visible_in_comanda` (boolean, migracao `032_catalog_module.sql`), com CRUD administrativo ja funcional para `visible_in_comanda` (DTO/repository/controller). Nao recriar esses campos.

Extensao desta feature:

- `catalog_categories` ganha `visible_in_comanda` (boolean, novo) — categoria e o primeiro nivel de cascata de visibilidade: categoria com `visible_in_comanda=false` esconde todos os produtos dela no cardapio publico, mesmo que o produto individualmente esteja `visible_in_comanda=true`. Cascata rasa (nao considera `parent_id`/ancestrais).
- `catalog_products` ganha `queue_type` (`cozinha`|`bar`, novo) — obrigatorio via validacao de aplicacao (DTO/service, no create e no update) quando `visible_in_comanda=true`. Nao e derivado de categoria; e atributo direto do produto.
- Produto com `visible_in_comanda=true` e sem `category_id` aparece agrupado em secao "Outros" no cardapio publico.
- Produto com `visible_in_comanda=true` mas cuja categoria esta com `visible_in_comanda=false` **nao aparece** no cardapio (nao cai em "Outros" — "Outros" e so para produto sem categoria nenhuma).

## Endpoint publico novo

`GET /catalog/public/menu/:clientId` — sem guard de Identity Hub (rota publica genuina, primeira do repositorio). Retorna categorias e produtos filtrados por `client_id` + cascata de `visible_in_comanda` (categoria E produto) + capability de tenant `comanda` (`jboot_identity.client_capabilities`, sub-modulo da application `pdv` no `capability_registry`, lida via `DatabaseService.queryIdentity`). Ate 2026-08-23 o gate era a flag jsonb `autoatendimento_comanda` em `client_applications.config`; migrado para `client_capabilities` em `docker/postgres/init/044_capability_application_submodules.sql` (ver ADR 008). Controller publico nunca deve declarar `@UseGuards(PdvAuthGuard, ...)` — checklist de review obrigatorio antes de merge de qualquer PR que toque `catalog/public/*`.

## Debito de escopo conhecido (nao corrigir nesta entrega)

Os endpoints administrativos existentes (`products.controller.ts`, `categories.controller.ts`) usam `@RequireScopes('pdv:admin:read'|'pdv:admin:write')`, importado diretamente de `../../pdv/admin/guards/scope.guard`, em vez de um escopo proprio do `catalog` (ex.: `catalog:read`/`catalog:write`). Isso acopla o CRUD administrativo de catalogo ao `application_slug=pdv` e limita reuso por outros modulos/SaaS que nao tenham escopo de PDV. Decisao tomada com o usuario: documentar como debito, nao desacoplar nesta entrega — o endpoint publico novo (acima) nao depende desses guards, entao nao bloqueia a feature de comanda.

## Agents Do Modulo

- `agents/catalog-domain.md`

## Skills Do Modulo

- `skills/catalog-menu-visibility.md`

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/bff-jboot-platform`.

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/catalog
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
    - implementations/bff-jboot-platform/modules/catalog/agents/catalog-domain.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - implementations/bff-jboot-platform/modules/catalog/skills/catalog-menu-visibility.md
```

## Contratos Obrigatorios

- `implementations/bff-jboot-platform/modules/pdv/MODULE_CONTRACT.md` (consumidor historico)
- `implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md` (consumidor novo)
- `implementations/bff-jboot-platform/modules/platform-files/MODULE_CONTRACT.md` (imagem de produto via upload centralizado)

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:pdv` (catalog roda dentro do mesmo processo `bff-jboot-platform`, sem target proprio)
  - purpose: cadastro de produto/categoria e leitura publica de cardapio.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `minio` para upload de imagem de produto via `platform-files`.
    - forbidden_by_default: `mongodb`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET /health` em Identity e Platform.
  - seed_dependencies: seeds Identity/PDV, `032_catalog_module.sql`, migracoes de comanda e `049_platform_files.sql` para imagem de produto.

## Restricoes

- Nao criar autenticacao propria para o CRUD administrativo — continua sob `PdvAuthGuard`/`ScopeGuard` (debito documentado acima).
- Endpoint publico (`catalog/public/*`) nunca aplica guard de Identity Hub — e nunca deve ser confundido com endpoint administrativo em code review.
- Nao aceitar `client_id` vindo do payload em nenhum endpoint administrativo.
- Nao duplicar dado de produto em outro modulo — `catalog` e a fonte unica.
