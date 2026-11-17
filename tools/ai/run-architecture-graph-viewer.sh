#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
viewer="$repo/tools/ai/architecture-graph-viewer"
port="${PORT:-4174}"

if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1024 || port > 65535 )); then
  echo "PORT must be an integer between 1024 and 65535" >&2
  exit 2
fi

python3 "$repo/tools/ai/architecture-graph.py" --root "$repo" --viewer-data --fail-on error

node_major="0"
if command -v node >/dev/null 2>&1; then
  node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
fi

if (( node_major >= 24 )); then
  (
    cd "$viewer"
    npm ci
    npm run build
  )
else
  docker image inspect jboot-jboot:latest >/dev/null 2>&1 || {
    echo "Node >=24 or Docker image jboot-jboot:latest is required. Run: make infra-build" >&2
    exit 1
  }
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e npm_config_cache=/tmp/npm-cache \
    -v "$repo:/workspace" \
    -w /workspace/tools/ai/architecture-graph-viewer \
    jboot-jboot:latest \
    bash -lc 'npm ci && npm run build'
fi

echo "Architecture Graph Viewer: http://127.0.0.1:$port"
exec python3 -m http.server "$port" --bind 127.0.0.1 --directory "$viewer/dist"
