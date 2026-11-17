#!/usr/bin/env bash
set -euo pipefail

target="${1:-identity}"

containers_required() {
  case "$target" in
    identity)
      echo "postgres valkey jboot"
      ;;
    juridico-data)
      echo "jboot"
      ;;
    platform | juridico | kanban)
      echo "postgres valkey jboot jboot-fiscal"
      ;;
    pdv | kanban-attachments)
      echo "postgres valkey jboot jboot-fiscal minio"
      ;;
    kanban-leads)
      echo "postgres valkey jboot jboot-fiscal minio gotenberg"
      ;;
    kanban-monitoring)
      # Flow com acompanhamento de processos (ADR 021): Temporal para o workflow do acompanhamento.
      echo "postgres valkey jboot jboot-fiscal temporal"
      ;;
    fiscal)
      echo "postgres jboot-fiscal"
      ;;
    payments)
      echo "postgres jboot"
      ;;
    ai-gateway)
      echo "postgres jboot"
      ;;
  esac
}

containers_optional() {
  case "$target" in
    identity)
      echo ""
      ;;
    juridico-data)
      echo "postgres valkey"
      ;;
    platform)
      echo "rabbitmq temporal minio otel-collector"
      ;;
    juridico)
      echo "temporal rabbitmq otel-collector"
      ;;
    pdv)
      echo "rabbitmq"
      ;;
    kanban | kanban-attachments | kanban-leads | kanban-monitoring)
      echo "otel-collector mailpit"
      ;;
    fiscal)
      echo ""
      ;;
    payments)
      echo "otel-collector"
      ;;
    ai-gateway)
      echo "otel-collector"
      ;;
  esac
}

containers_forbidden_by_default() {
  case "$target" in
    identity)
      echo "mongodb rabbitmq temporal redpanda minio clickhouse qdrant otel-collector gotenberg"
      ;;
    juridico-data)
      echo "mongodb rabbitmq temporal redpanda minio clickhouse qdrant otel-collector temporal-ui gotenberg"
      ;;
    platform)
      echo "mongodb redpanda clickhouse qdrant gotenberg"
      ;;
    juridico)
      echo "mongodb redpanda minio clickhouse qdrant temporal-ui gotenberg"
      ;;
    pdv)
      echo "mongodb temporal redpanda clickhouse qdrant otel-collector gotenberg"
      ;;
    kanban)
      echo "mongodb rabbitmq temporal redpanda minio clickhouse qdrant temporal-ui gotenberg"
      ;;
    kanban-attachments)
      echo "mongodb rabbitmq temporal redpanda clickhouse qdrant temporal-ui gotenberg"
      ;;
    kanban-leads)
      echo "mongodb rabbitmq temporal redpanda clickhouse qdrant temporal-ui"
      ;;
    kanban-monitoring)
      echo "mongodb rabbitmq redpanda minio clickhouse qdrant temporal-ui gotenberg"
      ;;
    fiscal)
      echo "mongodb valkey rabbitmq temporal redpanda minio clickhouse qdrant otel-collector temporal-ui jboot gotenberg"
      ;;
    payments)
      echo "mongodb valkey rabbitmq temporal redpanda minio clickhouse qdrant temporal-ui jboot-fiscal gotenberg"
      ;;
    ai-gateway)
      echo "mongodb valkey rabbitmq temporal redpanda minio clickhouse qdrant temporal-ui jboot-fiscal gotenberg"
      ;;
  esac
}

processes_required() {
  case "$target" in
    identity)
      echo "identity-api identity-admin"
      ;;
    platform | kanban | kanban-attachments | kanban-leads)
      echo "identity-api identity-admin platform-api platform-web"
      ;;
    pdv)
      echo "identity-api identity-admin platform-api platform-web payments-api payments-worker"
      ;;
    juridico | kanban-monitoring)
      echo "identity-api identity-admin platform-api platform-web juridico-worker juridico-data-service"
      ;;
    juridico-data)
      echo "juridico-data-service"
      ;;
    fiscal)
      echo ""
      ;;
    payments)
      echo "payments-api payments-worker"
      ;;
    ai-gateway)
      echo "ai-gateway-api"
      ;;
  esac
}

