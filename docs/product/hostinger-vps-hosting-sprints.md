# Hospedagem do ecossistema JBoot no VPS Hostinger — sprints

Branch: `infra/hostinger-vps` (a partir de `main` 03627047b).

## Decisoes confirmadas pelo usuario (2026-11-13)

- Todo o ecossistema JBoot passa a ser hospedado num unico VPS Hostinger
  (KVM 4: 4 vCPU, 16 GB RAM, 200 GB NVMe, Ubuntu 26.04 LTS, Campinas),
  incluindo `site-jboot-landing` (`jboot.com.br`) e `site-joao-buti-portfolio`.
- O dominio e a zona DNS permanecem na Configr. A virada de cada servico e a
  troca do registro A do subdominio para o IP do VPS (`187.53.112.180`).
  Os servidores DNS nao mudam.
- Os Websites da Configr ficam no ar ate a virada de cada servico ser validada.
  Antes de cancelar qualquer servico da Configr, confirmar que a zona DNS
  continua ativa sem os Websites.
- O build das imagens acontece no GitLab CI e as imagens vao para o GitLab
  Container Registry. O VPS so executa `docker compose pull` + `up -d`. Nao ha
  build no servidor.

## Estado do servidor (Sprint 0 — concluida em 2026-11-13)

Host `jboot-prod` (alias SSH local `jboot-vps`, chave dedicada
`~/.ssh/jboot_vps`, fora do repositorio):

- SSH somente por chave (`PasswordAuthentication no`,
  `PermitRootLogin prohibit-password`, `MaxAuthTries 3`), em
  `/etc/ssh/sshd_config.d/00-jboot-hardening.conf`.
- ufw: deny incoming; 22/tcp, 80/tcp, 443/tcp e 443/udp liberados.
- fail2ban no sshd (5 falhas em 10 min, ban de 1 h).
- unattended-upgrades ativo.
- Swap de 4 GB, `vm.swappiness=10`.
- Docker Engine 29.9.3 + Compose v5.7.1 (repositorio oficial, `resolute`);
  logs json-file 20 MB x 5; `live-restore`.
- Usuario `deploy` (grupo docker, sem sudo); `authorized_keys` vazio ate a
  chave do CI ser criada; diretorio `/opt/jboot`.
- Backup semanal da Hostinger ativo (snapshot da VM no proprio provedor; nao
  substitui dump externo do Postgres).

Regra operacional: um container com `ports:` publicado passa por cima do ufw
(Docker escreve direto no iptables). No compose de producao, somente o reverse
proxy publica 80/443; os demais servicos ficam apenas em redes internas.

## Inventario de runtime (levantado em 2026-11-13)

| Unidade | lifecycle_status | Runtime | Dependencias de runtime |
|---|---|---|---|
| `site-jboot-landing` | functional | estatico (Next export `out/`) | nenhuma |
| `site-joao-buti-portfolio` | functional | estatico (Astro `dist/`) | nenhuma |
| `bff-jboot-identity` | functional | Node/Nest `dist/main.js` | Postgres `jboot_identity`, Valkey, SMTP |
| `app-jboot-identity-admin` | functional | Next standalone | Identity API (URL publica, build-time `NEXT_PUBLIC_*`) |
| `bff-jboot-platform` | functional | Node/Nest `dist/main.js` | Postgres (identity, platform, pdv, kanban, juridico, process_monitoring), Valkey, S3 (MinIO), SMTP, Gotenberg, ai-gateway, payments, juridico-data, wrk-juridico, fiscal (opcional) |
| `app-jboot-next-platform` | functional | Next standalone | Identity/Platform/AI Gateway (URLs publicas, build-time) |
| `svc-jboot-juridico-data` | functional | Python/FastAPI (uvicorn) | Postgres, DataJud (externo) |
| `wrk-jboot-juridico` | functional | Python, Temporal worker + FastAPI, Playwright | Temporal, Postgres, Identity, Platform API |
| `svc-jboot-ai-gateway` | in_progress | Node/Nest | Postgres `jboot_ai_gateway`, provedores de IA externos |
| `svc-jboot-payments` | in_progress | Go (api + worker), Dockerfile existente | Postgres `jboot_payments`, InfinitePay |
| `svc-jboot-fiscal` | scaffolded | PHP/Laravel, Dockerfile existente | Postgres `jboot_fiscal`, SEFAZ (bloqueado por certificado A1) |
| `ops-jboot-observability` | functional | compose proprio | OTEL collector e stack de observabilidade |
| `app-jboot-pdv-mobile` | planned | fora do VPS | — |

