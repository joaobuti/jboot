#!/usr/bin/env bash
set -euo pipefail

# Deploy manual (sem GitLab CI) para producao na Configr.
#
# Motivo: o GitLab CI/CD do projeto atingiu o limite de minutos gratuitos
# e a decisao foi nao contratar minutos pagos nem configurar runner
# proprio por enquanto (2026-08-11). Este script replica localmente o
# mesmo build + empacotamento + rsync que os jobs `*:deploy-production`
# dos `.gitlab-ci.yml` fariam, usando a mesma chave SSH ja configurada
# em ~/.ssh/jboot_configr_deploy.
#
# Rotina obrigatoria ao adicionar um novo target aqui (docs/deploy.md,
# secao "Rotina obrigatoria ao preparar o primeiro deploy real de uma
# unidade"): tambem adicionar a linha correspondente na tabela de
# publish.md (comando + subdominio), e validar as mesmas classes de
# pendencia ja resolvidas no Identity (banco, env vars, ESM/CJS,
# "Arquivo principal da aplicacao Node" na Configr) antes de considerar
# o target funcional.
#
# Uso: tools/deploy.sh <target>
# Targets disponiveis: identity-api, identity-admin, landing, platform-api, platform-web, portfolio
#
# Requer: containers do dev (`make code-up TARGET=identity`) meio
# irrelevante aqui -- este script builda direto via `docker compose exec
# jboot`, nao depende dos processos code-up/code-down.

target="${1:?informe o target: identity-api | identity-admin | landing}"
SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/jboot_configr_deploy}"

if [ ! -f "$SSH_KEY" ]; then
  echo "chave SSH nao encontrada em $SSH_KEY (defina DEPLOY_SSH_KEY se for outro caminho)" >&2
  exit 1
fi

run_in_container() {
  docker compose exec -T jboot bash -lc "$1"
}

# Diretorio de build isolado, dentro do bind mount (visivel no host para o
# rsync) mas fora de implementations/<projeto> -- nunca mexe no node_modules
# que o code-up.sh usa para dev. Corrigido em 2026-08-16: antes o deploy
# rodava `rm -rf node_modules && npm ci` (e `npm prune --omit=dev` no caso
# de identity-api/platform-api) direto no diretorio de dev compartilhado.
# Isso quebrou duas vezes: apagou @nestjs/cli (devDependency) do
# bff-jboot-identity, e trocou o layout pnpm do app-jboot-next-platform por
# um layout npm no meio de um `next dev` ja rodando, causando loop infinito
# de recompilacao no navegador (webpack com cache apontando pra caminhos
# .pnpm/... que deixaram de existir).
BUILD_ROOT=".deploy-build"

prepare_build_copy() {
  local src_dir="$1"
  local build_dir="$BUILD_ROOT/$(basename "$src_dir")"

  echo "==> preparando copia isolada para build ($build_dir)"
  # cp em vez de rsync: a imagem do container de dev nao tem rsync instalado
  # (so o runner de CI tinha). node_modules/.next/dist/.venv/.git sao
  # excluidos na origem via tar, ja que cp nao tem --exclude nativo.
  run_in_container "rm -rf '$build_dir' && mkdir -p '$BUILD_ROOT' '$build_dir' && tar -C '$src_dir' -c --exclude node_modules --exclude .next --exclude dist --exclude .venv --exclude .git . | tar -C '$build_dir' -x"
}

# A Configr NAO reinicia o processo Node sozinha quando so o conteudo do
# build muda (confirmado em 2026-08-17) -- so quando o campo "Arquivo
# principal da aplicacao Node" e alterado no painel. O processo (`lsnode:`,
# gerenciado por Passenger) fica com o codigo/env antigos em memoria ate
# alguem mata-lo; a Configr o resobe sob demanda na proxima requisicao
# (spawn-on-demand). Por isso todo deploy de um Website tipo Node.js precisa
# matar o processo explicitamente depois do rsync.
restart_remote_process() {
  local ssh_target="$1"
  echo "==> reiniciando processo remoto ($ssh_target)"
  # Matar o processo direto na mesma sessao SSH derruba a propria conexao
  # (confirmado em 2026-08-17: `ssh ... pkill -f lsnode` retorna exit 255,
  # sessao cai antes mesmo do pkill terminar -- o supervisor de sessao da
  # Configr parece matar a sessao inteira junto com o processo do site).
  # Por isso o kill e agendado em background (nohup + disown) para rodar 1s
  # depois que a sessao SSH ja tiver se desconectado normalmente.
  ssh-agent bash -c "ssh-add '$SSH_KEY' && ssh -o StrictHostKeyChecking=yes '$ssh_target' 'nohup bash -c \"sleep 1; pkill -u \$(whoami) -f lsnode\" >/dev/null 2>&1 & disown; echo scheduled'"
  sleep 3
}

