# Requisitos de infraestrutura — wrk-jboot-juridico (e observabilidade)

Documento pronto para encaminhar ao suporte da Configr. Registra o que já foi confirmado por teste real (não são suposições) e as perguntas em aberto sobre um produto de VPS/Docker.

Contexto: hoje uso Websites individuais (Node.js/React/Python) na Configr, hospedagem compartilhada, sem acesso root. Preciso de um ambiente com acesso root/Docker para rodar (1) um worker Python (`wrk-jboot-juridico`) que depende de Playwright/Chromium e de um Temporal Server, e (2) uma stack de observabilidade (Grafana, Mimir, Tempo, Loki, MinIO via docker compose). Confirmei via SSH que os Websites atuais não têm sudo/root nem `apt-get`.

## 1. O que precisa funcionar de verdade (`wrk-jboot-juridico`)

Confirmado empiricamente em 2026-08-17 via SSH num Website Python da Configr: o binário do Chromium baixa normalmente (`playwright install chromium`), mas falha ao iniciar com `error while loading shared libraries: libnspr4.so: cannot open shared object file` — faltam bibliotecas de sistema que exigem `apt-get install` com root, indisponível nos usuários SSH atuais.

### 1.1 Ambiente de execução
- Docker com privilégio de root no host (não hospedagem compartilhada tipo "Website").
- Processo de longa duração com restart automático (`docker run --restart unless-stopped` ou equivalente) — o worker roda um loop contínuo, não é request/response.
- Python 3.11+ (testado com 3.12).

### 1.2 Bibliotecas de sistema pro Chromium (Playwright)
Lista completa, já validada no Dockerfile de dev (`.docker/jboot/Dockerfile`):

```
libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcups2
libdbus-1-3 libdrm2 libgbm1 libgl1 libnspr4 libnss3 libx11-xcb1
libxcb-dri2-0 libxcb-dri3-0 libxcb-glx0 libxcb-present0 libxcb-randr0
libxcb-sync1 libxcb-xfixes0 libxcomposite1 libxdamage1 libxfixes3
libxi6 libxkbcommon0 libxrandr2 libxshmfence1
fonts-freefont-ttf fonts-liberation fonts-noto-color-emoji
```

Via `apt-get install`, ou `playwright install --with-deps chromium` (faz isso automaticamente, com root).

### 1.3 Temporal Server
- Container `temporalio/auto-setup` (imagem oficial) rodando e acessível pelo worker em `TEMPORAL_ADDRESS=<host>:7233`.
- Não precisa de banco próprio complexo — usa o mesmo Postgres (schema/banco dedicado, ex: `temporal`), modo `auto-setup` com driver `postgres12` cuida da inicialização sozinho.

### 1.4 Rede — acesso ao Postgres já existente
- O worker precisa alcançar o Postgres de produção (hoje só escuta em `127.0.0.1`, não exposto externamente) para ler/escrever no banco do módulo Jurídico (e possivelmente `jboot_identity`).
- Se o worker ficar num host diferente do Postgres atual: liberação de IP específico, rede privada, ou mover/replicar o Postgres para o mesmo host do worker.

### 1.5 Rede — acesso de saída (outbound)
- Internet liberada para acessar os sites dos tribunais (eProc, futuramente ESAJ/Projudi).
- Acesso de saída para baixar os binários do Chromium na primeira instalação (ou já embutido numa imagem Docker pronta).

### 1.6 Rede — porta própria do worker
- Porta `8020` (ou a definida) acessível pelo `bff-jboot-platform`, que consulta o worker via `JBOOT_JURIDICO_WORKER_URL`.

### 1.7 Recursos (dimensionamento)
- Mínimo sugerido: 2 vCPU / 4GB RAM (Chromium headless consome RAM por instância ativa; ajustar conforme volume real de scraping simultâneo).
- Disco: binário do Chromium (~200MB) + cache/downloads de documentos processados.

## 2. Perguntas em aberto para o suporte

### 2.1 Produto de VPS / servidor com Docker
- Existe um produto de **VPS com acesso root** (não o modelo "Website" compartilhado)? Nome/plano?
- Vem com Docker/Docker Compose pré-instalado, ou instalação do zero numa distro limpa (Ubuntu/Debian)?
- Specs disponíveis (vCPU, RAM, disco) e preços — precisa aguentar Grafana+Mimir+Tempo+Loki+Postgres+MinIO **e** o worker com Chromium rodando junto.
- É um servidor totalmente separado da hospedagem atual (outro IP, outra conta) ou vinculável na mesma conta/faturamento?

### 2.2 Rede entre o VPS e os Websites atuais
- O Postgres atual só aceita conexão em `127.0.0.1`. Se um worker no VPS precisar consultar esse banco, como conectar?
  - Dá para liberar o Postgres só para o IP do VPS (não o mundo todo)?
  - Existe rede privada/VPC entre os produtos (VPS ↔ hospedagem compartilhada)?
  - Ou a recomendação é migrar o Postgres para dentro do próprio VPS?
- Redis/Valkey: hoje não disponível nos Websites — no VPS seria autogerenciado via Docker?

### 2.3 DNS e IP
- O VPS vem com IP público próprio? Novos registros DNS (ex: `observability.jboot.com.br`, subdomínio técnico do worker) apontariam para esse IP separado do atual (`23.239.11.216`)?

### 2.4 Migração futura (não urgente, só mapear)
- Os Websites Node.js atuais (`auth`, `admin`, `app`, `apinode`) podem futuramente rodar no VPS também, ou o modelo é sempre "Website" para aplicação web e VPS só para infra auxiliar (observabilidade, workers)?
- Isso mudaria o modelo de deploy atual (rsync por SSH para pasta fixa `www/`)?

### 2.5 Suporte/gestão
- VPS é self-managed (só o SO, resto por conta própria) ou há suporte de configuração inicial?
- Snapshot/backup automático, ou configuração manual?

## 3. Status

Pendente: aguardando resposta do suporte da Configr sobre o produto de VPS/Docker. `wrk-jboot-juridico` e `ops-jboot-observability` seguem fora do escopo de deploy até essa definição (ver `publish.md`, seção "Projetos fora do escopo atual do `tools/deploy.sh`").
