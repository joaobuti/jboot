#!/usr/bin/env bash
# Conector Claude em dev: sobe os dois tuneis temporarios (BFF e Identity), descobre os enderecos,
# reconfigura o Flow e testa de fora. Roda NO HOST (fora do container).
# BFF via localhost.run (SSH) por padrao: desde 2026-11-06 o Claude recebe McpAccessRefused quando o
# BFF esta num quick tunnel do Cloudflare (a chamada com token nao chega ao cloudflared). Para voltar
# ao Cloudflare no BFF: BFF_TUNNEL=cloudflare make claude-tunnel. Diagnostico em
# docs/runbooks/claude-connector-access-refused.md
#   make claude-tunnel            # (re)cria os tuneis e reconfigura
#   make claude-tunnel ARGS=status  # so mostra os enderecos atuais e se respondem
#   make claude-tunnel ARGS=stop    # encerra os tuneis
# Guia completo, inclusive o que fazer no Claude depois: docs/runbooks/claudeconf.md
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"           # checkout onde o comando foi chamado
MAIN="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"; MAIN="${MAIN%/.git}"
MAIN="${MAIN:-$ROOT}"                                   # raiz montada como /workspace no container
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/jboot-claude-tunnel"
CLOUDFLARED="$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")"
env_port() { grep -E "^$1=" "$MAIN/.env" 2>/dev/null | tail -1 | cut -d= -f2; }
BFF_PORT="${BFF_PORT:-$(env_port JBOOT_PDV_API_PORT)}"; BFF_PORT="${BFF_PORT:-8010}"
IDP_PORT="${IDP_PORT:-$(env_port JBOOT_API_PORT)}"; IDP_PORT="${IDP_PORT:-8000}"
BFF_TUNNEL="${BFF_TUNNEL:-lhr}"                         # lhr (localhost.run) | cloudflare
BFF_METRICS=127.0.0.1:20310
IDP_METRICS=127.0.0.1:20301
mkdir -p "$STATE"

hostname_of() { curl -s -m 3 "http://$1/quicktunnel" | sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p'; }
# Endereco do tunel do BFF: localhost.run (log do ssh, se o processo vive) ou metricas do cloudflared.
bff_host() {
  if [ -f "$STATE/bff.pid" ] && grep -q 'localhost.run' "$STATE/bff.cmd" 2>/dev/null; then
    kill -0 "$(cat "$STATE/bff.pid")" 2>/dev/null && grep -oE '[a-z0-9]+\.lhr\.life' "$STATE/bff.log" | tail -1
  else
    hostname_of $BFF_METRICS
  fi
}
stop_tunnels() {
  for name in bff identity; do
    [ -f "$STATE/$name.pid" ] && kill "$(cat "$STATE/$name.pid")" 2>/dev/null
    rm -f "$STATE/$name.pid" "$STATE/$name.cmd"
  done
}
reachable() { curl -s -m 10 -o /dev/null -w '%{http_code}' "$1"; }
status() {
  local bff idp host
  bff="$(bff_host)"; idp="$(hostname_of $IDP_METRICS)"
  # Tuneis abertos a mao usam as portas de metricas padrao (20241+): identifica pelo conteudo.
  if [ -z "$bff$idp" ]; then
    for port in 20241 20242 20243 20244 20245; do
      host="$(hostname_of 127.0.0.1:$port)"; [ -n "$host" ] || continue
      if curl -s -m 10 "https://$host/.well-known/oauth-protected-resource/kanban/mcp" | grep -q "\"resource\":\"https"; then bff="$host"
      elif curl -s -m 10 "https://$host/.well-known/oauth-authorization-server" | grep -q "\"issuer\":\"https"; then idp="$host"; fi
    done
  fi
  echo "BFF      (host :$BFF_PORT) https://${bff:-<sem tunel>}  -> $( [ -n "$bff" ] && reachable "https://$bff/health" || echo '-')"
  echo "Identity (host :$IDP_PORT) https://${idp:-<sem tunel>}  -> $( [ -n "$idp" ] && reachable "https://$idp/health" || echo '-')"
  [ -n "$bff" ] && echo "Conector Claude: https://$bff/kanban/mcp"
}

case "${1:-up}" in
  status) status; exit 0 ;;
  stop) stop_tunnels; echo "tuneis encerrados"; exit 0 ;;
  up) ;;
  *) echo "uso: $0 [up|status|stop]" >&2; exit 2 ;;
esac