Infraestrutura minima de producao derivada do inventario: Postgres, Valkey,
MinIO (ou S3 externo), Temporal (com banco proprio), Gotenberg e o reverse
proxy. Ficam fora da producao: ClickHouse, MongoDB, Redpanda, Qdrant, RabbitMQ,
Mailpit, temporal-ui exposto e o container de desenvolvimento `jboot`. Nenhuma
unidade de producao le essas variaveis.

Nenhuma unidade Node ou Python tem Dockerfile de producao hoje. O deploy
anterior (Configr) empacotava `dist/` + `node_modules` ou Next standalone via
rsync.

## Achados bloqueantes

### B1 — Schema de banco sem migracao versionada

O schema vive em `docker/postgres/init/*.sql` (140 arquivos), executado pelo
`docker-entrypoint-initdb.d` apenas num volume Postgres vazio. Consequencias
em producao:

- Um volume novo executaria tambem os seeds de dev (`003`, `007`, `008`,
  `010`, `014`): senhas e dados de demonstracao.
- Depois da primeira subida, nenhum arquivo novo e aplicado. Toda sprint que
  adiciona um `NNN_*.sql` ficaria sem efeito em producao.
- Existem numeracoes repetidas (`020`, `026`, `027`, `058`, `085`, `086`). A
  ordem depende da ordenacao alfabetica.
- Nove arquivos usam `\gexec` (meta-comando do `psql`) para
  `CREATE DATABASE`. Ferramentas de migracao que nao usam `psql` (Flyway,
  ORMs) nao executam esses arquivos sem reescrita.
- Ja houve incidente (2026-08-17, `docs/deploy.md`): `ALTER TABLE` de schema
  dentro de arquivo com cara de seed, pulado na aplicacao manual, quebrou o
  login com 500.

Achado adicional (2026-11-13): a cadeia de `main` nao criava um banco do zero.
Teste num `pgvector/pgvector:pg18` vazio falhou em 5 arquivos por ordem:
`003` gravava `database_refs.updated_at` (coluna criada so no `005`), `014`
gravava em `identity_permission_versions` (tabela criada so no `021`) e `021`
nao tinha `\c jboot_identity`, rodando no banco `jboot` (derrubando `094` e
`104` em cascata). Os bancos de dev funcionavam porque cresceram aos poucos.

Os arquivos `003`, `007`, `008`, `010` e `014` (nomeados `*_dev_seed`) nao sao
seeds descartaveis: criam as identidades e clientes canonicos (Operador Senior,
Usuario Teste, JBoot, Demo JBoot), applications, entitlements e database_refs
que o CLAUDE.md exige em producao, e arquivos posteriores dependem deles
(`024` aborta sem o Operador Senior; `025`, `033`, `039`, `058`, `123` e `126`
os referenciam). Por isso todos os arquivos rodam em producao; o que muda sao
so as credenciais.

Solucao adotada (S1):

- `tools/db/migrate.sh`: runner `psql`, um processo por arquivo com
  `ON_ERROR_STOP`, tabela de controle `jboot_schema_migrations` (arquivo +
  sha256 + data) no banco de manutencao. Falha se um arquivo ja aplicado mudou
  de conteudo (`--allow-changed` so atualiza o hash). `--baseline` registra
  sem executar, para bancos que ja tem o schema. `--dry-run` lista pendentes.
- `docker/postgres/prod/010_identity_credentials.sql`: re-executado a cada
  rodada (`--post`), troca e-mail do Operador Senior e hashes bcrypt do
  Operador Senior e do Usuario Teste por valores de ambiente
  (`JBOOT_PROD_SENIOR_EMAIL`, `JBOOT_PROD_SENIOR_PASSWORD_HASH`,
  `JBOOT_PROD_DEMO_PASSWORD_HASH`); falha se faltar variavel ou se o hash de
  dev sobreviver.
- Correcoes de ordem: `002_identity.sql` passa a criar
  `database_refs.updated_at` e `identity_permission_versions` (ambos com
  `IF NOT EXISTS`, definicoes canonicas mantidas em `005`/`021`);
  `021_identity_permission_versions.sql` ganha `\c jboot_identity`.
- Em producao o Postgres NAO monta `docker/postgres/init` em
  `docker-entrypoint-initdb.d`; o schema entra so pelo runner.

Evidencia (2026-11-13, `pgvector/pgvector:pg18` descartavel): rodada 1 aplicou
os 140 arquivos sem erro; rodada 2 com 0 pendentes; `--post` sem variaveis
falhou com a variavel ausente; com variaveis trocou e-mail e hashes; com o hash
de dev falhou e reverteu; hash alterado em `jboot_schema_migrations` fez a
rodada falhar com exit 1. Bancos criados: `jboot`, `jboot_ai_gateway`,
`jboot_fiscal`, `jboot_identity`, `jboot_juridico_advocacia_dev`,
`jboot_kanban_demo_dev`, `jboot_payments`, `jboot_pdv`,
`jboot_process_monitoring`.

