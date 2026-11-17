# Deploy

## Objetivo

Registrar as diretivas iniciais de deploy do ecossistema JBoot.

Estas diretivas preservam o Identity como plano de controle, mantem a marca em um dominio canonico e separam responsabilidades operacionais sem fragmentar prematuramente o codigo em varios repositorios.

## Decisoes

### Repositorio

O JBoot deve permanecer em monorepo neste estagio.

```text
jboot/
  implementations/
    site-jboot-landing
    app-jboot-identity-admin
    app-jboot-next-platform
    bff-jboot-identity
    bff-jboot-platform
    bff-jboot-juridico
    wrk-jboot-juridico
    svc-jboot-fiscal
```

O monorepo nao implica deploy monolitico. Cada aplicacao, BFF, worker ou servico deve continuar sendo uma unidade independente de build, release e deploy.

Separacao em multiplos repositorios so deve ser reconsiderada quando houver necessidade real de isolamento por equipe, ciclo de release, compliance, acesso ao codigo ou operacao independente.

### Plataforma de codigo

O GitLab e a plataforma recomendada para o repositorio principal privado do JBoot.

Motivos:

- CI/CD integrado ao ciclo de merge request.
- suporte adequado a monorepo com pipelines por path.
- environments, protected environments e rastreabilidade de deploy.
- container registry integrado.
- boa governanca para projeto privado.
- caminho natural para self-hosted se isso for necessario no futuro.

GitHub continua sendo uma alternativa valida para visibilidade publica, comunidade, open source e maior ecossistema externo, mas nao e a recomendacao principal para a operacao privada inicial do JBoot.

### Ambientes

Mesmo que todos os servicos rodem inicialmente no mesmo servidor fisico/VPS `configr`, os ambientes devem ser separados.

Ambientes minimos:

```text
staging
production
```

Ambiente opcional futuro:

```text
dev
```

A separacao deve ocorrer por containers, variaveis, secrets, bancos, volumes, nomes de servico e rotas externas.

Exemplo:

```text
configr
  reverse-proxy

  jboot-staging
    identity-api
    identity-admin
    platform-api
    platform-web
    landing
    postgres-staging
    redis-staging

  jboot-production
    identity-api
    identity-admin
    platform-api
    platform-web
    landing
    postgres-production
    redis-production
```

Nao usar ambiente unico para evolucao do ecossistema. Um deploy inseguro no Identity pode afetar login, tenants, permissoes e todos os modulos.

### Promocao de artefatos

O mesmo artefato deve ser promovido entre ambientes.

Fluxo recomendado:

```text
build image
deploy staging
validar staging
promover mesma image para production
```

Evitar rebuild diferente para producao depois de validar staging.

### Decisao Operacional Para Configr

No provedor Configr, cada `Website` criado representa uma unidade propria de hospedagem/configuracao/recurso. Portanto, para evitar concorrencia de todo o ecossistema dentro de um unico Website, a operacao no Configr deve usar subdominios por servico.

Esta decisao e especifica para o Configr e nao muda a decisao de monorepo:

```text
monorepo unico
deploy independente por servico
Website Configr separado por servico operacional
subdominio publico por servico quando necessario
```

Nao separar por stack, como `node.jboot.com.br` ou `python.jboot.com.br`. A fronteira de deploy no Configr deve ser responsabilidade operacional, nao linguagem.

#### Producao No Configr

