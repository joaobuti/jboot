#!/usr/bin/env bash
# Runner de migracao de schema do JBoot (docs/product/hostinger-vps-hosting-sprints.md, S1).
#
# Aplica, em ordem alfabetica, os arquivos .sql de um diretorio (padrao:
# docker/postgres/init) que ainda nao constam em jboot_schema_migrations, um
# psql por arquivo com ON_ERROR_STOP. Usa psql de proposito: varios arquivos
# usam meta-comandos (\c, \gexec) que ferramentas sem psql nao executam.
#
# Conexao pelas variaveis padrao do libpq: PGHOST, PGPORT, PGUSER, PGPASSWORD
# e PGDATABASE (banco de manutencao onde fica a tabela de controle; os arquivos
# trocam de banco com \c).
#
# Uso:
#   tools/db/migrate.sh [--dir DIR] [--post DIR] [--dry-run] [--baseline] [--allow-changed]
#
#   --dir DIR        diretorio das migracoes versionadas (padrao docker/postgres/init)
#   --post DIR       diretorio de arquivos re-executados a cada rodada, depois das
#                    migracoes (ex.: credenciais de producao lidas de env); nao
#                    entram na tabela de controle e precisam ser idempotentes
#   --dry-run        so lista o que seria aplicado
#   --baseline       registra todos os arquivos como aplicados sem executa-los
#                    (banco que ja tem o schema, ex.: volume de dev antigo)
#   --allow-changed  nao falha quando um arquivo ja aplicado mudou de conteudo
#
# Um arquivo ja aplicado que mudou de conteudo falha a rodada por padrao: a
# mudanca nao seria aplicada e o banco divergiria do repositorio em silencio.
# A correcao certa e um arquivo novo; --allow-changed so registra o novo hash.
set -euo pipefail

dir="docker/postgres/init"
post_dir=""
dry_run=0
baseline=0
allow_changed=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) dir="$2"; shift 2 ;;
    --post) post_dir="$2"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    --baseline) baseline=1; shift ;;
    --allow-changed) allow_changed=1; shift ;;
    -h|--help) sed -n '2,29p' "$0"; exit 0 ;;
    *) echo "migrate: argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

[ -d "$dir" ] || { echo "migrate: diretorio inexistente: $dir" >&2; exit 2; }
: "${PGDATABASE:?migrate: defina PGDATABASE (banco de manutencao)}"

psql_ctl() { psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }

psql_ctl -c "CREATE TABLE IF NOT EXISTS jboot_schema_migrations (
  filename   text PRIMARY KEY,
  sha256     text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)"

# Sem lock entre rodadas: cada arquivo usa um psql proprio, entao um advisory
# lock de sessao nao cobriria a rodada inteira. Por isso o runner so roda como
# job one-shot unico do deploy (servico `migrate` do compose de producao),
# nunca em paralelo.
applied=$(psql_ctl -c "SELECT filename || ' ' || sha256 FROM jboot_schema_migrations")

pending=0
changed=0
for path in "$dir"/*.sql; do
  [ -e "$path" ] || continue
  file=$(basename "$path")
  sum=$(sha256sum "$path" | cut -d' ' -f1)
  recorded=$(printf '%s\n' "$applied" | awk -v f="$file" '$1 == f { print $2 }')

  if [ -n "$recorded" ]; then
    if [ "$recorded" != "$sum" ]; then
      changed=$((changed + 1))
      if [ "$allow_changed" -eq 1 ]; then
        echo "migrate: AVISO $file mudou depois de aplicado; registrando novo hash sem reaplicar"
        [ "$dry_run" -eq 1 ] || psql_ctl -c "UPDATE jboot_schema_migrations SET sha256 = '$sum' WHERE filename = '$file'"
      else
        echo "migrate: ERRO $file mudou depois de aplicado (registrado $recorded, atual $sum)" >&2
      fi
    fi
    continue
  fi

  pending=$((pending + 1))
  if [ "$dry_run" -eq 1 ]; then
    echo "pendente: $file"
    continue
  fi
  if [ "$baseline" -eq 1 ]; then
    echo "baseline: $file"
  else
    echo "aplicando: $file"
    psql -X -q -v ON_ERROR_STOP=1 -f "$path" >/dev/null
  fi
  psql_ctl -c "INSERT INTO jboot_schema_migrations (filename, sha256) VALUES ('$file', '$sum')"
done

if [ "$changed" -gt 0 ] && [ "$allow_changed" -eq 0 ]; then
  echo "migrate: $changed arquivo(s) aplicado(s) foram alterados; crie um arquivo novo com a mudanca" >&2
  exit 1
fi

if [ -n "$post_dir" ]; then
  [ -d "$post_dir" ] || { echo "migrate: diretorio --post inexistente: $post_dir" >&2; exit 2; }
  for path in "$post_dir"/*.sql; do
    [ -e "$path" ] || continue
    if [ "$dry_run" -eq 1 ]; then
      echo "post: $(basename "$path")"
    else
      echo "post: $(basename "$path")"
      psql -X -q -v ON_ERROR_STOP=1 -f "$path" >/dev/null
    fi
  done
fi

echo "migrate: $pending pendente(s) $([ "$dry_run" -eq 1 ] && echo 'listado(s)' || echo 'processado(s)')"
