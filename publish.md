# Publicacao dos projetos

Este documento explica os dois fluxos de publicacao (deploy) usados no ecossistema JBoot para os projetos em `implementations/*`, e o comando exato para publicar manualmente cada um.

Para o desenho completo de arquitetura de deploy (dominios, ambientes, banco de dados, decisao operacional da Configr), ver `docs/deploy.md`. Este arquivo e um guia pratico de uso do dia a dia.

Regra permanente (ver `docs/deploy.md`, secao "Rotina obrigatoria ao preparar o primeiro deploy real de uma unidade"): todo projeto que ganha um target funcional em `tools/deploy.sh` tambem ganha uma linha na tabela abaixo, com o comando e o subdominio (mesmo que o Website ainda nao exista na Configr).

## Os dois fluxos

### Fluxo 1: Pipeline GitLab CI/CD

Cada projeto publicado tem um `.gitlab-ci.yml` proprio (ex: `implementations/bff-jboot-identity/.gitlab-ci.yml`), incluido pelo `.gitlab-ci.yml` raiz do monorepo. Roda automaticamente a cada push para `main`:

```
verify (lint, type-check, test) -> build -> deploy-production (gate manual)
```

O mecanismo de deploy usado pelo pipeline e o mesmo template compartilhado em `ci/deploy-template.gitlab-ci.yml` (job `.rsync_deploy`), que builda o projeto e envia via `rsync` por SSH para o servidor.

**Status atual (2026-08-11): bloqueado.** O projeto atingiu o limite de minutos gratuitos do GitLab CI/CD e a decisao foi nao contratar minutos pagos nem configurar um runner proprio por enquanto. Os arquivos `.gitlab-ci.yml` continuam integros e prontos -- nao foi preciso desfazer nada. Esse fluxo volta a funcionar sozinho quando a cota gratuita renovar (e mensal) ou se um runner proprio for registrado no projeto.

### Fluxo 2: Publicacao manual via SSH (`tools/deploy.sh`)

Enquanto o Fluxo 1 estiver bloqueado, a publicacao e feita manualmente com o script `tools/deploy.sh`, que reproduz localmente o mesmo build + empacotamento + envio via `rsync` que os jobs `*:deploy-production` fariam no pipeline. Nao depende do GitLab, nao tem custo, e pode ser usado a qualquer momento (inclusive depois que o Fluxo 1 voltar, como atalho pra deploy rapido).

Requer:

- Containers de dev no ar: `make code-up TARGET=identity` (ou o target equivalente do projeto).
- Chave SSH de deploy em `~/.ssh/jboot_configr_deploy` (publica ja autorizada nos usuarios SSH da Configr).
- Host da Configr presente no `~/.ssh/known_hosts` local.

## Comando de publicacao por projeto

| Projeto | Stack | Comando | Dominio no servidor | Status |
|---|---|---|---|---|
| `implementations/bff-jboot-identity` | Node.js 24, TypeScript, NestJS, PostgreSQL | `make deploy TARGET=identity-api` | `auth.jboot.com.br` | ativo |

| `implementations/app-jboot-identity-admin` | React 19, Next.js 16, TypeScript, Bootstrap/Reactstrap (template Velzon) | `make deploy TARGET=identity-admin` | `admin.jboot.com.br` | ativo |

| `implementations/site-jboot-landing` | React, Next.js, TypeScript, static export | `make deploy TARGET=landing` | `jboot.com.br` | ativo |

| `implementations/app-jboot-next-platform` | React, Next.js, TypeScript (template Velzon) | `make deploy TARGET=platform-web` | `app.jboot.com.br` | ativo |

| `implementations/bff-jboot-platform` | Node.js 24, TypeScript, NestJS, PostgreSQL multi-tenant, Redis/Valkey | `make deploy TARGET=platform-api` | `apinode.jboot.com.br` | ativo |

| `implementations/site-joao-buti-portfolio` | Astro, TypeScript, Tailwind CSS, static | `make deploy TARGET=portfolio` | `portfolio.jboot.com.br` | ativo |

Uso direto do script, sem o atalho do `make` (equivalente):

```bash
bash tools/deploy.sh identity-api
bash tools/deploy.sh identity-admin
bash tools/deploy.sh landing
bash tools/deploy.sh platform-api
bash tools/deploy.sh platform-web
PORTFOLIO_SSH_TARGET=portfolio@ip-23-239-11-216.cloudezapp.io bash tools/deploy.sh portfolio
```

## O que cada target faz

- **`identity-api`**: `npm ci && npm run build && npm prune --omit=dev` dentro do container de dev, depois envia `dist/` + `node_modules` (so producao) + `package.json` para `auth1@ip-23-239-11-216.cloudezapp.io:auth.jboot.com.br/www/`. Roda smoke test em `https://auth.jboot.com.br/health` no final.
- **`identity-admin`**: builda o Next.js em modo `output: "standalone"`, monta o pacote autocontido (`server.js` + `node_modules` minimo + `public/` + `.next/static/`), envia para `jboot5@ip-23-239-11-216.cloudezapp.io:admin.jboot.com.br/www/`. Smoke test em `https://admin.jboot.com.br/`.
- **`landing`**: builda o export estatico do Next.js (`out/`), remove temporariamente o `.env.local` antes do build (para nao vazar a URL de login de desenvolvimento para producao) e restaura depois, envia para `jboot3@ip-23-239-11-216.cloudezapp.io:jboot.com.br/www/ecosystem/implementations/site-jboot-landing/out/`. Smoke test em `https://jboot.com.br/`.
- **`platform-api`**: mesmo padrao do `identity-api` (`npm ci && npm run build && npm prune --omit=dev`), envia para `apinode@ip-23-239-11-216.cloudezapp.io:apinode.jboot.com.br/www/app/` (subpasta `app/`, nao a raiz -- ver nota abaixo). Smoke test em `https://apinode.jboot.com.br/health`.
- **`platform-web`**: mesmo padrao do `identity-admin` (`output: "standalone"`), envia para `app1@ip-23-239-11-216.cloudezapp.io:app.jboot.com.br/www/`. Smoke test em `https://app.jboot.com.br/`.
- **`portfolio`**: builda o Astro em modo estatico (`dist/`, `SITE_URL=https://portfolio.jboot.com.br`), envia para `portfolio@ip-23-239-11-216.cloudezapp.io:portfolio.jboot.com.br/www/`. Smoke test em `https://portfolio.jboot.com.br/`.