deploy_identity_api() {
  local dir="implementations/bff-jboot-identity"
  local build="$BUILD_ROOT/bff-jboot-identity"
  local ssh_target="auth1@ip-23-239-11-216.cloudezapp.io"
  local remote_path="auth.jboot.com.br/www"

  prepare_build_copy "$dir"

  # A Configr nao tem UI de variaveis de ambiente por Website -- so painel
  # de banco, versao do Node e arquivo principal (ver docs/deploy.md). O
  # `.env` de producao (gitignored, nunca commitado) e empacotado junto e
  # carregado em runtime via `process.loadEnvFile` em src/main.ts.
  run_in_container "test -f '$build/.env.production.local' || { echo 'faltando implementations/bff-jboot-identity/.env.production.local (variaveis de producao)' >&2; exit 1; }"
  run_in_container "cp '$build/.env.production.local' '$build/.env'"

  echo "==> [identity-api] instalando dependencias e buildando"
  run_in_container "cd $build && npm ci && npm run build && npm prune --omit=dev"

  echo "==> [identity-api] enviando via rsync para $ssh_target:$remote_path"
  ssh-agent bash -c "ssh-add '$SSH_KEY' && bash scripts/deploy/rsync-deploy.sh '$build' '$ssh_target' '$remote_path'"

restart_remote_process "$ssh_target"

  echo "==> [identity-api] smoke test"
  curl -fsS -m 10 https://auth.jboot.com.br/health && echo
}

deploy_identity_admin() {
  local dir="implementations/app-jboot-identity-admin"
  local build="$BUILD_ROOT/app-jboot-identity-admin"
  local bundle="$build/.next/standalone"
  local ssh_target="jboot5@ip-23-239-11-216.cloudezapp.io"
  local remote_path="admin.jboot.com.br/www"

  prepare_build_copy "$dir"

  # cp public/images/favicon.ico para a raiz do bundle: confirmado em
  # 2026-08-20 que a Configr serve requisicoes de arquivo com extensao
  # (ex: /favicon.ico) direto pelo servidor web, sem passar pelo Node, e
  # 404 se o arquivo nao existir fisicamente em www/ -- a rota dinamica
  # gerada pelo Next a partir de src/app/favicon.ico nunca e alcancada.
  echo "==> [identity-admin] instalando dependencias e buildando (output: standalone)"
  run_in_container "cd $build && npm ci && npm run build && cp -r public '.next/standalone/public' && mkdir -p '.next/standalone/.next' && cp -r .next/static '.next/standalone/.next/static' && cp public/images/favicon.ico '.next/standalone/favicon.ico'"

  echo "==> [identity-admin] enviando via rsync para $ssh_target:$remote_path"
  ssh-agent bash -c "ssh-add '$SSH_KEY' && bash scripts/deploy/rsync-deploy.sh '$bundle' '$ssh_target' '$remote_path'"

restart_remote_process "$ssh_target"

  echo "==> [identity-admin] smoke test"
  curl -fsS -m 10 -o /dev/null -w 'HTTP %{http_code}\n' https://admin.jboot.com.br/
}

deploy_landing() {
  local dir="implementations/site-jboot-landing"
  local build="$BUILD_ROOT/site-jboot-landing"
  local bundle="$build/out"
  local ssh_target="jboot3@ip-23-239-11-216.cloudezapp.io"
  local remote_path="jboot.com.br/www/ecosystem/implementations/site-jboot-landing/out"

  prepare_build_copy "$dir"

  # A copia isolada pode ter herdado .env.local do diretorio original. Se o
  # Next.js encontrar .env.local durante o build de producao, o link
  # "Entrar" do site publicado aponta para localhost -- por isso e removido
  # explicitamente antes do build, so na copia (o original nunca e tocado).
  run_in_container "rm -f '$build/.env.local'"

  echo "==> [landing] instalando dependencias e buildando (export estatico, sem .env.local)"
  run_in_container "cd $build && npm ci && npm run build"

  echo "==> [landing] enviando via rsync para $ssh_target:$remote_path"
  ssh-agent bash -c "ssh-add '$SSH_KEY' && bash scripts/deploy/rsync-deploy.sh '$bundle' '$ssh_target' '$remote_path'"

  echo "==> [landing] smoke test"
  curl -fsS -m 10 -o /dev/null -w 'HTTP %{http_code}\n' https://jboot.com.br/
}