Riscos registrados:

- Nao foi comparado o schema gerado do zero com um banco de dev existente (dev
  estava desligado). Fazer na S4 com `pg_dump --schema-only` dos dois lados.
- Nomes de banco com sufixo `_dev` (`jboot_juridico_advocacia_dev`,
  `jboot_kanban_demo_dev`) vao para producao como estao; renomear exige mudar
  `\c` em dezenas de arquivos e as URLs de conexao. Fica como divida.
- Dev existente: antes de usar o runner num volume de dev antigo, rodar
  `--baseline` para nao reaplicar tudo.

### B2 — Producao atual na Configr com dados reais

`docs/deploy.md` registra o banco `jboot_identity` de producao na Configr,
inicializado manualmente em 2026-08-17, com o Operador Senior e o Usuario
Teste. Se houver clientes, usuarios ou registros reais nesse banco (ou em
outros da Configr), a virada exige `pg_dump` da Configr, restore no VPS e
marcacao no `schema_migrations` dos arquivos que ja estao aplicados. Isso
precisa acontecer antes do primeiro `up` com o runner.

## Perguntas abertas

| # | Pergunta | Impacto | Estado |
|---|---|---|---|
| Q1 | Ha dados reais na producao da Configr que precisam ser migrados? | B2, ordem da virada | respondida 2026-11-13: VPS comeca com banco limpo + seed de producao; dados uteis da Configr entram depois por migrations de dados dedicadas |
| Q2 | Estrategia de migracao de schema | B1, todas as sprints futuras | respondida 2026-11-13: runner `psql` com `schema_migrations` |
| Q3 | Unidades da primeira onda | escopo do compose | respondida 2026-11-13: todas as `functional` + `svc-jboot-ai-gateway` + `svc-jboot-payments` + `ops-jboot-observability`; `svc-jboot-fiscal` fora |
| Q4 | Staging no mesmo VPS | compose, CI | respondida 2026-11-13: so producao agora; staging no mesmo VPS em sprint posterior (risco aceito: sem promocao staging -> producao na primeira onda) |
| Q5 | Provedor SMTP de producao (convite, reset de senha, e-mails do Flow). | Identity e Platform | respondida 2026-11-14: SMTP da Configr (`smtp.jboot.com.br:587`, STARTTLS). Do VPS as portas 587/465 respondem e o certificado `*.jboot.com.br` e valido. Conta `nao-responda@jboot.com.br`; login SMTP (AUTH LOGIN) aceito em 2026-11-15, identity-api e platform-api recriados e "esqueci a senha" real disparado sem erro |
| Q7 | Backup externo do Postgres: destino (Cloudflare R2, Backblaze B2, S3, outro). | Sprint 5 | respondida 2026-11-14: Backblaze B2 (camada gratuita de 10 GB, API compativel com S3); execucao adiada pelo usuario, S5 pendente |

## Sprints

| Sprint | Entrega | Estado |
|---|---|---|
| S0 | Preparacao do servidor (ver "Estado do servidor") | concluida |
| S1 | Runner de migracao + credenciais de producao + correcoes de ordem da cadeia (B1) | concluida |
| S2 | Dockerfiles de producao por unidade + `docker-compose.prod.yml` + Caddyfile + `.env.example` de producao | concluida |
| S3 | Pipeline GitLab: build, push para o registry, deploy via usuario `deploy` (chave dedicada do CI) | concluida (codigo); configuracao no GitLab pendente do usuario |
| S4 | Subida no VPS e validacao sem DNS (hosts/IP); migracao de dados da Configr se Q1 exigir | concluida (sem stack de observabilidade e sem SMTP) |
| S5 | Backup diario do Postgres para Backblaze B2 + teste de restore | pendente (adiada pelo usuario em 2026-11-14) |
| S6 | Virada DNS subdominio a subdominio na Configr + smokes; atualizar `docs/deploy.md` | DNS e TLS concluidos em 2026-11-15; `docs/deploy.md` pendente |

## S2 — Imagens e compose de producao (concluida em 2026-11-13)

Arquivos em `deploy/vps/`:

- `images/nest.Dockerfile`: identity-api, platform-api, ai-gateway (Node 24
  bookworm-slim; glibc por causa do `@napi-rs/canvas`).
- `images/next.Dockerfile`: identity-admin (npm) e platform-web (pnpm
  10.34.9), `output: standalone`; `NEXT_PUBLIC_*` entram como build args
  (imagem especifica de producao).
