#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose="$project_dir/bin/compose.sh"
tenant="${OBS_TENANT_ID:-jboot-local}"
smoke_service="jboot-observability-smoke-$(date +%s)"
export OBS_SMOKE_SERVICE_NAME="$smoke_service"

"$project_dir/bin/up.sh"

"$compose" --profile smoke run --rm telemetrygen-traces
"$compose" --profile smoke run --rm telemetrygen-metrics
"$compose" --profile smoke run --rm telemetrygen-logs

poll_json() {
  local name="$1"
  local expected="$2"
  shift 2
  local attempt response

  for attempt in $(seq 1 30); do
    response="$(curl -fsS "$@" 2>/dev/null || true)"
    if [[ "$response" == *"$expected"* ]]; then
      echo "$name: ok"
      return 0
    fi
    sleep 2
  done

  echo "$name did not return expected telemetry" >&2
  echo "$response" >&2
  return 1
}

poll_json \
  "Mimir metrics" \
  '"status":"success"' \
  -H "X-Scope-OrgID: $tenant" \
  --get \
  --data-urlencode 'query=otelcol_receiver_accepted_spans_total > 0' \
  "http://localhost:${OBS_MIMIR_PORT:-9009}/prometheus/api/v1/query"

poll_json \
  "Tempo traces" \
  'traceID' \
  -H "X-Scope-OrgID: $tenant" \
  --get \
  --data-urlencode "q={ resource.service.name = \"$smoke_service\" }" \
  --data-urlencode 'limit=20' \
  "http://localhost:${OBS_TEMPO_PORT:-3200}/api/search"

poll_json \
  "Loki logs" \
  "$smoke_service" \
  -H "X-Scope-OrgID: $tenant" \
  --get \
  --data-urlencode "query={service_name=\"$smoke_service\"}" \
  --data-urlencode 'limit=20' \
  "http://localhost:${OBS_LOKI_PORT:-3100}/loki/api/v1/query_range"

echo "Restarting telemetry backends to verify persisted recovery"
"$compose" restart mimir tempo loki >/dev/null
"$project_dir/bin/up.sh" >/dev/null

poll_json \
  "Mimir metrics after restart" \
  '"status":"success"' \
  -H "X-Scope-OrgID: $tenant" \
  --get \
  --data-urlencode 'query=otelcol_receiver_accepted_spans_total > 0' \
  "http://localhost:${OBS_MIMIR_PORT:-9009}/prometheus/api/v1/query"

poll_json \
  "Tempo traces after restart" \
  'traceID' \
  -H "X-Scope-OrgID: $tenant" \
  --get \
  --data-urlencode "q={ resource.service.name = \"$smoke_service\" }" \
  --data-urlencode 'limit=20' \
  "http://localhost:${OBS_TEMPO_PORT:-3200}/api/search"

poll_json \
  "Loki logs after restart" \
  "$smoke_service" \
  -H "X-Scope-OrgID: $tenant" \
  --get \
  --data-urlencode "query={service_name=\"$smoke_service\"}" \
  --data-urlencode 'limit=20' \
  "http://localhost:${OBS_LOKI_PORT:-3100}/loki/api/v1/query_range"

echo "Observability end-to-end smoke passed"
