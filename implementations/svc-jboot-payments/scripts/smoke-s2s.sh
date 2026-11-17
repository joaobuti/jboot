#!/usr/bin/env bash
set -euo pipefail

identity_url="${JBOOT_IDENTITY_URL:-http://127.0.0.1:8000}"
payments_url="${JBOOT_PAYMENTS_URL:-http://127.0.0.1:8040}"
client_id="${JBOOT_SERVICE_CLIENT_ID:-platform-api}"
client_secret="${JBOOT_SERVICE_CLIENT_SECRET:?JBOOT_SERVICE_CLIENT_SECRET is required}"
tenant_id="${JBOOT_TEST_TENANT_ID:?JBOOT_TEST_TENANT_ID is required}"

token_response="$(curl -fsS \
  -H 'Content-Type: application/json' \
  -d "{\"clientId\":\"${client_id}\",\"clientSecret\":\"${client_secret}\",\"audience\":\"svc:payments\"}" \
  "${identity_url}/auth/service-token")"
access_token="$(printf '%s' "$token_response" | jq -er '.accessToken')"

charge_response="$(curl -fsS \
  -H "Authorization: Bearer ${access_token}" \
  -H "X-JBoot-Client-Id: ${tenant_id}" \
  -H 'Idempotency-Key: smoke-payments-0001' \
  -H 'Content-Type: application/json' \
  -d '{"consumerApplication":"pdv","merchantOrderReference":"smoke-order","amountMinor":100,"currency":"BRL"}' \
  "${payments_url}/v1/charges")"

charge_id="$(printf '%s' "$charge_response" | jq -er '.id')"
status="$(printf '%s' "$charge_response" | jq -er '.status')"
test "$status" = "created"

curl -fsS \
  -H "Authorization: Bearer ${access_token}" \
  -H "X-JBoot-Client-Id: ${tenant_id}" \
  "${payments_url}/v1/charges/${charge_id}" | jq -e '.status == "created"' >/dev/null

echo "payments s2s smoke ok"