run_in_jboot() {
  docker compose exec -T jboot bash -lc "$1"
}

require_in_jboot() {
  local path="$1"
  local install_hint="$2"

  run_in_jboot "test -e '$path'" || {
    echo "Missing required dependency: $path" >&2
    echo "Install/fix before running code-up: $install_hint" >&2
    exit 1
  }
}

# Pega drift entre package.json e lockfile na hora do code-up, nao no
# deploy. Sem isso, dependencia adicionada sem rodar install (ex: qrcode
# no app-jboot-next-platform) so quebra semanas depois, quando alguem
# tenta publicar via tools/deploy.sh (npm ci / --frozen-lockfile falha
# la). Ambos os comandos abaixo sao seguros como checagem: recusam
# instalar (exit != 0) se o lockfile nao bater com o package.json, sem
# escrever nada em disco quando ja esta em dia.
require_pnpm_lockfile_fresh() {
  local dir="$1"

  run_in_jboot "cd '$dir' && pnpm install --frozen-lockfile" || {
    echo "Lockfile desatualizado em $dir/pnpm-lock.yaml" >&2
    echo "Install/fix before running code-up: docker compose exec jboot bash -lc 'cd $dir && pnpm install'" >&2
    exit 1
  }
}

require_npm_lockfile_fresh() {
  local dir="$1"

  run_in_jboot "cd '$dir' && npm ci --dry-run" || {
    echo "Lockfile desatualizado em $dir/package-lock.json" >&2
    echo "Install/fix before running code-up: docker compose exec jboot bash -lc 'cd $dir && npm install'" >&2
    exit 1
  }
}

require_juridico_playwright_browser() {
  local browser_glob="/root/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell"

  run_in_jboot "compgen -G '$browser_glob' >/dev/null" || {
    echo "Missing required dependency: Playwright Chromium browser" >&2
    echo "Install/fix before running code-up: docker compose exec jboot bash -lc 'cd implementations/wrk-jboot-juridico && .venv/bin/playwright install chromium'" >&2
    exit 1
  }

  run_in_jboot "if ldd $browser_glob | grep -q 'not found'; then exit 1; fi" || {
    echo "Missing required system libraries for Playwright Chromium" >&2
    echo "Rebuild/recreate the dev container before running code-up: docker compose up -d --build --force-recreate jboot" >&2
    exit 1
  }
}

start_once() {
  local name="$1"
  local port="$2"
  local command="$3"
  local log_file="/tmp/jboot-code-${name}.log"

  run_in_jboot "node -e \"const net=require('net'); const s=net.connect($port,'127.0.0.1'); s.on('connect',()=>{s.destroy(); process.exit(0)}); s.on('error',()=>process.exit(1)); setTimeout(()=>process.exit(1),500)\" && echo '$name already running on :$port' || (cd /workspace && nohup bash -lc '$command' </dev/null > '$log_file' 2>&1 & echo '$name started on :$port: $log_file')"
}

start_background_once() {
  local name="$1"
  local command="$2"
  local log_file="/tmp/jboot-code-${name}.log"
  local pid_file="/tmp/jboot-code-${name}.pid"

  run_in_jboot "if test -f '$pid_file' && kill -0 \$(cat '$pid_file') 2>/dev/null; then echo '$name already running'; else cd /workspace; nohup bash -lc '$command' </dev/null > '$log_file' 2>&1 & echo \$! > '$pid_file'; echo '$name started: $log_file'; fi"
}