deploy_platform_api() {
  local dir="implementations/bff-jboot-platform"
  local build="$BUILD_ROOT/bff-jboot-platform"
  local ssh_target="apinode@ip-23-239-11-216.cloudezapp.io"
  # Subpasta "app" (nao a raiz de www/) porque "www/dist" ficou orfao com
  # dono root no primeiro deploy (Passenger criou o diretorio antes de
  # existir conteudo real, sem permissao pro usuario apinode apagar depois).
  # "Arquivo principal da aplicacao Node" no painel precisa ser
  # "app/dist/main.js" (nao "dist/main.js") por causa disso.
  local remote_path="apinode.jboot.com.br/www/app"

  prepare_build_copy "$dir"

  run_in_container "test -f '$build/.env.production.local' || { echo 'faltando implementations/bff-jboot-platform/.env.production.local (variaveis de producao)' >&2; exit 1; }"
  run_in_container "cp '$build/.env.production.local' '$build/.env'"

  echo "==> [platform-api] instalando dependencias e buildando"
  run_in_container "cd $build && npm ci && npm run build && npm prune --omit=dev"

  echo "==> [platform-api] enviando via rsync para $ssh_target:$remote_path"
  ssh-agent bash -c "ssh-add '$SSH_KEY' && bash scripts/deploy/rsync-deploy.sh '$build' '$ssh_target' '$remote_path'"

restart_remote_process "$ssh_target"

  echo "==> [platform-api] smoke test"
  curl -fsS -m 10 https://apinode.jboot.com.br/health && echo
}

deploy_platform_web() {
  local dir="implementations/app-jboot-next-platform"
  local build="$BUILD_ROOT/app-jboot-next-platform"
  local bundle="$build/.next/standalone"
  local ssh_target="app1@ip-23-239-11-216.cloudezapp.io"
  local remote_path="app.jboot.com.br/www"

  prepare_build_copy "$dir"

  # Este projeto usa pnpm (pnpm-lock.yaml e a lockfile real/mais recente),
  # nao npm -- diferente dos demais targets. Usar npm ci aqui gera um
  # node_modules com layout errado.
  echo "==> [platform-web] instalando dependencias e buildando (output: standalone, pnpm)"
  run_in_container "cd $build && pnpm install --frozen-lockfile && pnpm run build && cp -r public '.next/standalone/public' && mkdir -p '.next/standalone/.next' && cp -r .next/static '.next/standalone/.next/static' && cp public/images/favicon.ico '.next/standalone/favicon.ico'"

  echo "==> [platform-web] enviando via rsync para $ssh_target:$remote_path"
  ssh-agent bash -c "ssh-add '$SSH_KEY' && bash scripts/deploy/rsync-deploy.sh '$bundle' '$ssh_target' '$remote_path'"

restart_remote_process "$ssh_target"

  echo "==> [platform-web] smoke test"
  curl -fsS -m 10 -o /dev/null -w 'HTTP %{http_code}\n' https://app.jboot.com.br/
}

deploy_portfolio() {
  local dir="implementations/site-joao-buti-portfolio"
  local build="$BUILD_ROOT/site-joao-buti-portfolio"
  local bundle="$build/dist"
  local remote_path="portfolio.jboot.com.br/www"
  # Website ainda nao existe na Configr (2026-08-11). Domain sugerido e
  # confirmado pelo usuario: portfolio.jboot.com.br. Defina esta variavel
  # com o usuario SSH real depois de criar o Website (mesmo padrao dos
  # outros: nome nao segue o subdominio, so aparece na tela de "cloud user"
  # do Website apos criado).
  local ssh_target="${PORTFOLIO_SSH_TARGET:?defina PORTFOLIO_SSH_TARGET=usuario@ip-23-239-11-216.cloudezapp.io depois de criar o Website portfolio.jboot.com.br na Configr}"

  prepare_build_copy "$dir"

  echo "==> [portfolio] instalando dependencias e buildando (Astro static)"
  run_in_container "cd $build && SITE_URL=https://portfolio.jboot.com.br npm ci && SITE_URL=https://portfolio.jboot.com.br npm run build"

  echo "==> [portfolio] enviando via rsync para $ssh_target:$remote_path"
  ssh-agent bash -c "ssh-add '$SSH_KEY' && bash scripts/deploy/rsync-deploy.sh '$bundle' '$ssh_target' '$remote_path'"

  echo "==> [portfolio] smoke test"
  curl -fsS -m 10 -o /dev/null -w 'HTTP %{http_code}\n' https://portfolio.jboot.com.br/
}

case "$target" in
  identity-api)
    deploy_identity_api
    ;;
  identity-admin)
    deploy_identity_admin
    ;;
  landing)
    deploy_landing
    ;;
  platform-api)
    deploy_platform_api
    ;;
  platform-web)
    deploy_platform_web
    ;;
  portfolio)
    deploy_portfolio
    ;;
  *)
    echo "target desconhecido: $target (use identity-api | identity-admin | landing | platform-api | platform-web | portfolio)" >&2
    exit 1
    ;;
esac

echo "==> [$target] deploy manual concluido"
