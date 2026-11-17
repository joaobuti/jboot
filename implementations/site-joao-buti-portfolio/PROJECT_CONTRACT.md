# Project Contract: site-joao-buti-portfolio

## Status

```yaml
lifecycle_status: functional
production_readiness: blocked
status_evidence: site Astro, teste de conteudo e build versionados; dominio publico final pendente
last_status_review: 2026-08-02
```

Portfolio profissional individual de Joao Buti.

Este projeto foi definido pelo fluxo:

```text
PO -> PE -> Architect -> Marketing/Brand -> human-confirmation -> git-branch -> PROJECT_CONTRACT -> implementation
```

Confirmacao humana registrada:

```text
Confirmo criar implementations/site-joao-buti-portfolio com Astro + TypeScript + Tailwind, conteudo PT/EN/ES e identidade pessoal abstrata.
Identidade visual aprovada: Signal Architecture.
```

## Stack Fit Gate

### Delivery Type

```text
portfolio profissional estatico
conteudo/SEO
landing tecnica pessoal
baixa interatividade
i18n PT/EN/ES
```

### Stacks Consideradas

| Stack | Decisao | Motivo |
|---|---|---|
| Astro + TypeScript + Tailwind CSS | adotada | Melhor fit para site estatico, SEO, conteudo versionado, i18n simples e baixa hidratacao. |
| Next.js static export | rejeitada | Baseline do hub para apps/consoles, mas excesso de framework para portfolio estatico SEO-first. |
| Vite + React | rejeitada | Simples para UI, mas SPA exige mais cuidado para SEO, metadata e rotas indexaveis. |
| HTML/CSS/JS puro | rejeitada | Menor runtime, mas pior manutencao para conteudo bilingue, SEO estruturado e componentes. |

## Responsabilidade

Site publico estatico de portfolio profissional individual.

Objetivos:

- posicionar Joao Buti para cargos senior/high-level;
- demonstrar experiencia em engenharia de software, tech leadership, modernizacao de legados e arquitetura AI-FIRST;
- apresentar cases tecnicos publicaveis: JBoot Hub, MuniSaude e modernizacao de sistemas;
- expor contato via email, LinkedIn e WhatsApp sem captura de dados.

## Fora De Responsabilidade

Este projeto nao e responsavel por:

- login;
- Identity Hub;
- Platform JBoot;
- BFFs;
- banco de dados;
- formularios;
- analytics/pixels/cookies;
- captura de leads;
- download de curriculo na sprint inicial.

## Identidade Visual

```text
name: Signal Architecture
tone: tecnico, senior, moderno, preciso
visual: abstrato, editorial, sistemas, sinais, camadas, agentes e fluxos
primary_palette:
  graphite: #111318
  paper: #f5f2ea
  cyan: #00c2d6
  lime: #a3e635
  steel: #64748b
avoid:
  - cyberpunk/neon exagerado
  - roxo generico de startup
  - blobs/orbs decorativos
  - promessa comercial exagerada
  - identidade JBoot como marca principal
```

Asset principal:

```text
public/assets/signal-architecture-hero.png
```

O asset foi gerado via skill `imagegen` como bitmap abstrato sem texto, sem logo e sem pessoas.

### Asset Integration

```text
asset_role: assinatura visual e metafora pratica da arquitetura AI-FIRST
content_relation: representa fluxo Agents -> Contracts -> Runtime -> Validation
derived_tokens:
  - cyan/lime como sinais de conexao e enfase
  - linhas finas e grid tecnico como estrutura de secoes
  - nos/sinais como marcadores em tags, cards e listas
  - grafite como plano de arquitetura na secao AI-FIRST
layout_integration:
  - hero visual integrado por gradiente e linha de sinal, nao como quadro decorativo isolado
  - fluxo AI-FIRST visivel no hero
  - secoes, cards, tags e CTAs reutilizam linhas/nos/acentos do asset
rejection_condition:
  - se a imagem voltar a parecer ilustracao lateral isolada, recortar, reintegrar ou substituir
```

## Conteudo

Idiomas:

```text
/pt
/en
/es
```

Fonte principal:

```text
/home/projetos/Joao_Buti_Curriculo_ATS.pdf
```

Dados publicos aprovados:

```text
name: Joao Buti
email: joaobuti@gmail.com
linkedin: https://www.linkedin.com/in/butijoao/
whatsapp: https://wa.me/5541997608825
```

Nao publicar:

- botao de download do curriculo;
- clientes, dados pessoais, credenciais ou exemplos sensiveis;
- promessas nao verificadas.

## Agents

- `agents/frontend-engineer.md`: implementacao Astro, componentes, responsividade e acessibilidade.
- `agents/seo-content-engineer.md`: SEO tecnico, i18n, metadata, sitemap e conteudo bilingue.
- `agents/qa-engineer.md`: build, check, teste de conteudo e smoke visual.

Referencias globais:

- `docs/agents/orchestration/marketing-brand.md`
- `docs/agents/stacks/frontend-web.md`
- `docs/stacks/recommendations.md`

## Skills

- `skills/astro-static-site.md`
- `skills/seo-baseline.md`
- `skills/qa-web-smoke.md`

Skill obrigatoria por regra do repositorio:

- `docs/skills/dev-runtime-profile/SKILL.md`

## Entrypoints

```text
src/pages/index.astro
src/pages/pt/index.astro
src/pages/en/index.astro
src/pages/es/index.astro
src/pages/sitemap.xml.ts
src/pages/robots.txt.ts
src/layouts/BaseLayout.astro
src/components/PortfolioPage.astro
src/content/site-data.mjs
src/styles/global.css
public/assets/*
```

## Dev Runtime Profile

### Target Runtime Matrix

- target: `portfolio-web`
  - purpose: desenvolvimento e smoke do portfolio profissional estatico.
  - containers:
    - required: nenhum.
    - optional: nenhum.
    - forbidden_by_default: `postgres`, `valkey`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `astro-dev` ou `astro-preview`.
    - optional: nenhum.
    - forbidden_by_default: Identity, Platform, BFFs, workers, apps mobile.
  - local_cache:
    - Vite cache em `.astro/vite`, nao em `node_modules/.vite`.
  - ports:
    - local_dev: `4321`.
    - local_preview: `4321`.
  - env_required:
    - nenhum para build local.
  - env_optional:
    - `SITE_URL`: dominio publico canonico para sitemap/canonical. Default temporario: `https://joaobuti.dev`.
  - external_services:
    - nenhum.
  - healthchecks:
    - `GET /pt/` deve retornar `200`.
    - `GET /en/` deve retornar `200`.
    - `GET /es/` deve retornar `200`.
  - seed_dependencies:
    - nenhum; site publico estatico nao e application Identity e nao possui `application_slug`.
  - expected_resource_profile: baixo.

### Rules

- Full stack JBoot nao deve subir para desenvolver este site.
- Nao adicionar banco, auth, analytics, cookies ou captura de dados sem novo gate de produto, marketing e seguranca.
- Antes do deploy publico, definir `SITE_URL` com o dominio real.

## Validacao

```bash
npm run check
npm run test
npm run build
```

Smoke local:

```bash
npm run dev -- --host 127.0.0.1
```

## Riscos Abertos

- Dominio publico final ainda nao informado. `SITE_URL` deve ser ajustado antes de deploy/indexacao real.