| Projeto | Unidade | Dominio Configr | Tipo de servidor Configr | Observacao |
|---|---|---|---|---|
| `implementations/site-jboot-landing` | `jboot-landing` | `jboot.com.br` | `React` | Next static export (`output: export`) publicado como artefato estatico `out/`. Tipo `React` confirmado em producao pelo suporte Configr; nao usar `HTML` puro nem `React` para projetos Next.js que nao sejam export estatico (ver `app-jboot-identity-admin`, que exige `Node.js` por causa de `middleware.ts` server-side). |
| `implementations/site-joao-buti-portfolio` | `jboot-portfolio` | `portfolio.jboot.com.br` | `React` | Astro em modo estatico (`astro build`, sem middleware/server-side), publicado como artefato estatico `dist/`. Mesma logica do tipo `React` usada na landing: estatico puro, sem necessidade de `Node.js`. Deploy ativo desde 2026-08-17; usuario SSH do Website e `portfolio` (nao `portifolio` -- atencao a grafia, ver nota abaixo). |
| `implementations/app-jboot-next-platform` | `jboot-platform-web` | `app.jboot.com.br` | `Node.js` | Next.js autenticado: `/login`, `/apps`, `/pdv`, `/juridico`. |
| `implementations/app-jboot-identity-admin` | `jboot-identity-admin` | `admin.jboot.com.br` | `Node.js` | Console administrativo global do Identity. |
| `implementations/bff-jboot-identity` | `jboot-identity-api` | `auth.jboot.com.br` | `Node.js` | API de login, contexto, JWT, onboarding e contratos. |
| `implementations/bff-jboot-platform` | `jboot-platform-api` | `apinode.jboot.com.br` | `Node.js` | BFF modular da Platform para modulos como PDV/Juridico. `api.jboot.com.br` ja existia previamente e nao foi usado para este projeto. |
| `implementations/bff-jboot-juridico` | `jboot-juridico-api` | `juridico-api.jboot.com.br` | `Node.js` | API Juridico standalone/multi-tenant quando usada fora ou ao lado da Platform. |
| `implementations/wrk-jboot-juridico` | `jboot-juridico-worker` | sem dominio publico preferencial | `Python` | Worker de scraping/Temporal; nao deve expor rota publica. Se o Configr exigir dominio, usar subdominio tecnico nao divulgado e protegido. |
| `implementations/svc-jboot-fiscal` | `jboot-fiscal-service` | `fiscal-api.jboot.com.br`, quando exposto | a definir | Projeto planejado. Antes de criar Website, decidir stack. Se a decisao for NestJS, usar `Node.js`. |
| `implementations/app-jboot-pdv-mobile` | `jboot-pdv-mobile` | nao se aplica | nao se aplica | App React Native/Expo; nao e Website Configr. Build/distribuicao mobile separados. |
| `implementations/bff-jboot-pdv` | `jboot-pdv-api-legacy` | `pdv-api-legacy.jboot.com.br`, se necessario | `Node.js` | Legado/origem de migracao. Nao e destino preferencial de novas features web/backend. |

#### Staging No Configr

| Projeto | Unidade | Dominio Configr | Tipo de servidor Configr |
|---|---|---|---|
| `site-jboot-landing` | `jboot-landing-stg` | `stg.jboot.com.br` | `React` |
| `app-jboot-next-platform` | `jboot-platform-web-stg` | `stg-app.jboot.com.br` | `Node.js` |
| `app-jboot-identity-admin` | `jboot-identity-admin-stg` | `stg-admin.jboot.com.br` | `Node.js` |
| `bff-jboot-identity` | `jboot-identity-api-stg` | `stg-auth.jboot.com.br` | `Node.js` |
| `bff-jboot-platform` | `jboot-platform-api-stg` | `stg-api.jboot.com.br` | `Node.js` |
| `bff-jboot-juridico` | `jboot-juridico-api-stg` | `stg-juridico-api.jboot.com.br` | `Node.js` |
| `wrk-jboot-juridico` | `jboot-juridico-worker-stg` | sem dominio publico preferencial | `Python` |
| `svc-jboot-fiscal` | `jboot-fiscal-service-stg` | `stg-fiscal-api.jboot.com.br`, quando exposto | a definir |

#### Regras Para Configr

- Cada Website Configr deve ter variaveis, secrets, healthcheck, logs e recursos isolados.
- Landing publica deve ficar em `jboot.com.br`.
- A area autenticada de usuarios deve ficar em `app.jboot.com.br`.
- APIs devem ficar em subdominios de servico (`auth`, `api`, `juridico-api`) para separar consumo e configuracao.
- Workers nao devem ter exposicao publica. Se a plataforma exigir Website para rodar processo Python, o dominio deve ser tecnico, nao divulgado, e protegido.
- `platform` continua nao sendo produto selecionavel de login. O usuario entra em `app.jboot.com.br` e seleciona aplicacoes reais, como `pdv` e `juridico`.
- Configurar CORS/cookies explicitamente para os subdominios aprovados.
- Esta decisao substitui o path routing unico para o deploy no Configr enquanto nao houver reverse proxy controlado por nos na frente dos Websites.

### Dominio canonico

O dominio canonico do ecossistema deve ser:

```text
jboot.com.br
```

As aplicacoes devem se diferenciar por path, nao por subdominios de produto.

Producao:

```text
jboot.com.br/                  landing institucional
jboot.com.br/en/               landing institucional em ingles
jboot.com.br/es/               landing institucional em espanhol
jboot.com.br/login             login do usuario
jboot.com.br/apps              selecao pos-login, quando aplicavel
jboot.com.br/pdv               modulo PDV
jboot.com.br/juridico          modulo Juridico
jboot.com.br/admin/identity    admin global do Identity
jboot.com.br/api/auth          Identity API
jboot.com.br/api/platform      Platform API
jboot.com.br/api/juridico      Juridico API
jboot.com.br/api/fiscal        Fiscal API, quando exposto
```