## Platform-web e platform-api: ativos desde 2026-08-17

`platform-web` e `platform-api` estao no ar. Resolvido no processo:

- `jose` (downgrade para `^4.15.9`, mesmo bug ESM/CJS do identity-api) e `.npmrc` com `legacy-peer-deps=true` no `platform-web`.
- Banco `jboot_pdv` criado na Configr (mesmo processo do `jboot_identity`); schema completo aplicado via SSH+psql (`006_pdv.sql` + `026`-`035`), seed de producao aplicado em `jboot_identity` (app `pdv` registrada, entitlements do Operador Senior e Usuario Teste).
- Variaveis de producao (`.env.production.local`, gitignored, empacotado pelo deploy) em `implementations/bff-jboot-platform` e `implementations/app-jboot-next-platform`.
- Achado novo: Websites Node.js da Configr **nao tem UI de variaveis de ambiente** -- mesmo workaround do Identity (`.env` empacotado + `process.loadEnvFile` em `main.ts`).
- Achado novo: primeiro deploy do `platform-api` esbarrou num diretorio `www/dist` orfao (dono `root`, criado pelo Passenger antes do deploy real) -- publicado numa subpasta `www/app/` em vez da raiz (ver `docs/deploy.md`, secao "Bugs reais no tools/deploy.sh").
- Achado novo: campo "Permitir Origem" da Configr (aba Aplicacao) injeta `Access-Control-Allow-Origin: *` por cima do CORS da propria aplicacao, causando erro de multiplos valores no navegador -- precisa ficar vazio nos Websites Node.js que ja fazem seu proprio CORS (`auth`, `apinode`).
- Achado novo (bateu 2x, corrigido em 2026-08-22): cache de pagina do LiteSpeed (`Nivel de cache de arquivos estaticos`, aba Performance) prende paginas estaticas (ex: `/login`, `/pdv`) por ate 1 ano; desligar o slider so evita cache NOVO, nao purga o que ja esta preso -- so desabilitar/reabilitar o Website purgava, o que e inviavel fazer a cada deploy com cliente ativo. Correcao definitiva: `export const dynamic = "force-dynamic"` no layout raiz (`src/app/layout.tsx`) de `app-jboot-identity-admin` e `app-jboot-next-platform` -- Next para de marcar rotas como estaticas, nunca mais emite o `Cache-Control: s-maxage=31536000` que o LiteSpeed prende. Nao mexe mais no slider da Configr.
- Corrigidas dependencias fantasmas no `app-jboot-next-platform` (`cookie`, `classnames`, `prop-types`, `reselect` -- presentes via hoisting do npm antigo, nunca declaradas no `package.json`; sao pnpm agora e falha o build sem elas declaradas) e um erro de tipo TS pre-existente em componente de dashboard demo do template Velzon (nao usado pelo produto real).
- Adiado (sem cliente real ainda): bancos dedicados de Juridico/Kanban e S3 (usado so pelo Kanban). O provisionamento de banco dedicado por cliente no Identity (`database_refs`) e so um catalogo -- nao cria banco de verdade sozinho; o processo e manual, igual ao que foi feito para `jboot_pdv`.

## Projetos fora do escopo atual do `tools/deploy.sh`

Esses 3 nao se encaixam no mecanismo de rsync + Website Node.js/React que construimos -- forcar uma entrada no script seria enganoso, ele nao funcionaria de verdade. Precisam de um modelo de deploy proprio, ainda nao desenhado.

| Projeto | Stack | Motivo | Dominio sugerido (quando aplicavel) |
|---|---|---|---|
| `implementations/ops-jboot-observability` | Grafana, Mimir, Tempo, Loki, PostgreSQL, MinIO (docker compose) | Stack inteira via `docker compose` -- precisa de um VPS com Docker, nao de um Website Configr | `observability.jboot.com.br` (para a UI do Grafana, quando exposta) |
| `implementations/wrk-jboot-juridico` | Python, Temporal SDK, Playwright | Worker sem servidor HTTP nem rota publica -- precisa de processo em background (systemd/Docker + conexao a um Temporal server), nao de pasta `www/` servida | sem dominio publico por design; se a plataforma exigir, usar subdominio tecnico nao divulgado |
| `implementations/svc-jboot-fiscal` | Laravel, PHP (stack em definicao) | `lifecycle_status: scaffolded` -- emissao fiscal ainda nao implementada, nada funcional pra publicar | `fiscal-api.jboot.com.br` (ja sugerido em `docs/deploy.md`, quando o servico estiver funcional) |

`implementations/app-jboot-pdv-mobile` fica de fora dessa lista tambem: `lifecycle_status: planned` (so contrato, sem runtime) e, mesmo quando pronto, distribuicao mobile nao usa hospedagem web/Configr.

## Variaveis de ambiente de producao (fora do escopo deste script)

`tools/deploy.sh` e `ci/deploy-template.gitlab-ci.yml` cuidam apenas de codigo/build. Variaveis de runtime (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, etc.) sao configuradas direto no painel da Configr, por Website, e nao fazem parte deste fluxo de publicacao.
