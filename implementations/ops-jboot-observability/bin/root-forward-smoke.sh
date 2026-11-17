#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$project_dir/../.." && pwd)"
tenant="${OBS_TENANT_ID:-jboot-local}"
service="jboot-root-forward-smoke-$(date +%s)"

"$project_dir/bin/up.sh"
docker compose -f "$repo_root/docker-compose.yml" up -d otel-collector

docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/open-telemetry/opentelemetry-collector-contrib/telemetrygen:v0.157.0 \
  traces \
  --otlp-endpoint=host.docker.internal:4317 \
  --otlp-insecure \
  --service="$service" \
  --duration=5s >/dev/null 2>&1

for attempt in $(seq 1 30); do
  response="$(curl -fsS \
    -H "X-Scope-OrgID: $tenant" \
    --get \
    --data-urlencode "q={ resource.service.name = \"$service\" }" \
    --data-urlencode 'limit=20' \
    "http://localhost:${OBS_TEMPO_PORT:-3200}/api/search" 2>/dev/null || true)"
  if [[ "$response" == *'traceID'* ]]; then
    echo "Root collector forwarding: ok ($service)"
    exit 0
  fi
  sleep 2
done

echo "Root collector did not forward the synthetic trace to Tempo" >&2
docker logs --since 2m jboot-otel-collector >&2 || true
exit 1