Staging:

```text
stg.jboot.com.br/
stg.jboot.com.br/login
stg.jboot.com.br/apps
stg.jboot.com.br/pdv
stg.jboot.com.br/juridico
stg.jboot.com.br/admin/identity
stg.jboot.com.br/api/auth
stg.jboot.com.br/api/platform
stg.jboot.com.br/api/juridico
stg.jboot.com.br/api/fiscal
```

Subdominios por produto, como `pdv.jboot.com.br` ou `juridico.jboot.com.br`, nao devem ser usados como estrategia inicial.

Observacao para Configr: por limitacao operacional do modelo de Websites isolados, o deploy no Configr usa subdominios por servico conforme a secao "Decisao Operacional Para Configr". O roteamento por path permanece como arquitetura preferencial quando houver reverse proxy controlado por nos.

### Reverse proxy

Quando houver reverse proxy controlado por nos, o deploy deve usar roteamento por path.

Mapa logico:

| Path | Owner interno |
|---|---|
| `/` | `site-jboot-landing` |
| `/en` | `site-jboot-landing` |
| `/es` | `site-jboot-landing` |
| `/login` | `app-jboot-next-platform` ou frontend de login definido pelo Identity/Platform |
| `/apps` | `app-jboot-next-platform` |
| `/pdv` | `app-jboot-next-platform` modulo PDV |
| `/juridico` | `app-jboot-next-platform` modulo Juridico |
| `/admin/identity` | `app-jboot-identity-admin` |
| `/api/auth` | `bff-jboot-identity` |
| `/api/platform` | `bff-jboot-platform` |
| `/api/juridico` | `bff-jboot-juridico` |
| `/api/fiscal` | `svc-jboot-fiscal`, quando exposto |

O reverse proxy se torna componente critico de operacao e deve ser versionado, revisado e validado com smoke tests por ambiente.

No Configr, enquanto cada Website for uma unidade isolada sem path routing controlado por nos, usar a decisao operacional da secao "Decisao Operacional Para Configr".

### Landing institucional

A landing institucional deve ser um projeto separado:

```text
implementations/site-jboot-landing
```

Responsabilidade:

```text
jboot.com.br/
jboot.com.br/en/
jboot.com.br/es/
jboot.com.br/v2/ ... /v6/  variantes historicas nao indexaveis do mesmo artefato
```

Mesmo compartilhando o mesmo dominio canonico, a landing nao deve ser implementada dentro do Identity nem do Platform.

Para o primeiro deploy publico em `jboot.com.br`, a landing institucional deve existir. O ecossistema pode ser validado tecnicamente sem ela em staging, mas a exposicao publica da marca deve nascer no formato definido para o provedor usado.

Modelo com reverse proxy proprio:

```text
jboot.com.br/       -> site-jboot-landing
jboot.com.br/en/    -> site-jboot-landing
jboot.com.br/es/    -> site-jboot-landing
jboot.com.br/login  -> entrada autenticada
```

Modelo Configr:

```text
jboot.com.br/           -> site-jboot-landing
app.jboot.com.br/login  -> entrada autenticada
```

Motivos:

- ciclo de mudanca diferente do login e dos modulos autenticados.
- SEO, cache, analytics e marketing nao devem acoplar ao Identity.
- rollback da landing nao deve afetar login, PDV ou Juridico.
- deploy da landing deve ser independente.
- a raiz publica pode ter cache e politica operacional diferentes.

O topo da landing deve oferecer entrada para o ecossistema autenticado:

```text
/login
```

### Identity como plano de controle

O Identity continua sendo o plano de controle do ecossistema.

Regras obrigatorias:

- `platform` e shell tecnico, nao destino selecionavel de login.
- Produtos standalone e modulos hospedados no Platform devem existir como `applications` no Identity.
- A selecao pos-login deve listar aplicacoes reais, como `pdv`, `juridico` e `identity-admin`, nunca `platform`.
- O JWT/contexto deve carregar o `application_slug` selecionado.
- Cada BFF deve validar roles/scopes do seu proprio modulo.
- Nenhum BFF de produto deve autenticar usuario diretamente.

### Unidades de deploy

Unidades iniciais:

| Unidade | Projeto | Responsabilidade |
|---|---|---|
| `landing` | `site-jboot-landing` | site publico institucional |
| `identity-api` | `bff-jboot-identity` | autenticacao, contexto, JWT, onboarding, contracts |
| `identity-admin` | `app-jboot-identity-admin` | admin global do Identity |
| `platform-web` | `app-jboot-next-platform` | shell web e modulos `pdv`/`juridico` |
| `platform-api` | `bff-jboot-platform` | BFF modular da Platform |
| `juridico-api` | `bff-jboot-juridico` | API juridica multi-tenant |
| `juridico-worker` | `wrk-jboot-juridico` | workers/scraping/orquestracao juridica |
| `fiscal-service` | `svc-jboot-fiscal` | servico fiscal |