start_minimal_containers() {
  local service

  for service in $(containers_required); do
    if [[ "$service" == "jboot" ]]; then
      docker compose up -d --no-deps jboot
    elif [[ "$service" == "jboot-fiscal" ]]; then
      docker compose --profile fiscal up -d --no-deps jboot-fiscal
    elif [[ "$service" == "gotenberg" ]]; then
      # Conversor de PDF (Flow CRM de leads, S6): profile `pdf`, rede interna sem egress.
      docker compose --profile pdf up -d --no-deps gotenberg
    else
      docker compose up -d "$service"
    fi
  done
}

start_identity() {
  require_in_jboot \
    "implementations/bff-jboot-identity/node_modules/.bin/nest" \
    "docker compose exec jboot bash -lc 'cd implementations/bff-jboot-identity && npm install'"
  require_npm_lockfile_fresh "implementations/bff-jboot-identity"
  require_in_jboot \
    "implementations/app-jboot-identity-admin/node_modules/.bin/next" \
    "docker compose exec jboot bash -lc 'cd implementations/app-jboot-identity-admin && npm install'"
  require_npm_lockfile_fresh "implementations/app-jboot-identity-admin"

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
  require_in_jboot \
    "implementations/bff-jboot-platform/node_modules/.bin/nest" \
    "docker compose exec jboot bash -lc 'cd implementations/bff-jboot-platform && npm install'"
  require_npm_lockfile_fresh "implementations/bff-jboot-platform"
  require_in_jboot \
    "implementations/app-jboot-next-platform/node_modules/.bin/next" \
    "docker compose exec jboot bash -lc 'cd implementations/app-jboot-next-platform && pnpm install'"
  require_pnpm_lockfile_fresh "implementations/app-jboot-next-platform"

  start_once \
    "platform-api" \
    "8010" \
    "cd implementations/bff-jboot-platform && PORT=8010 JBOOT_PDV_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_pdv JBOOT_JURIDICO_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev JBOOT_KANBAN_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_kanban_demo_dev JBOOT_FISCAL_SERVICE_URL=http://jboot-fiscal:8090 JBOOT_JURIDICO_WORKER_INTERNAL_SECRET=\${JBOOT_JURIDICO_WORKER_INTERNAL_SECRET:-} JBOOT_JURIDICO_MONITOR_ENCRYPTION_KEY=\${JBOOT_JURIDICO_MONITOR_ENCRYPTION_KEY:-} JBOOT_JURIDICO_MONITOR_ENCRYPTION_KEY_VERSION=\${JBOOT_JURIDICO_MONITOR_ENCRYPTION_KEY_VERSION:-1} npm run start:dev"

  start_once \
    "platform-web" \
    "3002" \
    "cd implementations/app-jboot-next-platform && npm run dev"
}

start_juridico_worker() {
  require_in_jboot \
    "implementations/wrk-jboot-juridico/.venv/bin/python" \
    "docker compose exec jboot bash -lc 'cd implementations/wrk-jboot-juridico && uv sync --dev'"
  require_juridico_playwright_browser

  start_once \
    "juridico-worker" \
    "8020" \
    "cd implementations/wrk-jboot-juridico && PYTHONUNBUFFERED=1 JBOOT_WORKER_API_PORT=8020 JBOOT_JURIDICO_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev JBOOT_JURIDICO_WORKER_INTERNAL_SECRET=\${JBOOT_JURIDICO_WORKER_INTERNAL_SECRET:-} JBOOT_JURIDICO_WORKER_SERVICE_CLIENT_SECRET=\${JBOOT_IDENTITY_JURIDICO_WORKER_SERVICE_CLIENT_SECRET:-} JBOOT_IDENTITY_SERVICE_URL=http://127.0.0.1:8000 JBOOT_PLATFORM_API_URL=http://127.0.0.1:8010 .venv/bin/python -m src.workers.main"
}