- `images/python.Dockerfile`: juridico-data e juridico-worker (Python 3.13,
  uv 0.9.5; `INSTALL_PLAYWRIGHT=1` instala Chromium no worker).
- `images/static.Dockerfile`: landing (`out/`) e portfolio (`dist/`) servidos
  por Caddy file-server, sem Node.
- `images/migrate.Dockerfile`: runner + SQL de `docker/postgres/init` e
  `docker/postgres/prod` na versao do release.
- `svc-jboot-payments` usa o Dockerfile proprio do projeto (api + worker).
- `docker-compose.prod.yml`: 18 servicos; so o `edge` publica 80/443; redes
  `edge`, `data`, `pdf` (internal) e `jboot-observability` (externa, do stack
  `ops-jboot-observability`); servicos de aplicacao so sobem depois do
  `migrate` terminar com sucesso; variaveis obrigatorias com `:?`.
- `Caddyfile`: hosts lidos de `JBOOT_*_HOST`; TLS automatico.
- `.env.example`: modelo do `/opt/jboot/.env`.

Hosts publicos: os ja existentes (`jboot.com.br`, `portfolio`, `app`,
`admin`, `auth`, `apinode`) mais tres novos, que exigem registro A novo na
Configr: `ai-api.jboot.com.br` (o platform-web chama o AI Gateway pelo
navegador), `payments-api.jboot.com.br` (webhook do provedor de pagamento) e
`files.jboot.com.br` (URLs pre-assinadas do MinIO).

Evidencia (2026-11-13, Docker local, projeto isolado `jboot-vpstest`, sem
portas publicadas, com as imagens buildadas e `.env` de teste com segredos
aleatorios):

- As 12 imagens buildaram (worker 1,97 GB por causa do Chromium; demais entre
  60 MB e 460 MB).
- Os 18 servicos subiram; `migrate` aplicou os 140 arquivos + credenciais e
  saiu com 0.
- Pelo Caddy (TLS interno, `*.localhost`): 200 em landing, portfolio,
  `app/login`, admin, `auth/health`, `apinode/health`, `ai-api/health`,
  `payments-api/health` e `files/minio/health/live`.
- Login real no `auth/login` com a senha cujo hash veio do `.env` (aspas
  simples): 201 para Operador Senior e Usuario Teste; senha errada: 401.
- Sem erro nos logs das APIs; worker do juridico conectado ao Temporal nas
  filas `juridico-scraping`, `process-monitoring` e `process-publications`.
- RAM em repouso: cerca de 1,1 GB no total (Postgres 280 MB, platform-api
  136 MB).
- Stack de teste e volumes removidos ao final.

Riscos registrados:

- MinIO deixou de publicar imagens com tag de versao; fixada por digest
  (RELEASE.2025-09-07T16-13-09Z, quay.io). Sem atualizacoes de seguranca
  novas; avaliar substituto compativel com S3 (ex.: Garage, SeaweedFS) ou
  storage externo numa sprint propria.
- Temporal via `temporalio/auto-setup:1.29.1` (imagem de conveniencia que cria
  o schema no boot), usando o mesmo Postgres da aplicacao. Aceitavel para um
  VPS unico; trocar por `temporalio/server` + schema gerenciado se a carga
  crescer.
- Valkey sem senha, acessivel so pela rede interna `data`.
- `svc-jboot-fiscal` fora: `JBOOT_FISCAL_SERVICE_URL` fica no default e as
  chamadas fiscais falham ate o servico existir em producao.
- O stack `ops-jboot-observability` ainda nao foi adaptado ao VPS (ele publica
  portas so em 127.0.0.1, o que esta correto); integracao na S4.
- Graph Engineering: os nodes de deploy (VPS, proxy, registry) nao foram
  adicionados ao Architecture Graph nesta sprint; fazer junto da S3/S6, antes
  de marcar a entrega como concluida.

## S3 — Pipeline e deploy remoto (concluida em 2026-11-13)

- `deploy/vps/vps.gitlab-ci.yml` (incluido pelo `.gitlab-ci.yml` da raiz):
  - `vps:build:<imagem>` (11 jobs, stage `build`, so na branch padrao): builda
    com buildx em docker-in-docker e publica `registry.gitlab.com/jboot2/ecosystem/<imagem>`
    com tags `<sha>` e `main`, cache em `:buildcache`. Roda so quando os
    arquivos da imagem mudam, ou em todas com `VPS_BUILD_ALL=1`.
  - `vps:deploy` (manual, `resource_group: vps-production`): garante a tag
    `<sha>` em todas as imagens (sem rebuild das que nao mudaram, via
    `buildx imagetools create` a partir de `main`) e envia
    `docker-compose.prod.yml` + `Caddyfile` por SSH ao VPS.
