#!/usr/bin/env bash
set -euo pipefail

target="${1:-identity}"

run_in_jboot() {
  docker compose exec -T jboot bash -lc "$1"
}

start_once() {
  local name="$1"
  local port="$2"
  local command="$3"
  local log_file="/tmp/jboot-dev-${name}.log"

  run_in_jboot "node -e \"const net=require('net'); const s=net.connect($port,'127.0.0.1'); s.on('connect',()=>{s.destroy(); process.exit(0)}); s.on('error',()=>process.exit(1)); setTimeout(()=>process.exit(1),500)\" && echo '$name already running on :$port' || (cd /workspace && nohup bash -lc '$command' </dev/null > '$log_file' 2>&1 & echo '$name started on :$port: $log_file')"
}

start_identity() {
  start_once \
    "identity-api" \
    "8000" \
    "cd implementations/bff-jboot-identity && PORT=8000 JBOOT_IDENTITY_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_identity npm run start:dev"

  start_once \
    "identity-admin" \
    "3000" \
    "cd implementations/app-jboot-identity-admin && npm run dev"
}

start_platform() {
  start_once \
    "platform-api" \
    "8010" \
    "cd implementations/bff-jboot-platform && PORT=8010 JBOOT_PDV_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_pdv JBOOT_KANBAN_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_kanban_demo_dev npm run start:dev"

  start_once \
    "platform-web" \
    "3002" \
    "cd implementations/app-jboot-next-platform && npm run dev"
}

start_juridico_worker() {
  # Worker Python dos portais juridicos (eProc, PJe/DJEN). Sem ele o BFF
  # responde 503 "Worker juridico indisponivel" nas telas de portal.
  start_once \
    "juridico-worker" \
    "8020" \
    "cd implementations/wrk-jboot-juridico && PYTHONUNBUFFERED=1 JBOOT_WORKER_API_PORT=8020 JBOOT_JURIDICO_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev .venv/bin/python -m src.workers.main"
}

print_urls() {
  echo ""
  echo "URLs:"
  echo "  Identity Admin: http://localhost:3000/login"
  echo "  Identity API:   http://localhost:8000/health"
  if [[ "$1" == *juridico* ]] || [[ "$1" == "platform" ]] || [[ "$1" == "all" ]]; then
    echo "  Platform Web:   http://localhost:3002"
    echo "  Platform API:   http://localhost:8010/health"
  fi
  if [[ "$1" == *juridico* ]] || [[ "$1" == "all" ]]; then
    echo "  Juridico Web:   http://localhost:3002/juridico"
    echo "  Juridico Worker: http://localhost:8020/pje/tribunais"
  fi
  echo ""
  echo "Logs:"
  echo "  docker compose exec jboot tail -f /tmp/jboot-dev-identity-api.log"
  echo "  docker compose exec jboot tail -f /tmp/jboot-dev-identity-admin.log"
  if [[ "$1" == *juridico* ]] || [[ "$1" == "platform" ]] || [[ "$1" == "all" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-dev-platform-api.log"
    echo "  docker compose exec jboot tail -f /tmp/jboot-dev-platform-web.log"
  fi
  if [[ "$1" == *juridico* ]] || [[ "$1" == "all" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-dev-juridico-worker.log"
  fi
}

docker compose up -d

case "$target" in
  identity)
    start_identity
    ;;
  platform)
    start_identity
    start_platform
    ;;
  juridico)
    start_identity
    start_platform
    start_juridico_worker
    ;;
  all)
    start_identity
    start_platform
    start_juridico_worker
    ;;
  *)
    echo "Unknown target: $target" >&2
    echo "Use: identity | platform | juridico | all" >&2
    exit 2
    ;;
esac

print_urls "$target"