Cada unidade deve ter:

- build proprio.
- imagem propria quando containerizada.
- healthcheck proprio.
- variaveis/secrets proprios.
- logs identificaveis por servico e ambiente.
- deploy independente.

### Rotina obrigatoria ao preparar o primeiro deploy real de uma unidade

Aplicar proativamente, sem aguardar instrucao do usuario, sempre que um projeto de `implementations/*` estiver proximo do primeiro deploy real em producao:

1. Adicionar um target correspondente em `tools/deploy.sh` (funcao `deploy_<nome>` seguindo o padrao ja validado no Identity: limpar `node_modules`, buildar, empacotar, `rsync` via SSH, smoke test).
2. Adicionar uma linha na tabela de `publish.md` com o comando `make deploy TARGET=<nome>` e o subdominio sugerido para a unidade (mesmo antes do Website existir na Configr -- nesse caso, marcar como pendente e registrar o subdominio sugerido para quando o Website for criado).
3. Antes de considerar o target funcional, verificar as mesmas classes de pendencia identificadas no Identity: schema/dados de producao do banco proprio da unidade, variaveis de ambiente de runtime (`DATABASE_URL`, secrets, `CORS_ORIGINS`), compatibilidade ESM/CJS de dependencias no build de producao, e o campo "Arquivo principal da aplicacao Node" configurado na Configr batendo com o entrypoint real do bundle publicado.

Isso mantem `tools/deploy.sh`, `publish.md` e a matriz de dominios deste documento sempre sincronizados, sem depender de pedido explicito a cada novo projeto.

### APIs

APIs publicas do ecossistema devem ficar sob:

```text
/api/<contexto>
```

Exemplos:

```text
/api/auth
/api/platform
/api/juridico
/api/fiscal
```

Essa decisao reduz a necessidade inicial de CORS entre subdominios e centraliza a superficie HTTP publica sob o dominio canonico.

No Configr, por isolamento de Websites, APIs devem usar subdominios de servico conforme a matriz Configr. Nesse caso, CORS e cookies precisam ser configurados explicitamente para `app.jboot.com.br`, `auth.jboot.com.br`, `api.jboot.com.br` e demais subdominios aprovados.

### Bancos e dados

Os bancos de staging e production devem ser isolados.

Exemplo logico:

```text
jboot_identity_stg
jboot_platform_stg
jboot_juridico_stg
jboot_pdv_stg

jboot_identity
jboot_platform
jboot_juridico
jboot_pdv
```

A estrategia `shared_db` ou `dedicated_database` por cliente/aplicacao deve continuar sendo governada pelo Identity via `database_refs`.

Tabelas de negocio multi-tenant devem preservar `client_id` e isolamento por JWT/contexto conforme os contratos dos projetos.

### Pipeline minimo

Cada pipeline de servico deve executar, no minimo:

```text
install dependencies
lint
typecheck
test, quando existir
build
build image
deploy staging
smoke staging
deploy production, protegido/manual
smoke production
```

O pipeline deve usar regras por path para evitar deploy de servicos nao afetados.

Mudancas em contratos compartilhados, Identity, seeds ou proxy podem exigir pipeline ampliado para consumidores.

### Smoke tests minimos

Smokes iniciais por ambiente com reverse proxy proprio/path routing:

```text
GET /
GET /login
GET /pdv
GET /juridico
GET /admin/identity
GET /api/auth/health
GET /api/platform/health
GET /api/juridico/health
```

Smokes iniciais no Configr:

```text
GET https://jboot.com.br/
GET https://app.jboot.com.br/login
GET https://app.jboot.com.br/pdv
GET https://app.jboot.com.br/juridico
GET https://admin.jboot.com.br/
GET https://auth.jboot.com.br/health
GET https://api.jboot.com.br/health
GET https://juridico-api.jboot.com.br/health
```

Quando aplicavel:

```text
login admin
login usuario
emissao de contexto para application_slug=pdv
emissao de contexto para application_slug=juridico
validacao de menu por application_slug
validacao de rejeicao de acesso sem role/scope
```

### Mecanismo de deploy confirmado: rsync por SSH, nao git remote