- `deploy/vps/remote-deploy.sh`, instalado como `/usr/local/sbin/jboot-deploy`
  (root, 0755): aceita so `deploy <sha>` e `status`; extrai so os dois arquivos
  esperados para `/opt/jboot/releases/<sha>`, valida o compose, faz pull,
  `up -d --wait`, confere o exit do `migrate`, aponta `/opt/jboot/current` e
  guarda os ultimos 5 releases. `flock` impede deploy concorrente.
- Chave do CI `jboot-vps-ci` (fingerprint
  `SHA256:bHaAvjN2O8HSwsOwNIKTNQQ3hMJHLYa0rcMntjGcgBQ`; privada em
  `~/.ssh/jboot_vps_ci` na maquina do usuario, fora do repositorio) no
  `authorized_keys` do `deploy` com
  `command="/usr/local/sbin/jboot-deploy",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty`.
  `PermitUserEnvironment no` explicito.
- `/opt/jboot` passou a `root:deploy 0770`.

Evidencia (2026-11-13):

- Script de deploy testado localmente com as imagens da S2: comando fora da
  lista e tag invalido recusados (exit 2); deploy subiu os 18 servicos, aplicou
  o `migrate` e apontou `current`; redeploy do mesmo sha ok; pacote sem os
  arquivos esperados recusado sem criar release.
