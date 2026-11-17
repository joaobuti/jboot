#!/usr/bin/env bash
# Roda DENTRO do container jboot. Reinicia a Identity (8000) e a Platform API (8010) com as URLs
# publicas do tunel, para o conector Claude (OAuth + MCP) funcionar de fora.
# Uso: flow-tunnel-apply.sh <url-publica-da-identity> <url-publica-do-bff>
# Guia: docs/runbooks/claudeconf.md
set -uo pipefail
ISSUER="${1:?url publica da Identity (tunel da porta 8001 do host)}"
BFF="${2:?url publica do BFF (tunel da porta 8010 do host)}"
ISSUER="${ISSUER%/}"; BFF="${BFF%/}"
RESOURCE="$BFF/kanban/mcp"

# Checkout do BFF que esta servindo agora (main ou uma worktree); sem processo, usa a main.
PLATFORM_DIR=""
for dir in /proc/[0-9]*; do
  cwd=$(readlink "$dir/cwd" 2>/dev/null) || continue
  case "$cwd" in */implementations/bff-jboot-platform) PLATFORM_DIR="$cwd"; break ;; esac
done
PLATFORM_DIR="${PLATFORM_DIR:-/workspace/implementations/bff-jboot-platform}"
IDENTITY_DIR=/workspace/implementations/bff-jboot-identity
echo "platform: $PLATFORM_DIR"

for dir in /proc/[0-9]*; do
  cwd=$(readlink "$dir/cwd" 2>/dev/null) || continue
  case "$cwd" in "$IDENTITY_DIR"|*/implementations/bff-jboot-platform) kill "${dir#/proc/}" 2>/dev/null ;; esac
done
for port in 8000 8010; do for _ in $(seq 1 30); do (echo > /dev/tcp/127.0.0.1/$port) 2>/dev/null || break; sleep 1; done; done

export JBOOT_IDENTITY_OAUTH_ISSUER_URL="$ISSUER" JBOOT_FLOW_CONNECTOR_RESOURCE_URL="$RESOURCE"
(cd "$IDENTITY_DIR" && setsid nohup npm run start:dev > /tmp/jboot-code-identity-api.log 2>&1 < /dev/null &)
(cd "$PLATFORM_DIR" && set -a && . <(grep -E '^JBOOT_FLOW_DRIVE_' /workspace/.env 2>/dev/null) ; set +a
 PORT=8010 JBOOT_PDV_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_pdv \
 JBOOT_JURIDICO_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev \
 JBOOT_KANBAN_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_kanban_demo_dev \
 JBOOT_FISCAL_SERVICE_URL=http://jboot-fiscal:8090 \
 setsid nohup npm run start:dev > /tmp/jboot-code-platform-api.log 2>&1 < /dev/null &)

for port in 8000 8010; do for _ in $(seq 1 150); do curl -sf -o /dev/null "http://localhost:$port/health" && break; sleep 1; done; done
curl -s -o /dev/null -w "identity %{http_code}\n" http://localhost:8000/health
curl -s -o /dev/null -w "platform %{http_code}\n" http://localhost:8010/health