Confirmado em 2026-08-05 com o usuario: a Configr **nao hospeda repositorio git** por Website. Cada Website tem um usuario SSH proprio (mesmo nome do subdominio, ex: `auth`, `admin`, `app`, `apinode`) e uma pasta fixa `~/<subdominio>.jboot.com.br/www/`. O deploy e sincronizacao direta de arquivos via `rsync` sobre SSH para essa pasta.

**CORRIGIDO em 2026-08-17** (contradiz a nota anterior deste paragrafo): a Configr **nao** reinicia o processo Node sozinha so por causa de mudanca de conteudo do build. Confirmado via `ps` no servidor -- o processo `lsnode:` do Website `auth` continuou rodando com o PID de 10 dias atras mesmo depois de varios `make deploy TARGET=identity-api`. So reinicia quando o campo "Arquivo principal da aplicacao Node" e explicitamente alterado no painel (isso sim foi observado reiniciando antes). Fora esse caso, o processo (gerenciado por Phusion Passenger) fica com o codigo/env antigos ate alguem mata-lo -- a Configr o reergue sob demanda na proxima requisicao (spawn-on-demand). Por isso `tools/deploy.sh` agora mata o processo remoto via SSH (`pkill -u $(whoami) -f lsnode`) logo apos o rsync, em todo target que serve um processo Node.js (`restart_remote_process`, nao se aplica a `landing`/`portfolio`, que sao Websites tipo `React` sem processo).

Isso substitui a suposicao anterior deste documento (e dos primeiros `.gitlab-ci.yml`) de "git push deploy" contra um remote git exposto pela Configr. Mecanismo atual:

- Script: `scripts/deploy/rsync-deploy.sh <source_dir> <ssh_target> <remote_path>`.
- Template CI: `.rsync_deploy` em `ci/deploy-template.gitlab-ci.yml` (o antigo `.git_push_deploy` fica mantido so por compatibilidade ate os demais servicos migrarem).
- Variaveis por servico/ambiente: `<SERVICO>_SSH_TARGET_PROD`/`_STG` (ex: `IDENTITY_API_SSH_TARGET_PROD=auth@ip-23-239-11-216.cloudezapp.io`), em vez de `<SERVICO>_GIT_REMOTE_PROD`/`_STG`.
- Autenticacao: chave SSH dedicada (`CONFIGR_SSH_PRIVATE_KEY`, publica cadastrada em "Chaves autorizadas" de cada usuario SSH na Configr) e `CONFIGR_SSH_KNOWN_HOSTS` (host key do servidor, `ip-23-239-11-216.cloudezapp.io`).

CONFIRMADO em 2026-08-06: a Configr NAO instala dependencias nem builda a aplicacao sozinha. Testado manualmente por SSH no Website `admin` -- `npm install`/`npm ci` terminam com exit 0, mas pacotes grandes (ex: `next`, com binarios do SWC) ficam incompletos de forma inconsistente nesse servidor compartilhado (swap alto observado no momento do teste). Por isso o CI sempre entrega um pacote ja pronto pra rodar:

- `bff-jboot-identity`: `npm run build` + `npm prune --omit=dev` no CI; deploy envia `dist/` e `node_modules` (so producao) junto do `package.json`. Arquivo principal na Configr: `dist/main.js`.
- `app-jboot-identity-admin`: Next.js com `output: "standalone"` (`next.config.js`); o build gera `.next/standalone/` autocontido (com `server.js` e `node_modules` minimo). Arquivo principal na Configr: `server.js`.

Em ambos os casos, `<subdominio>@configr` so precisa executar o arquivo indicado -- nenhuma instalacao ou build acontece no servidor.

Atencao (erro real cometido em 2026-08-06): `DEPLOY_REMOTE_PATH` sempre precisa incluir o prefixo `<subdominio>.jboot.com.br/` antes de `www` (ex: `admin.jboot.com.br/www`, nao so `www`). Usar so `www` sincroniza para `~/www` na raiz da conta SSH -- um diretorio novo e sem uso, diferente da pasta real servida (`~/<subdominio>.jboot.com.br/www/`, que e um symlink para `/srv/...`). O template `.rsync_deploy` nao tem mais valor padrao para essa variavel exatamente para forcar essa decisao explicita a cada servico.

Excecao: Websites tipo `React` (usado hoje so pela landing) tem um campo proprio "Caminho base da aplicacao" na configuracao do Website, que pode apontar para qualquer subpasta dentro de `www/` (confirmado em 2026-08-06 para `site-jboot-landing`: `ecosystem/implementations/site-jboot-landing/out`). Isso e especifico do tipo `React`; Websites `Node.js` servem direto da raiz de `www/`. Ao criar um novo Website React, confirmar e registrar esse caminho antes de configurar `DEPLOY_REMOTE_PATH` no `.gitlab-ci.yml` correspondente.

