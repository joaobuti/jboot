#!/usr/bin/env sh
set -eu

# Compatibility wrapper. Context generation is always deterministic and updates
# only files whose canonical rendering changed; --force is accepted for callers
# that used the previous interface.
case "${1:-}" in
  ""|--force) ;;
  -h|--help)
    echo "Usage: tools/ai/generate-ai-context.sh [--force]"
    exit 0
    ;;
  *)
    echo "unknown argument: $1"
    exit 2
    ;;
esac

exec python3 tools/ai/governance.py generate-context
