#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose="$project_dir/bin/compose.sh"
tenant="${OBS_TENANT_ID:-jboot-local}"

"$compose" up -d

wait_http() {
  local name="$1"
  local url="$2"
  local header="${3:-}"
  local attempt

  for attempt in $(seq 1 60); do
    if [[ -n "$header" ]]; then
      if curl -fsS -H "$header" "$url" >/dev/null 2>&1; then
        return 0
      fi
    elif curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "Healthcheck failed: $name ($url)" >&2
  "$compose" ps >&2
  return 1
}

wait_http "MinIO" "http://localhost:${OBS_MINIO_PORT:-9100}/minio/health/live"
wait_http "Mimir" "http://localhost:${OBS_MIMIR_PORT:-9009}/ready"
wait_http "Tempo" "http://localhost:${OBS_TEMPO_PORT:-3200}/ready" "X-Scope-OrgID: $tenant"
wait_http "Loki" "http://localhost:${OBS_LOKI_PORT:-3100}/ready" "X-Scope-OrgID: $tenant"
wait_http "OpenTelemetry Collector" "http://localhost:${OBS_OTEL_HEALTH_PORT:-13133}/"
wait_http "Grafana" "http://localhost:${OBS_GRAFANA_PORT:-3300}/api/health"

echo "JBoot observability is ready"
echo "Grafana: http://localhost:${OBS_GRAFANA_PORT:-3300}"