### Bugs reais no `tools/deploy.sh` (deploy manual) e regra permanente para evita-los

O `tools/deploy.sh` (deploy manual sem GitLab CI, ver "Fluxo 2" em `publish.md`) ja causou incidentes reais em producao/dev por misturar caminhos de host, de container e de `cd` na mesma string de comando, e por assumir nomes/dominios sem confirmar o que foi de fato criado na Configr:

1. **2026-08-16 -- quebrou o ambiente de dev**: as funcoes `deploy_*` rodavam `rm -rf node_modules && npm ci` (e `npm prune --omit=dev` para identity-api/platform-api) **direto no diretorio de dev compartilhado** (`implementations/<projeto>`), o mesmo que `tools/code-up.sh` usa para `nest start`/`next dev`. Isso apagou `@nestjs/cli` (devDependency) do `bff-jboot-identity` e trocou o layout `pnpm` do `app-jboot-next-platform` por um layout `npm` no meio de um `next dev` ja rodando -- causando loop infinito de recompilacao no navegador (webpack com cache apontando pra caminhos `.pnpm/...` que deixaram de existir).
   - Correcao: todo build roda numa copia isolada em `.deploy-build/<projeto>` (dentro do bind mount, fora de `implementations/`), preparada via `tar` (nao `rsync` -- a imagem do container de dev nao tem `rsync` instalado, so o runner de CI tinha). O `node_modules` de dev nunca mais e tocado por um deploy.
2. **2026-08-17 -- path duplicado apos `cd`**: em `deploy_identity_admin`/`deploy_platform_web`, o comando enviado ao container fazia `cd $build && ... && cp -r public '$bundle/public'`, onde `$bundle` ja incluia `$build` no prefixo (`$bundle="$build/.next/standalone"`). Depois do `cd $build`, usar `$bundle` (caminho relativo calculado a partir do cwd ORIGINAL) resolve relativo ao NOVO cwd -- resultando em `$build/$build/.next/standalone/public`, que nao existe (`cp: cannot create directory ...: No such file or directory`).

3. **2026-08-17 -- dominio com grafia diferente da planejada**: o Website do portfolio foi combinado como `portifolio.jboot.com.br` (com "i", grafia escolhida pelo usuario) e assim documentado antecipadamente em `publish.md`/`tools/deploy.sh` (regra da secao "Rotina obrigatoria..."), mas o Website criado de fato na Configr usou `portfolio.jboot.com.br` (sem "i", grafia do nome do diretorio do projeto). O primeiro `make deploy TARGET=portfolio` falhou com `rsync: [Receiver] mkdir ... failed: No such file or directory` porque o `DEPLOY_REMOTE_PATH`/`remote_path` no script continuava com "i".
   - Correcao: confirmar por SSH (`ls -la ~/` no usuario do Website) o nome real do diretorio/symlink ANTES de rodar o primeiro deploy de uma unidade nova -- nao confiar so no que foi combinado em chat antes da criacao manual do Website. `portfolio.jboot.com.br` (sem "i") foi adotado como grafia definitiva; script e docs atualizados.

4. **2026-08-17 -- diretorio orfao com dono root trava rsync no primeiro deploy real**: no primeiro `make deploy TARGET=platform-api`, a Configr ja tinha criado `www/dist/` como `root:root` (Passenger provavelmente cria o diretorio do "Arquivo principal" na primeira tentativa de spawn, antes de existir conteudo real, com privilegio elevado). O usuario SSH do Website (`apinode`, dono do resto de `www/`) nao tem permissao pra escrever DENTRO de um diretorio que nao possui, mesmo sendo dono do pai -- `rsync` falhou com `mkdir ... Permission denied` em cascata, e nem `rm -rf dist` funciona via SSH (`sudo` bloqueado pro usuario do Website). So o gerenciador de arquivos do painel Configr (roda com privilegio elevado) conseguiria apagar.
   - Correcao adotada (evita depender do gerenciador de arquivos ou de suporte): publicar numa subpasta nova (`www/app/`, nao a raiz de `www/`), evitando qualquer colisao com o `dist/` orfao. Exige trocar "Arquivo principal da aplicacao Node" no painel de `dist/main.js` para `app/dist/main.js`. Aplicado em `deploy_platform_api` (`tools/deploy.sh`); replicar o mesmo padrao (`remote_path` com subpasta `app/`) em qualquer novo target Node.js cujo primeiro deploy real esbarre no mesmo problema.