- No VPS, com a chave do CI: shell arbitrario recusado ("comando nao
  permitido"); `status` respondeu; port forward recusado
  ("administratively prohibited", registrado no log do sshd).

Configuracao no GitLab (`jboot2/ecosystem`), feita pelo usuario em 2026-11-14:

1. Container Registry habilitado no projeto (ja vinha ligado).
2. Variaveis protegidas (Settings > CI/CD > Variables): `VPS_HOST`,
   `VPS_SSH_PRIVATE_KEY` (File, conteudo de `~/.ssh/jboot_vps_ci`) e
   `VPS_SSH_KNOWN_HOSTS` (File, linha `187.53.112.180 ssh-ed25519 ...`).
3. Deploy Token `jboot-vps` (`read_registry`, sem expiracao), login gravado no
   VPS para o usuario `deploy`; `docker pull` dos espelhos da MinIO verificado.
   A senha do login tem que ser o `gldt-` do deploy token: um `glpat-` pessoal
   tambem passa no `docker login`, mas para de funcionar quando o token
   pessoal e revogado.
4. Espelhos `minio` e `minio-mc` enviados ao registry (push exige token com
   `read_registry` e `write_registry`).

Variaveis de CI nao verificadas por API (sem token do projeto); a primeira
execucao de `vps:deploy` as testa.

Bloqueio de cota: os minutos de CI/CD compartilhados do GitLab do mes ja
foram excedidos (informado em 2026-11-14). Sem runner proprio, nenhum job
roda ate a cota renovar. Resolvido em 2026-11-14 com runner de projeto na maquina
do usuario (WSL): container `gitlab-runner` (`gitlab/gitlab-runner:alpine-v18.5.0`,
`--restart unless-stopped`), config em `~/gitlab-runner/config` (fora do git),
executor docker privilegiado (exigido pelo docker-in-docker dos builds),
`concurrent = 2`, runner marcado como Protected (so branches protegidas) e
instance runners desligados no projeto. Jobs so rodam com o computador e o
WSL ligados. Runner no VPS de producao foi descartado por disputar recursos e
exigir acesso ao Docker do servidor.

Bloqueio encontrado: o job `ai-governance` (stage `verify`, `when: always`)
falha hoje na `main` por pendencias anteriores a este trabalho (contextos de
IA desatualizados no kanban, revisao do perfil AI-first vencida em
2026-11-03, texto ausente no contrato do process-monitoring). Como os jobs de
build ficam no stage seguinte, nenhum `vps:build:*` roda na `main` enquanto
isso nao for corrigido. Nao foi contornado com `needs: []`, para nao pular o
gate de governanca.

## S4 — Primeira subida no VPS (concluida em 2026-11-13)

Feita sem o GitLab (usuario remoto, sem acesso ao git):

- As 11 imagens buildadas localmente na S2 foram enviadas por SSH
  (`docker save | gzip | ssh 'docker load'`, 96 s) e marcadas com o sha do
  release `2aac4009576a5af3913fe61ec869b4eb99ab0bdb`, ja no nome do registry
  (`registry.gitlab.com/jboot2/ecosystem/<imagem>`), para o primeiro deploy
  pelo CI encontrar o mesmo nome.
- MinIO: `quay.io` responde 401 ate por digest e o Docker Hub nao tem mais as
  tags; o compose passou a usar `${JBOOT_REGISTRY}/minio:RELEASE.2025-09-07T16-13-09Z`,
  copia enviada ao VPS a partir do cache local. Falta espelhar essa imagem no
  registry do GitLab (`docker push`), senao um servidor novo nao consegue
  subir.
- Caddy com `JBOOT_CADDY_TLS_MODE=local_certs` (CA interna) enquanto o DNS
  aponta para a Configr; na virada, esvaziar a variavel para usar Let's
  Encrypt.
- `/opt/jboot/.env` gerado no proprio VPS (root:deploy 0640): segredos com
  `openssl rand`, e-mail do Operador Senior definido pelo usuario, senhas
  iniciais aleatorias com hash bcrypt gerado no servidor, chave do DataJud
  enviada por stdin. Senhas iniciais em `/root/jboot-initial-credentials.txt`
  (root 0600). SMTP vazio (Q5 aberta).
- Deploy pelo proprio `/usr/local/sbin/jboot-deploy`, executado como root com
  `JBOOT_DEPLOY_SKIP_PULL=1`; `releases/` e `.deploy.lock` devolvidos para
  `root:deploy` para os proximos deploys pelo CI.
- Rede `jboot-observability` criada vazia; o stack de observabilidade ainda
  nao sobe no VPS.

Evidencia (2026-11-13, da maquina do usuario para `187.53.112.180` com
`curl --resolve`, sem DNS):

- 200 em `jboot.com.br`, `portfolio`, `app/login`, `admin`, `auth/health`,
  `apinode/health`, `ai-api/health`, `payments-api/health`,
  `files/minio/health/live`; `www` 301 para o apex; HTTP 308 para HTTPS.
- Portas 5432, 6379, 9000, 7233, 8000 e 8010 fechadas para a internet.
- Login no Identity dentro do VPS com as senhas do arquivo do root: 201
  Operador Senior, 201 Usuario Teste, 401 com senha errada; e-mail do Operador
  Senior gravado; nenhum hash de dev no banco; 140 migracoes registradas.
- Worker do juridico conectado ao Temporal; sem erros nos logs das APIs.
- Uso: 1,9 GB de RAM de 15 GB; 16 GB de disco de 193 GB.

Pendencias que seguem:

- GitLab: configurado em 2026-11-14 (ver S3); runner proprio no WSL do usuario desde 2026-11-14 (cota de minutos excedida no mes).
- `ai-check` falhando na `main` bloqueia os builds do pipeline.
- SMTP de producao (Q5): ativo desde 2026-11-15 (Configr, `nao-responda@jboot.com.br`).
- Backup externo do Postgres (S5): destino decidido em 2026-11-14, Backblaze B2; implementacao adiada pelo usuario. Ate la, so existe o snapshot semanal da Hostinger (mesmo provedor, ate 7 dias de perda). Risco aceito temporariamente.
- Stack `ops-jboot-observability` no VPS.
- Comparacao do schema gerado do zero com um banco de dev real.
- Migrations de dados uteis da Configr (Q1).
- Nodes de deploy no Architecture Graph.

## Observabilidade no VPS (concluida em 2026-11-14)

Pedido do usuario (Q6: observabilidade na primeira onda).

- Stack `implementations/ops-jboot-observability` no modo monolitico de no
  unico, como projeto compose `jboot-observability` em
  `/opt/jboot-observability` (copia de `compose.yaml` + `config/`), com
  `deploy/vps/observability/compose.vps.yml` por cima:
  - MinIO e `mc` vindos de copias espelhadas
    (`registry.gitlab.com/jboot2/ecosystem/minio` e `.../minio-mc`), porque as
    imagens originais nao baixam mais;
  - coletor (`otel-gateway`) tambem na rede `jboot-observability`, a mesma que
    o `docker-compose.prod.yml` usa;
  - todas as portas so em 127.0.0.1; Grafana por tunel SSH
    (`ssh -L 3300:127.0.0.1:3300 jboot-vps`).
- `.env` gerado no VPS (tenant `jboot-production`, ambiente `production`);
  senha do admin do Grafana em `/root/jboot-initial-credentials.txt`.
- `JBOOT_OTLP_HTTP_ENDPOINT=http://otel-gateway:4318` no `/opt/jboot/.env`;
  release `4c44d150d` com a URL completa `/v1/traces` para o Payments (o
  exportador Go usa `WithEndpointURL`).
- Continua `production_readiness: blocked` pelo contrato do projeto: sem HA,
  object storage no proprio VPS, sem backup. Serve como observabilidade
  operacional interna.

Evidencia (2026-11-14, no VPS): Mimir, Tempo, Loki e Grafana prontos (200);
coletor saudavel e sem erros; traces do `platform-api` no Tempo; metricas do
`platform-api` e dos componentes da stack no Mimir (jobs `platform-api`,
`otelcol-contrib`, `mimir`, `tempo`, `loki`). RAM da stack: cerca de 590 MB;
total do VPS 2,3 GB de 15 GB.

Falhas encontradas:

- `svc-jboot-payments` nao enviava telemetria: `telemetry_setup_failed`,
  "conflicting Schema URL 1.43.0 e 1.37.0" (`semconv/v1.37.0` fundido com
  `resource.Default()`), e traces e metricas usavam a mesma URL. Corrigido em
  2026-11-14 na branch `fix/payments-otel-schema` (1d9e4ced9, com teste de
  regressao contra coletor falso), mesclada aqui; `PAYMENTS_OTLP_ENDPOINT`
  passou a ser a URL base. Release `d6a30b1c4` no VPS: traces de
  `svc-jboot-payments` e `svc-jboot-payments-worker` no Tempo, metricas no
  Mimir, zero `telemetry_setup_failed`.
- `identity-api`, `ai-gateway` e `juridico-data` nao tem instrumentacao
  OpenTelemetry; `wrk-jboot-juridico` tem, mas nao apareceu nos traces da
  janela verificada (sem execucao de workflow no periodo).

### Consumo de tokens de IA (pergunta do usuario, 2026-11-14)

- Toda chamada de IA por API passa pelo `svc-jboot-ai-gateway` (o
  `bff-jboot-platform` chama `/v1/executions`; nenhum outro projeto chama
  OpenAI/Anthropic direto). O gateway ja grava `input_tokens` e
  `output_tokens` por execucao em `ai_executions` (banco `jboot_ai_gateway`).
  `estimated_cost` existe na tabela mas e gravado sempre `NULL`.
- O gateway nao tem OpenTelemetry. As rotinas da assinatura Claude (conector
  do Flow) nao passam pela API e nao expoem tokens ao JBoot.
- Caminhos (nao implementados; feature em `implementations/*` exige o fluxo
  governado PO -> PE -> Architect antes):
  1. Dashboard no Grafana lendo `ai_executions` via datasource Postgres
     com usuario somente leitura (usa dado que ja existe).
  2. Metricas OTel no gateway seguindo as convencoes GenAI
     (`gen_ai.client.token.usage`, por modelo e tipo de token) -> Mimir ->
     Grafana, com alertas de consumo.
  3. Custo: tabela de preco por modelo para preencher `estimated_cost`.

## S6 — Virada de DNS (2026-11-15)

Nameservers continuam na Configr/Cloudez; so registros foram trocados pelo
usuario no painel.

- Fase 1 (so adicao): A `187.53.112.180` e AAAA `2a02:4780:c6:4512::1` para
  `app`, `admin`, `auth`, `apinode`, `ai-api`, `payments-api` e `files`.
  `JBOOT_CADDY_TLS_MODE` esvaziado no `/opt/jboot/.env` (copia em
  `.env.bak-tls`) e `edge` recriado: certificados Let's Encrypt emitidos para
  os 7 nomes (validade 2027-02-13, renovacao automatica pelo Caddy).
- Antes da fase 2, comparacao Configr x VPS: landing com HTML e CSS de texto
  identicos; portfolio com `/`, `/pt/`, `/en/`, `/es/` e `robots.txt`
  identicos no conteudo. O CSS do portfolio no VPS e menor (14 KB x 51 KB),
  mas define todas as classes usadas; a diferenca sao utilitarios Tailwind
  sem uso no build da Configr.
- Fase 2: raiz (CNAME da Configr trocado por A/AAAA), `www` (CNAME para
  `jboot.com.br.`) e `portfolio` (A/AAAA). Caddy reiniciado para tentar de
  novo apos o backoff; certificados emitidos. Smoke: raiz 200, `www` 301 para
  a raiz, HTTP 308 para HTTPS, portfolio 200, resposta `via: 1.1 Caddy`;
  IPv6 200.
- Intocados: MX, `mail`, `smtp`, `imap`, `pop`, `webmail`, SPF, DKIM, DMARC
  (e-mail segue na Configr) e os sites `api`, `apifa`, `fabr`, `sempre` e
  `www.portfolio`, que continuam apontando para a Configr.

Pendente: atualizar `docs/deploy.md` para o VPS; decidir o destino de
`www.portfolio` (hoje cai na Configr); desligar os sites JBoot na Configr
so depois de alguns dias sem trafego para ela.

## Primeira migracao de dados (2026-11-15)

Cliente real CHAGAS E SALVADOR (usuario master Edervandes) copiado do banco
local para a producao a pedido do usuario: Identity (usuario, credencial,
cliente, entitlement Flow, capacidades), Flow (boards, cards, escritorios,
importacao), clientes no PDV e acompanhamento processual com historico.
Sessoes e tokens de acesso locais ficaram de fora. IDs de aplicacoes, bancos
e usuarios de seed foram mapeados por slug/nome/CPF; contagens conferidas e
todas as FKs validadas. Script operacional fora do repositorio (dados
pessoais nao passam pelo git).

Pendente por decisao do usuario: os 173 acompanhamentos estao `active` no
banco, mas sem workflow no Temporal da producao, entao nao consultam
DataJud/DJEN. Iniciar via `POST /process-monitors` do juridico-worker (rota
idempotente, a mesma usada pela plataforma) quando o usuario liberar.

### Board "Manaus" do cliente de teste levado ao cliente real (2026-11-15)

A pedido do usuario, a configuracao do board de teste "Manaus" (cliente
"Cliente Teste Drive") foi copiada para CHAGAS E SALVADOR como board novo
"Manaus", com ids novos: 5 colunas, 8 regras de automacao, 3 acoes de coluna,
3 status e 2 tags, membro admin = usuario master, entrada do escritorio
Manaus dele. Do escritorio de teste foram as 3 versoes do contrato de servicos
(a v3 e o .docx do kit, enviado ao bucket `kanban-card-attachments`, hash
conferido) e a configuracao de validacao de cadastro. Cards, kits gerados de
clientes e historico do board de teste nao foram.

Os 4 agentes "rotina Claude" usados pelas regras foram copiados para o
cliente dele: prompts (todas as versoes) e token da rotina decifrados com a
chave local e cifrados de novo com a chave de producao e o AAD do novo
cliente/dono, sem gravar texto em claro em disco. Decifragem na producao
conferida.

`AI_GATEWAY_EXECUTION_ENABLED=true` no VPS desde 2026-11-15, aprovado pelo
usuario (copia anterior em `/opt/jboot/.env.bak-ai`). O modo `claude_routine`
so depende dessa chave; `AI_GATEWAY_ENABLED_PROVIDERS` continua `openai` e
nenhum agente `api` existe em producao. Falta, do lado do usuario, as rotinas
na conta Claude apontarem o conector para
`https://apinode.jboot.com.br/kanban/mcp`.

## Cookie de sessao entre admin.* e app.* (2026-11-15)

O Flow em `app.jboot.com.br` respondia `Missing bearer token` logo apos o
login em `admin.jboot.com.br`: as imagens Next do VPS foram buildadas sem
`NEXT_PUBLIC_COOKIE_DOMAIN` e o cookie da sessao ficava preso em `admin.*`.
Mesmo bug ja corrigido na Configr em `e8d2940bb`. O pipeline passa
`VPS_COOKIE_DOMAIN=.jboot.com.br` aos dois builds Next desde `7b811c02c`.

Na mesma investigacao, todo `vps:build:*` falhava no runner `wsl-buti` ao
criar o builder (`buildx` nao aceita o TLS do dind por variavel de ambiente);
corrigido em `52785c4e5` com um docker context. Depois disso `platform-web`
buildou no CI e `identity-admin` falhou no build (passa local com os mesmos
args; log do job 18047936875 ainda nao lido). O aviso vermelho de cota no
GitLab vale para os runners compartilhados, nao para o `wsl-buti`.

### Envio direto de imagem, sem pipeline

Usado nesta correcao. Cada servico aceita uma tag propria no `release.env`
da release atual (`IDENTITY_ADMIN_TAG`, `PLATFORM_WEB_TAG`, `LANDING_TAG`,
etc.; ver `deploy/vps/docker-compose.prod.yml`). Para uma imagem buildada na
maquina local:

    docker save <registry>/<imagem>:<sha> | gzip -1 | ssh jboot-vps 'gunzip | sudo docker load'
    # no VPS: backup do release.env, acrescentar <IMAGEM>_TAG=<sha> e
    # compose ... up -d --no-deps --pull never <servico>

Estado atual: release `d6a30b1c4` com `IDENTITY_ADMIN_TAG` e
`PLATFORM_WEB_TAG` = `52785c4e5` (backup em `release.env.bak-cookie`). O
proximo `vps:deploy` do pipeline cria release nova e volta a usar uma tag so;
antes dele, `identity-admin:<sha>` precisa existir no registry.
