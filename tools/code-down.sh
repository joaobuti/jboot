#!/usr/bin/env bash
set -euo pipefail

target="${1:-identity}"

process_patterns() {
  case "$target" in
    identity)
      printf '%s\n' \
        "implementations/bff-jboot-identity" \
        "implementations/app-jboot-identity-admin"
      ;;
    platform | kanban | kanban-attachments | kanban-leads)
      printf '%s\n' \
        "implementations/bff-jboot-platform" \
        "implementations/app-jboot-next-platform" \
        "implementations/bff-jboot-identity" \
        "implementations/app-jboot-identity-admin"
      ;;
    pdv)
      printf '%s\n' \
        "implementations/svc-jboot-payments" \
        "payments-api" \
        "payments-worker" \
        "implementations/bff-jboot-platform" \
        "implementations/app-jboot-next-platform" \
        "implementations/bff-jboot-identity" \
        "implementations/app-jboot-identity-admin"
      ;;
    kanban-monitoring)
      printf '%s\n' \
        "implementations/wrk-jboot-juridico" \
        "src.workers.main" \
        "implementations/svc-jboot-juridico-data" \
        "implementations/bff-jboot-platform" \
        "implementations/app-jboot-next-platform" \
        "implementations/bff-jboot-identity" \
        "implementations/app-jboot-identity-admin"
      ;;
    juridico)
      printf '%s\n' \
        "implementations/wrk-jboot-juridico" \
        "src.workers.main" \
        "implementations/bff-jboot-platform" \
        "implementations/app-jboot-next-platform" \
        "implementations/bff-jboot-identity" \
        "implementations/app-jboot-identity-admin"
      ;;
    juridico-data)
      printf '%s\n' \
        "implementations/svc-jboot-juridico-data"
      ;;
    fiscal)
      printf '%s\n' \
        "implementations/svc-jboot-fiscal"
      ;;
    payments)
      printf '%s\n' \
        "implementations/svc-jboot-payments" \
        "payments-api" \
        "payments-worker"
      ;;
    ai-gateway)
      printf '%s\n' "implementations/svc-jboot-ai-gateway"
      ;;
    *)
      echo "Unknown target: $target" >&2
      echo "Use: identity | platform | juridico | juridico-data | pdv | kanban | kanban-attachments | kanban-leads | kanban-monitoring | fiscal | payments | ai-gateway" >&2
      exit 2
      ;;
  esac
}

log_files() {
  case "$target" in
    identity)
      printf '%s\n' \
        "/tmp/jboot-code-identity-api.log" \
        "/tmp/jboot-code-identity-admin.log"
      ;;
    platform | kanban | kanban-attachments | kanban-leads)
      printf '%s\n' \
        "/tmp/jboot-code-platform-api.log" \
        "/tmp/jboot-code-platform-web.log" \
        "/tmp/jboot-code-identity-api.log" \
        "/tmp/jboot-code-identity-admin.log"
      ;;
    pdv)
      printf '%s\n' \
        "/tmp/jboot-code-payments-api.log" \
        "/tmp/jboot-code-payments-worker.log" \
        "/tmp/jboot-code-payments-worker.pid" \
        "/tmp/jboot-code-platform-api.log" \
        "/tmp/jboot-code-platform-web.log" \
        "/tmp/jboot-code-identity-api.log" \
        "/tmp/jboot-code-identity-admin.log"
      ;;
    kanban-monitoring)
      printf '%s\n' \
        "/tmp/jboot-code-juridico-worker.log" \
        "/tmp/jboot-code-juridico-data-service.log" \
        "/tmp/jboot-code-platform-api.log" \
        "/tmp/jboot-code-platform-web.log" \
        "/tmp/jboot-code-identity-api.log" \
        "/tmp/jboot-code-identity-admin.log"
      ;;
    juridico)
      printf '%s\n' \
        "/tmp/jboot-code-juridico-worker.log" \
        "/tmp/jboot-code-juridico-api.log" \
        "/tmp/jboot-code-platform-api.log" \
        "/tmp/jboot-code-platform-web.log" \
        "/tmp/jboot-code-identity-api.log" \
        "/tmp/jboot-code-identity-admin.log"
      ;;
    juridico-data)
      printf '%s\n' \
        "/tmp/jboot-code-juridico-data-service.log"
      ;;
    fiscal)
      printf '%s\n' \
        "/tmp/jboot-code-fiscal-service.log"
      ;;
    payments)
      printf '%s\n' \
        "/tmp/jboot-code-payments-api.log" \
        "/tmp/jboot-code-payments-worker.log" \
        "/tmp/jboot-code-payments-worker.pid"
      ;;
    ai-gateway)
      printf '%s\n' "/tmp/jboot-code-ai-gateway-api.log"
      ;;
  esac
}

stop_processes_by_pattern() {
  local pattern="$1"

  docker compose exec -T \
    -e CODE_DOWN_PATTERN="$pattern" \
    jboot bash -lc '
      set -euo pipefail
      self="$$"
      parent="$PPID"
      pids="$(
        ps -eo pid=,ppid=,args= |
          awk -v pat="$CODE_DOWN_PATTERN" -v self="$self" -v parent="$parent" '"'"'
            $1 != self &&
            $1 != parent &&
            $2 != self &&
            $0 ~ pat &&
            $0 !~ /awk -v pat=/ &&
            $0 !~ /CODE_DOWN_PATTERN/ {
              print $1
            }
          '"'"'
      )"

      if [ -n "$pids" ]; then
        kill $pids 2>/dev/null || true
      fi
    ' </dev/null
}

running_services="$(docker compose ps --services --filter status=running)"

if ! grep -qx "jboot" <<< "$running_services"; then
  echo "jboot container is not running; nothing to stop for code-down:$target"
  exit 0
fi

echo "Stopping code processes for code-down:$target"

while IFS= read -r pattern; do
  stop_processes_by_pattern "$pattern"
done < <(process_patterns)

while IFS= read -r log_file; do
  docker compose exec -T jboot bash -lc "rm -f '$log_file'" </dev/null
done < <(log_files)

echo "Stopped code processes for code-down:$target"