**Regra permanente:** dentro de uma mesma string passada para `run_in_container` (ou qualquer `bash -lc` remoto), nunca misturar `cd $var` com o reuso de outra variavel que ja inclua `$var` no prefixo. Depois de um `cd`, usar so caminhos relativos ao novo cwd (ex: `.next/standalone/public`, nao `$build/.next/standalone/public`); variaveis com o caminho completo (ex: `$bundle`, usado depois pelo `rsync-deploy.sh` no host) sao validas apenas em comandos que **nao** fizeram `cd` antes. Alem disso, ao preparar o primeiro deploy real de uma unidade nova, confirmar por SSH o nome exato do diretorio/dominio criado na Configr antes de configurar `DEPLOY_REMOTE_PATH`/variaveis do `tools/deploy.sh` -- nao assumir que o nome combinado em chat foi o nome efetivamente usado na criacao manual do Website. Ao adicionar um novo target ao `tools/deploy.sh`, revisar a string final montada (nao so o `case`) com essa regra em mente.

### Variaveis de ambiente de producao: sem UI no painel, workaround via `.env` empacotado

Confirmado em 2026-08-17: os Websites tipo `Node.js` da Configr (abas "Geral", "Acessos", "Aplicacao", "Dominio", "Performance", "Databases", "Crons") **nao tem nenhum campo de variaveis de ambiente customizadas**. A aba "Aplicacao" so tem Timeout, Tamanho maximo de upload, Diretorio estatico, Permitir Origem, Versao do NodeJS, Ambiente da aplicacao (texto livre tipo "production", nao um seletor de env vars) e Arquivo principal. A aba "Databases" permite "Conectar database" (amarra um banco existente a aplicacao visualmente) mas nao expõe qual variavel de ambiente isso gera nem foi usada no fluxo atual -- o Identity foi configurado via o workaround abaixo, nao via esse conector.

Workaround adotado (`bff-jboot-identity`, replicar nos demais Node.js quando chegar a vez):

- `src/main.ts` carrega um `.env` na raiz do bundle via `process.loadEnvFile()` (API nativa do Node >=20.12/21.7, sem dependencia de `dotenv`), antes de qualquer leitura de `process.env` pelo Nest. Caminho resolvido com `join(__dirname, '..', '.env')` (robusto a partir de `dist/main.js`, independente do cwd que a Configr usa pra rodar o processo).
- O `.env` de producao fica em `implementations/<projeto>/.env.production.local` -- gitignored (`.env.*.local`), nunca commitado. `tools/deploy.sh` copia esse arquivo para `.env` dentro do pacote de build antes do rsync; falha explicitamente se o arquivo nao existir (evita subir sem config e cair nos fallbacks inseguros hardcoded em `app-config.service.ts`).
- Conteudo minimo pro Identity: `JBOOT_IDENTITY_DATABASE_URL` (Postgres real, `127.0.0.1:5432` -- mesmo servidor fisico do Website, nao precisa expor a porta publicamente), `JBOOT_IDENTITY_JWT_SECRET` (gerado com `openssl rand -base64 48`, nunca o default de dev) e `CORS_ORIGINS` (dominios reais de producao que fazem login).

### Banco de producao do Identity: schema e seed aplicados manualmente via SSH

Confirmado em 2026-08-17: como `bff-jboot-identity` nao usa ORM/migrations (schema vive em `docker/postgres/init/*.sql`, que so roda automaticamente no `docker-entrypoint-initdb.d` de um volume Postgres novo em dev), o banco `jboot_identity` de producao precisou ser inicializado manualmente. Caminho usado (a Configr nao expoe a porta do Postgres publicamente -- confirmado timeout ao tentar conectar direto do host; a porta so responde em `127.0.0.1` de dentro do proprio servidor):

1. SSH em qualquer usuario de Website ja existente no mesmo servidor (ex: `auth1@ip-23-239-11-216.cloudezapp.io`) -- o Postgres roda no mesmo host.
2. `psql` ja vem instalado no servidor; conexao com `PGPASSWORD=... psql -h 127.0.0.1 -U jbootdb -d jboot_identity`.
3. Arquivos de schema aplicados nessa ordem (concatenados, `-v ON_ERROR_STOP=1`): `002_identity.sql`, um seed de producao adaptado do `003_identity_dev_seed.sql` (senha/email reais, sem a logica de limpeza destrutiva de dados "nao-canonicos" do seed de dev -- producao pode ter outros clientes legitimos no futuro), `004_identity_contracts.sql`, `005_identity_databases_onboarding.sql`, `021_identity_permission_versions.sql`, `022_identity_layout_preferences.sql`, `023_identity_manager_scope.sql` (no-op ate `pdv`/`flow` existirem em prod), `025_client_capabilities.sql`.
4. **Faltou na primeira tentativa e quebrou o login com `500` / `column e.module_attributes does not exist`**: `034_entitlement_module_attributes.sql` -- um `ALTER TABLE` puro de schema, numerado junto com varios seeds de modulo (007/008/010/014) que foram deliberadamente adiados por serem dados de modulos ainda nao publicados (`pdv`, `platform`, `juridico`, `flow`). Aplicado depois, junto com `020_platform_notifications.sql` e `036_observability_capability.sql` (tambem schema/dado seguro do Identity, sem dependencia de modulo nao publicado).