[ -x "$CLOUDFLARED" ] || { echo "cloudflared nao encontrado (instale em ~/.local/bin)" >&2; exit 1; }
for port in "$BFF_PORT" "$IDP_PORT"; do
  [ "$(reachable "http://localhost:$port/health")" = 200 ] || { echo "nada respondendo em localhost:$port; rode make code-up TARGET=kanban-attachments" >&2; exit 1; }
done

echo "1/4 encerrando tuneis antigos e subindo novos..."
stop_tunnels
pkill -f "cloudflared tunnel .*--url http://localhost:($BFF_PORT|$IDP_PORT)" 2>/dev/null
pkill -f "ssh .*-R 80:localhost:$BFF_PORT nokey@localhost.run" 2>/dev/null
sleep 1
if [ "$BFF_TUNNEL" = cloudflare ]; then
  nohup "$CLOUDFLARED" tunnel --no-autoupdate --metrics "$BFF_METRICS" --url "http://localhost:$BFF_PORT" > "$STATE/bff.log" 2>&1 &
  echo cloudflared > "$STATE/bff.cmd"
else
  nohup ssh -tt -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
    -R "80:localhost:$BFF_PORT" nokey@localhost.run > "$STATE/bff.log" 2>&1 < /dev/null &
  echo localhost.run > "$STATE/bff.cmd"
fi
echo $! > "$STATE/bff.pid"
nohup "$CLOUDFLARED" tunnel --no-autoupdate --metrics "$IDP_METRICS" --url "http://localhost:$IDP_PORT" > "$STATE/identity.log" 2>&1 &
echo $! > "$STATE/identity.pid"

echo "2/4 aguardando os enderecos publicos..."
BFF_HOST=""; IDP_HOST=""
for _ in $(seq 1 60); do
  BFF_HOST="$(bff_host)"; IDP_HOST="$(hostname_of $IDP_METRICS)"
  [ -n "$BFF_HOST" ] && [ -n "$IDP_HOST" ] && break; sleep 1
done
[ -n "$BFF_HOST" ] && [ -n "$IDP_HOST" ] || { echo "tunel nao subiu; veja $STATE/*.log" >&2; exit 1; }
for host in "$BFF_HOST" "$IDP_HOST"; do
  for _ in $(seq 1 60); do [ "$(reachable "https://$host/health")" = 200 ] && break; sleep 2; done
done
echo "   BFF:      https://$BFF_HOST"
echo "   Identity: https://$IDP_HOST"

echo "3/4 reconfigurando Identity e Platform API no container (1-2 min)..."
REL="${ROOT#"$MAIN"}"
(cd "$MAIN" && docker compose exec -T jboot bash "/workspace$REL/tools/dev/flow-tunnel-apply.sh" "https://$IDP_HOST" "https://$BFF_HOST")

echo "4/4 testando de fora (ate 1 min; o tunel leva alguns segundos para estabilizar)..."
# Tenta ate 20 vezes: logo apos reiniciar o BFF a borda do tunel ainda pode falhar.
# Estes testes saem desta maquina; NAO detectam o McpAccessRefused (que so aparece na chamada do Claude).
check() { local _; for _ in $(seq 1 20); do eval "$1" >/dev/null 2>&1 && return 0; sleep 3; done; return 1; }
ok=1
check "curl -s -m 15 'https://$BFF_HOST/.well-known/oauth-protected-resource/kanban/mcp' | grep -q '\"authorization_servers\":\\[\"https://$IDP_HOST\"'" \
  && echo "   metadados do conector: ok" || { echo "   metadados do conector: FALHOU"; ok=0; }
check "[ \"\$(curl -s -m 15 -o /dev/null -w '%{http_code}' -X POST 'https://$BFF_HOST/kanban/mcp' -H 'content-type: application/json' -d '{}')\" = 401 ]" \
  && echo "   MCP exige login (401): ok" || { echo "   MCP: FALHOU"; ok=0; }
check "curl -s -m 15 'https://$IDP_HOST/.well-known/oauth-authorization-server' | grep -q '\"issuer\":\"https://$IDP_HOST\"'" \
  && echo "   issuer OAuth: ok" || { echo "   issuer OAuth: FALHOU"; ok=0; }

cat <<MSG

Conector Claude (cole no Claude):  https://$BFF_HOST/kanban/mcp
Agora, em CADA conta Claude que usa o Flow (escritorio e principal), siga a secao
"No Claude" de docs/runbooks/claudeconf.md. Os tuneis rodam em segundo plano; para
encerrar: make claude-tunnel ARGS=stop
Tunel do BFF: $BFF_TUNNEL. Se o Claude disser "fez login, mas a solicitacao foi recusada"
(McpAccessRefused): docs/runbooks/claude-connector-access-refused.md
MSG
[ "$ok" = 1 ]
