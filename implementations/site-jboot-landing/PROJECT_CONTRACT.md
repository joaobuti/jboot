# Project Contract: site-jboot-landing

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: site Next.js static export e testes contratuais automatizados
last_status_review: 2026-08-15
```

Site institucional publico da marca JBoot.

Este projeto foi definido pelo fluxo:

```text
PO -> product-engineer -> architect -> PROJECT_CONTRACT -> agents/skills locais -> implementacao
```

## Stack

- React
- Next.js
- TypeScript
- Static export

## Responsabilidade

Landing institucional publica da marca JBoot.

Owner exclusivo:

```text
jboot.com.br/
stg.jboot.com.br/
```

Rotas publicas auxiliares do mesmo artefato:

```text
/en/  versao publica em ingles
/es/  versao publica em espanhol
/v2/ ... /v6/  variantes historicas nao indexaveis
```

O projeto apresenta a marca, posiciona o ecossistema JBoot e oferece entrada para o fluxo autenticado em:

```text
/login
```

## Fora De Responsabilidade

Este projeto nao e responsavel por:

```text
/login
/apps
/pdv
/juridico
/admin/identity
/api/*
```

Nao implementar:

- login;
- sessao;
- selecao pos-login;
- autorizacao;
- clients HTTP;
- chamadas para BFFs;
- banco de dados;
- captura de leads no Sprint 1;
- analytics, pixels ou cookies de rastreamento no Sprint 1.

## Agents

- `agents/frontend-engineer.md`: executor principal da implementacao visual, responsiva e componentizada.
- `agents/qa-engineer.md`: validacao funcional, responsiva, SEO minimo e ausencia de acoplamento com APIs/auth.
- `agents/devops-engineer.md`: runtime profile, build estatico, healthcheck, cache e contrato de proxy/deploy.

Referencias globais:

- `docs/agents/stacks/frontend-web.md` para padroes gerais de frontend web.
- `docs/deploy.md` para dominio canonico, path routing e unidades de deploy.

## Skills

- `skills/frontend-project-bootstrap.md`
- `skills/seo-baseline.md`
- `skills/qa-web-smoke.md`
- `skills/deploy-contract.md`

Skill obrigatoria por regra do repositorio:

- `dev-runtime-profile`

Observacao: `dev-runtime-profile` nao estava disponivel na sessao em que este contrato foi criado. O perfil de runtime foi registrado manualmente neste contrato e deve ser mantido atualizado quando build, start, portas, healthchecks, proxy ou dependencias de runtime mudarem.

## Ativacao Obrigatoria

Antes de qualquer codigo neste projeto, declarar:

```text
Agent Activation:
  project: implementations/site-jboot-landing
  module: none
  using_agent:
    - PO
    - product-engineer
    - architect
    - implementations/site-jboot-landing/agents/frontend-engineer.md
    - implementations/site-jboot-landing/agents/qa-engineer.md
    - implementations/site-jboot-landing/agents/devops-engineer.md
  using_skill:
    - dev-runtime-profile, se disponivel; caso contrario registrar/atualizar runtime profile manualmente
    - implementations/site-jboot-landing/skills/frontend-project-bootstrap.md
    - implementations/site-jboot-landing/skills/seo-baseline.md
    - implementations/site-jboot-landing/skills/qa-web-smoke.md
    - implementations/site-jboot-landing/skills/deploy-contract.md
```

Se esse bloco nao for mostrado ao usuario antes da implementacao, a execucao deve ser tratada como nao aderente ao contrato.

## Entrypoints Planejados

```text
src/app/layout.tsx
src/app/page.tsx
src/app/globals.css
src/components/*
src/content/landing-content.ts
src/lib/routes.ts
public/*
next.config.ts
```

## Conteudo Minimo Do Sprint 1

- Header com marca JBoot e CTA para `/login`.
- Hero institucional com promessa clara da marca.
- Secao curta de ecossistema: Identity, PDV e Juridico.
- Secao de valor: gestao integrada, controle de acesso, modulos por contexto e operacao unificada.
- CTA final para `/login`.
- Footer com identificacao da marca e links minimos definidos.
- SEO minimo: title, description, canonical e Open Graph.

## Regras De Produto

- `jboot.com.br/` pertence exclusivamente a este projeto.
- A raiz `/` nao deve redirecionar automaticamente para `/login`.
- CTA principal deve apontar para `/login`.
- A landing deve ser publica, indexavel, cacheavel e independente do deploy do Identity/Platform.
- `platform` nao deve aparecer como produto comercial nem destino selecionavel.
- PDV e Juridico podem aparecer como solucoes/modulos do ecossistema.
- Identity pode ser citado como plano de controle, sem expor complexidade tecnica desnecessaria.
- Nenhum dado pessoal real, chave, token, tenant ou credencial deve aparecer no projeto.
- Nao coletar dados pessoais no Sprint 1.

## Regras Tecnicas

- Usar Next.js com static export.
- Evitar server runtime obrigatorio.
- Nao criar clients HTTP.
- Nao criar hooks de auth/session.
- Nao importar codigo interno de Identity, Platform, PDV, Juridico ou BFFs.
- Centralizar rotas publicas em `src/lib/routes.ts`.
- Centralizar texto institucional em `src/content/landing-content.ts`.
- Componentes devem ser pequenos, coesos e orientados por secao.
- Assets publicos devem ficar em `public/`.
- O projeto deve poder ser publicado e revertido independentemente dos apps autenticados.

## Configuracao Next Esperada

```ts
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};
```

## Contrato De Rotas

Owns:

```text
/
/en/
/es/
/v2/
/v3/
/v4/
/v5/
/v6/
```

Does not own:

```text
/login
/apps
/pdv
/juridico
/admin/identity
/api/*
```

O reverse proxy deve rotear paths especificos antes da landing. A landing nao deve ser fallback global para todos os paths desconhecidos do ecossistema.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:landing`
  - purpose: desenvolvimento e smoke da landing institucional publica.
  - containers:
    - required: nenhum.
    - optional: nenhum.
    - forbidden_by_default: `postgres`, `valkey`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `landing-web`.
    - optional: nenhum.
    - forbidden_by_default: `identity-api`, `identity-admin`, `platform-api`, `platform-web`, BFFs de produto, workers.
  - ports:
    - local: `3004`.
    - production: servido pelo reverse proxy em `https://jboot.com.br/`.
    - staging: servido pelo reverse proxy em `https://stg.jboot.com.br/`.
  - env_required:
    - Sprint 1: nenhuma para build/deploy.
    - `NEXT_PUBLIC_IDENTITY_LOGIN_URL` (opcional, somente local, via `.env.local` nao versionado): sobrescreve o CTA "Entrar" para apontar direto ao Identity (`app-jboot-identity-admin`, ex: `http://localhost:3000/login`) quando nao ha reverse proxy disponivel localmente. Sem essa variavel, o CTA usa `/login` relativo (comportamento de producao/staging).
  - external_services:
    - Sprint 1: nenhum.
  - healthchecks:
    - `GET /` deve retornar `200`.
    - `GET /en/` deve retornar `200`.
    - `GET /es/` deve retornar `200`.
  - artifact:
    - static export.
  - expected_resource_profile: baixo; site publico estatico/quase estatico.

### Rules

- `code-up:landing` nao deve subir bancos, filas, workers ou APIs.
- Mudancas em build, start, porta, healthcheck, artifact ou proxy devem atualizar este contrato.
- Deploy deve promover o mesmo artefato de staging para production.
- HTML de `/` deve ter cache curto ou revalidavel.
- Assets versionados podem ter cache longo.
- `/api/*`, `/login` e apps autenticados nao herdam politica de cache da landing.

## Validacao

Validacoes obrigatorias quando houver codigo:

```bash
npm run lint
npm run type-check
npm run test
npm run build
```

Preview local do artefato estatico:

```bash
npm run start
```

Smokes obrigatorios:

```text
GET /
GET /en/
GET /es/
GET /v6/
CTA principal aponta para /login
Nao ha redirect automatico de / para /login
Nao ha chamadas para /api/auth, /api/platform, /api/juridico ou APIs privadas
Nao ha formulario/coleta de dados no Sprint 1
Nao ha cookies, analytics ou pixels no Sprint 1
```

SEO minimo:

```text
title
meta description
canonical https://jboot.com.br/
hreflang pt-BR/en/es
Open Graph basico
favicon/brand asset
```

## Riscos Conhecidos

- Confundir visitante apresentando `platform` como produto final.
- Acoplar landing ao app autenticado e perder deploy/cache independente.
- Criar formulario cedo demais e abrir pendencias de LGPD, armazenamento, consentimento e seguranca.
- Proxy servir a landing como fallback de rotas autenticadas.
- Branding provisoria gerar retrabalho visual.
- Variantes historicas indexadas competirem com a canonical `/`; todas devem usar `noindex`.
- Cache agressivo prender HTML antigo.

## Decisoes Rejeitadas

- Landing dentro do Identity: rejeitada para nao acoplar marketing ao plano de controle critico.
- Landing dentro do Platform: rejeitada porque Platform e shell autenticado/tecnico.
- HTML puro: rejeitado como base principal por menor manutenibilidade e desalinhamento com React/TypeScript.
- Vite React: alternativa valida, mas rejeitada em favor de Next static export por consistencia com o ecossistema e SEO/metadata.
- Subdominio separado para landing: rejeitado porque `jboot.com.br` e o dominio canonico.
