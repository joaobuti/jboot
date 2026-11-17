#!/usr/bin/env bash
# Deploy de producao no VPS (docs/product/hostinger-vps-hosting-sprints.md, S3).
#
# Instalado pelo root em /usr/local/sbin/jboot-deploy (dono root, 0755) e
# amarrado a chave SSH do CI no authorized_keys do usuario `deploy`:
#   command="/usr/local/sbin/jboot-deploy",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 ...
# Assim a chave do CI so executa este script: nao abre shell, nao faz tunel e
# nao consegue alterar o proprio script.
#
# Comandos (vem em SSH_ORIGINAL_COMMAND):
#   deploy <tag>   le do stdin um tar com docker-compose.prod.yml e Caddyfile,
#                  publica em /opt/jboot/releases/<tag>, faz pull e up -d,
#                  espera o migrate e os healthchecks e aponta `current`
#   status         lista release atual e estado dos containers
#
# Rollback: rodar de novo o job de deploy do pipeline do commit anterior (o
# mesmo tag de imagem continua no registry).
set -euo pipefail

# Overrides so para teste local: sob o forced command do SSH o cliente nao
# consegue definir variaveis de ambiente (PermitUserEnvironment fica em no).
BASE=${JBOOT_DEPLOY_BASE:-/opt/jboot}
PROJECT=${JBOOT_DEPLOY_PROJECT:-jboot}
SKIP_PULL=${JBOOT_DEPLOY_SKIP_PULL:-0}
KEEP_RELEASES=5

cmd=${SSH_ORIGINAL_COMMAND:-${*:-}}
read -r action tag extra <<<"$cmd" || true

compose() {
  docker compose -p "$PROJECT" \
    --project-directory "$1" \
    -f "$1/docker-compose.prod.yml" \
    --env-file "$BASE/.env" \
    --env-file "$1/release.env" \
    "${@:2}"
}

case "${action:-}" in
  status)
    echo "current: $(readlink "$BASE/current" 2>/dev/null || echo nenhum)"
    docker compose -p "$PROJECT" ps -a --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
    exit 0
    ;;
  deploy) ;;
  *)
    echo "jboot-deploy: comando nao permitido" >&2
    exit 2
    ;;
esac

if [ -n "${extra:-}" ] || ! [[ "${tag:-}" =~ ^[0-9a-f]{8,40}$ ]]; then
  echo "jboot-deploy: tag invalido (esperado sha do commit)" >&2
  exit 2
fi
[ -f "$BASE/.env" ] || { echo "jboot-deploy: $BASE/.env ausente" >&2; exit 1; }

exec 9>"$BASE/.deploy.lock"
flock -n 9 || { echo "jboot-deploy: outro deploy em andamento" >&2; exit 1; }

mkdir -p "$BASE/releases"
release="$BASE/releases/$tag"
tmp=$(mktemp -d "$BASE/releases/.incoming.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

# So os dois arquivos esperados; nada de caminho absoluto ou `..`.
tar -x -C "$tmp" --no-same-owner --no-same-permissions docker-compose.prod.yml Caddyfile
printf 'JBOOT_TAG=%s\n' "$tag" > "$tmp/release.env"

echo "==> validando compose do release $tag"
compose "$tmp" config --quiet

rm -rf "$release"
mv "$tmp" "$release"
trap - EXIT

if [ "$SKIP_PULL" != "1" ]; then
  echo "==> pull"
  compose "$release" pull --quiet
fi

echo "==> up"
compose "$release" up -d --remove-orphans --wait --wait-timeout 300

migrate_exit=$(docker inspect -f '{{.State.ExitCode}}' "$(compose "$release" ps -a -q migrate)")
if [ "$migrate_exit" != "0" ]; then
  echo "jboot-deploy: migrate terminou com $migrate_exit" >&2
  compose "$release" logs --tail 50 migrate >&2
  exit 1
fi

ln -sfn "$release" "$BASE/current"
echo "==> release atual: $tag"

# Mantem os ultimos releases para rollback rapido (o arquivo e pequeno; as
# imagens ficam no registry).
ls -1dt "$BASE"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
docker image prune -f --filter "until=168h" >/dev/null

compose "$release" ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