start_juridico_data() {
  require_in_jboot \
    "implementations/svc-jboot-juridico-data/.venv/bin/uvicorn" \
    "docker compose exec jboot bash -lc 'cd implementations/svc-jboot-juridico-data && uv sync --dev'"

  start_once \
    "juridico-data-service" \
    "8030" \
    "cd implementations/svc-jboot-juridico-data && PYTHONUNBUFFERED=1 .venv/bin/uvicorn juridico_data.app:app --host 0.0.0.0 --port 8030"
}

start_payments() {
  require_in_jboot \
    "/usr/local/go/bin/go" \
    "docker compose build --no-cache jboot"
  require_in_jboot \
    "implementations/svc-jboot-payments/go.sum" \
    "docker compose exec jboot bash -lc 'cd implementations/svc-jboot-payments && /usr/local/go/bin/go mod tidy'"

  run_in_jboot "cd implementations/svc-jboot-payments && /usr/local/go/bin/go build -o /tmp/jboot-payments-api ./cmd/api && /usr/local/go/bin/go build -o /tmp/jboot-payments-worker ./cmd/worker"

  start_once \
    "payments-api" \
    "8040" \
    "/tmp/jboot-payments-api"
  start_background_once \
    "payments-worker" \
    "/tmp/jboot-payments-worker"
}

start_ai_gateway() {
  require_in_jboot \
    "implementations/svc-jboot-ai-gateway/node_modules/.bin/nest" \
    "docker compose exec jboot bash -lc 'cd implementations/svc-jboot-ai-gateway && npm install'"
  require_npm_lockfile_fresh "implementations/svc-jboot-ai-gateway"
  start_once \
    "ai-gateway-api" \
    "8050" \
    "cd implementations/svc-jboot-ai-gateway && PORT=8050 npm run start:dev"
}