**Licao:** ao aplicar `docker/postgres/init/*.sql` manualmente contra producao, nao filtrar so pelo nome do arquivo ("é seed de modulo, posso pular") -- abrir cada arquivo e checar se ele so contem `INSERT` de dados de um modulo especifico (pode adiar) ou se tambem tem `ALTER TABLE`/`CREATE TABLE` de schema geral (nao pode adiar, quebra em runtime de forma inesperada). `grep -l jboot_identity docker/postgres/init/*.sql` da o universo candidato; a analise de conteudo caso a caso e obrigatoria.

Identidades de producao criadas (per regra de `Identity/Platform Permissions` do `CLAUDE.md`): Operador Senior (cpf `00000000191`, cliente `JBoot`) com `global_master` + entitlement total no `identity-admin`; Usuario Teste (cpf `00011122233`, cliente `Demo JBoot`) com vinculo basico, **sem** entitlement ao `identity-admin` (correto -- so ganha acesso quando um app final, tipo `pdv`/`juridico`, for publicado e receber o seed de entitlement equivalente ao dev).

### Risco aceito: primeiro deploy do Identity sem staging

Em 2026-08-05 os Websites `auth.jboot.com.br`, `admin.jboot.com.br`, `app.jboot.com.br` e `apinode.jboot.com.br` foram criados diretamente em producao na Configr, sem os equivalentes de staging (`stg-auth`, `stg-admin`). Decisao: pular staging no primeiro deploy do Identity (`bff-jboot-identity`, `app-jboot-identity-admin`) para acelerar a publicacao inicial.

Isso quebra a diretiva de "mesmo artefato promovido entre ambientes" e a exigencia de `deploy-staging` + `smoke-staging` antes de producao descritas neste documento. Os jobs de staging desses dois projetos foram comentados em `.gitlab-ci.yml` e `deploy-production` aponta direto para `build`. Mitigar assim que possivel:

- criar `stg-auth.jboot.com.br` e `stg-admin.jboot.com.br` na Configr;
- descomentar os jobs de staging em `implementations/bff-jboot-identity/.gitlab-ci.yml` e `implementations/app-jboot-identity-admin/.gitlab-ci.yml`;
- devolver o `needs` de `deploy-production` para `smoke-staging`.

Novos projetos (`app-jboot-next-platform`, `bff-jboot-platform`) devem seguir o fluxo completo com staging desde o inicio; esta excecao vale apenas para o primeiro lote do Identity.

### Informacoes necessarias do servidor configr

Para implementar o deploy real ainda sera necessario levantar:

- IP publico do servidor.
- provedor e painel DNS.
- reverse proxy escolhido: Nginx, Traefik, Caddy, Coolify, Portainer ou outro.
- estrategia de TLS/Let's Encrypt.
- registry de imagens.
- forma de execucao: Docker Compose, stack, systemd, Kubernetes ou plataforma gerenciada.
- portas disponiveis.
- politica de backup.
- local dos volumes persistentes.
- estrategia de secrets.
- capacidade de CPU, memoria e disco.

## Tradeoffs

### Dominio unico com paths

Vantagens:

- experiencia de marca unificada.
- menos subdominios.
- CORS mais simples.
- cookies e redirects mais previsiveis.
- URLs publicas mais claras para usuarios.

Custos:

- reverse proxy mais critico.
- frontends precisam respeitar paths/basePath.
- smokes devem validar roteamento por path.
- erros de proxy podem afetar multiplas aplicacoes.

### Landing separada

Vantagens:

- deploy e rollback independentes.
- SEO/cache/marketing isolados.
- menor risco para Identity e Platform.

Custo:

- mais uma unidade de build/deploy.
- roteamento adicional no proxy.

## Diretiva final

Adotar:

```text
monorepo
deploy independente por servico
GitLab como repositorio principal privado
staging e production separados no configr
Configr com Website separado por servico operacional
Configr com subdominios por servico para isolar recursos
dominio publico principal jboot.com.br para landing
app.jboot.com.br para area autenticada
landing institucional em projeto separado
Identity como plano de controle
```
