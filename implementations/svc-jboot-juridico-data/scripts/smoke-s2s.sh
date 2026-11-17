#!/usr/bin/env bash
set -euo pipefail

workspace_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
identity_dir="$workspace_root/implementations/bff-jboot-identity"
service_dir="$workspace_root/implementations/svc-jboot-juridico-data"
smoke_jwt_secret="smoke-only-jwt-secret-0123456789-abcdefgh"
smoke_client_secret="smoke-only-client-secret"

cleanup() {
  kill "${identity_pid:-}" "${service_pid:-}" 2>/dev/null || true
}
trap cleanup EXIT

(
  cd "$identity_dir"
  PORT=8100 \
  JBOOT_IDENTITY_PLATFORM_SERVICE_CLIENT_SECRET="$smoke_client_secret" \
  JBOOT_IDENTITY_JWT_SECRET="$smoke_jwt_secret" \
  node dist/main.js
) >/tmp/jboot-smoke-identity.log 2>&1 &
identity_pid=$!

(
  cd "$service_dir"
  JURIDICO_DATA_DATAJUD_API_KEY="smoke-only-key" \
  JURIDICO_DATA_IDENTITY_JWT_SECRET="$smoke_jwt_secret" \
  .venv/bin/uvicorn juridico_data.app:app --host 127.0.0.1 --port 8030
) >/tmp/jboot-smoke-juridico-data.log 2>&1 &
service_pid=$!

SMOKE_CLIENT_SECRET="$smoke_client_secret" "$service_dir/.venv/bin/python" - <<'PY'
import os
import time

import httpx

identity = "http://127.0.0.1:8100"
service = "http://127.0.0.1:8030"

for _ in range(30):
    try:
        if httpx.get(f"{identity}/health", timeout=1).is_success and httpx.get(
            f"{service}/health", timeout=1
        ).is_success:
            break
    except httpx.HTTPError:
        pass
    time.sleep(0.2)
else:
    raise SystemExit("smoke services did not become healthy")

token_response = httpx.post(
    f"{identity}/auth/service-token",
    json={
        "clientId": "platform-api",
        "clientSecret": os.environ["SMOKE_CLIENT_SECRET"],
        "audience": "svc:juridico-data",
    },
    timeout=2,
)
token_response.raise_for_status()
token = token_response.json()["accessToken"]

catalog = httpx.get(
    f"{service}/v1/datajud/tribunais",
    headers={"Authorization": f"Bearer {token}"},
    timeout=2,
)
catalog.raise_for_status()
assert catalog.json()["total"] > 80
print("s2s smoke passed: Identity -> Juridico Data tribunal catalogue")
PY