print_urls() {
  local optional_containers
  local required_processes
  optional_containers="$(containers_optional)"
  required_processes="$(processes_required)"

  echo ""
  echo "Target Runtime Matrix:"
  echo "  target: code-up:$1"
  echo "  containers.required: $(containers_required)"
  echo "  containers.optional: ${optional_containers:-none}"
  echo "  containers.forbidden_by_default: $(containers_forbidden_by_default)"
  echo "  app_processes.required: ${required_processes:-none}"
  echo ""
  echo "Code URLs:"
  if [[ "$1" == "identity" ]] || [[ "$1" == "platform" ]] || [[ "$1" == "juridico" ]] || [[ "$1" == "pdv" ]] || [[ "$1" == "kanban" ]] || [[ "$1" == "kanban-attachments" ]] || [[ "$1" == "kanban-leads" ]] || [[ "$1" == "kanban-monitoring" ]]; then
    echo "  Identity Admin: http://localhost:3000/login"
    echo "  Identity API:   http://localhost:8000/health"
  fi
  if [[ "$1" == "platform" ]] || [[ "$1" == "juridico" ]] || [[ "$1" == "pdv" ]] || [[ "$1" == "kanban" ]] || [[ "$1" == "kanban-attachments" ]] || [[ "$1" == "kanban-leads" ]] || [[ "$1" == "kanban-monitoring" ]]; then
    echo "  Platform Web:   http://localhost:3002"
    echo "  Platform API:   http://localhost:8010/health"
  fi
  if [[ "$1" == "juridico" ]]; then
    echo "  Juridico Web:   http://localhost:3002/juridico"
    echo "  Juridico Worker API: http://localhost:8020"
    echo "  Juridico Data API:   http://localhost:8030/health"
  fi
  if [[ "$1" == "juridico-data" ]]; then
    echo "  Juridico Data API:   http://localhost:8030/health"
  fi
  if [[ "$1" == "pdv" ]]; then
    echo "  PDV Web:        http://localhost:3002/pdv"
    echo "  Payments API:   http://localhost:8040/health"
  fi
  if [[ "$1" == "kanban" ]] || [[ "$1" == "kanban-attachments" ]] || [[ "$1" == "kanban-leads" ]] || [[ "$1" == "kanban-monitoring" ]]; then
    echo "  Flow Web:       http://localhost:3002/flow"
  fi
  if [[ "$1" == "kanban-monitoring" ]]; then
    echo "  Worker API (acompanhamento): http://localhost:8020"
    echo "  Juridico Data API:   http://localhost:8030/health"
  fi
  if [[ "$1" == "kanban-leads" ]]; then
    echo "  PDF converter:  sem porta no host (rede interna jboot-pdf-internal); health: docker compose exec gotenberg curl -fsS http://127.0.0.1:3000/health"
  fi
  if [[ "$1" == "fiscal" ]]; then
    echo "  Fiscal API:     http://localhost:8090/api/health"
  fi
  if [[ "$1" == "payments" ]]; then
    echo "  Payments API:   http://localhost:8040/health"
    echo "  Payments Ready: http://localhost:8040/ready"
  fi
  if [[ "$1" == "ai-gateway" ]]; then
    echo "  AI Gateway API:   http://localhost:8050/health"
    echo "  AI Gateway Ready: http://localhost:8050/ready"
  fi
  echo ""
  echo "Minimal containers:"
  echo "  $(containers_required)"
  echo ""
  echo "Logs:"
  if [[ "$1" == "identity" ]] || [[ "$1" == "platform" ]] || [[ "$1" == "juridico" ]] || [[ "$1" == "pdv" ]] || [[ "$1" == "kanban" ]] || [[ "$1" == "kanban-attachments" ]] || [[ "$1" == "kanban-leads" ]] || [[ "$1" == "kanban-monitoring" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-identity-api.log"
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-identity-admin.log"
  fi
  if [[ "$1" == "platform" ]] || [[ "$1" == "juridico" ]] || [[ "$1" == "pdv" ]] || [[ "$1" == "kanban" ]] || [[ "$1" == "kanban-attachments" ]] || [[ "$1" == "kanban-leads" ]] || [[ "$1" == "kanban-monitoring" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-platform-api.log"
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-platform-web.log"
  fi
  if [[ "$1" == "juridico" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-juridico-worker.log"
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-juridico-data-service.log"
  fi
  if [[ "$1" == "juridico-data" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-juridico-data-service.log"
  fi
  if [[ "$1" == "kanban-leads" ]]; then
    echo "  docker compose logs -f gotenberg"
  fi
  if [[ "$1" == "kanban-monitoring" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-juridico-worker.log"
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-juridico-data-service.log"
  fi
  if [[ "$1" == "fiscal" ]]; then
    echo "  docker compose logs -f jboot-fiscal"
  fi
  if [[ "$1" == "payments" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-payments-api.log"
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-payments-worker.log"
  fi
  if [[ "$1" == "ai-gateway" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-ai-gateway-api.log"
  fi
  if [[ "$1" == "pdv" ]]; then
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-payments-api.log"
    echo "  docker compose exec jboot tail -f /tmp/jboot-code-payments-worker.log"
  fi
}

start_minimal_containers

case "$target" in
  identity)
    start_identity
    ;;
  platform | juridico | pdv | kanban | kanban-attachments | kanban-leads | kanban-monitoring)
    start_identity
    start_platform
    if [[ "$target" == "juridico" ]] || [[ "$target" == "kanban-monitoring" ]]; then
      start_juridico_worker
      start_juridico_data
    fi
    if [[ "$target" == "pdv" ]]; then
      start_payments
    fi
    ;;
  juridico-data)
    start_juridico_data
    ;;
  fiscal)
    ;;
  payments)
    start_payments
    ;;
  ai-gateway)
    start_ai_gateway
    ;;
  *)
    echo "Unknown target: $target" >&2
    echo "Use: identity | platform | juridico | juridico-data | pdv | kanban | kanban-attachments | kanban-leads | kanban-monitoring | fiscal | payments | ai-gateway" >&2
    exit 2
    ;;
esac

print_urls "$target"
