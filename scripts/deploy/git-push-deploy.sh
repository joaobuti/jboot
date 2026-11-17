#!/usr/bin/env bash
set -euo pipefail

# Faz deploy de um diretorio (codigo-fonte ou artefato ja buildado) via
# "git push deploy": cria um snapshot novo (sem historico do monorepo) e
# forca o push para o remote/branch que a Configr observa naquele Website.
#
# Uso: git-push-deploy.sh <source_dir> <remote_url> [branch]

SOURCE_DIR="${1:?informe o diretorio de origem}"
REMOTE_URL="${2:?informe a remote url do Website na Configr}"
BRANCH="${3:-main}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "diretorio nao encontrado: $SOURCE_DIR" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  "${SOURCE_DIR%/}/" "$WORKDIR/"

cd "$WORKDIR"
git init -q -b "$BRANCH"
git config user.email "ci@jboot.com.br"
git config user.name "JBoot CI"
git add -A
git commit -q -m "deploy: ${CI_COMMIT_SHORT_SHA:-manual} $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push --force "$REMOTE_URL" "HEAD:$BRANCH"
