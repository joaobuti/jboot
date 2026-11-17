#!/usr/bin/env bash
set -euo pipefail

# Faz deploy de um diretorio via rsync direto por SSH para a pasta do
# Website na Configr. A Configr nao hospeda repositorio git; cada Website
# tem uma pasta fixa "~/<subdominio>/www/" acessada por um usuario SSH
# proprio, e NAO instala dependencias nem builda sozinha (confirmado em
# 2026-08-06: npm install no servidor falha de forma inconsistente pra
# pacotes grandes como o Next.js). Por isso o source_dir enviado deve ja
# ser um pacote pronto pra rodar (com node_modules/dist/.next incluidos
# quando aplicavel); node_modules NAO e excluido do rsync.
#
# Uso: rsync-deploy.sh <source_dir> <ssh_target> [remote_path]
# ssh_target exemplo: auth@ip-23-239-11-216.cloudezapp.io

SOURCE_DIR="${1:?informe o diretorio de origem}"
SSH_TARGET="${2:?informe o alvo ssh usuario@host}"
REMOTE_PATH="${3:?informe o caminho remoto completo, ex: admin.jboot.com.br/www}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "diretorio nao encontrado: $SOURCE_DIR" >&2
  exit 1
fi

rsync -az --delete \
  --exclude '.git' \
  -e "ssh -o StrictHostKeyChecking=yes" \
  "${SOURCE_DIR%/}/" "${SSH_TARGET}:${REMOTE_PATH}/"
