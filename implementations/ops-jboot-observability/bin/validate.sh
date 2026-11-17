#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker compose \
  --env-file "$project_dir/.env.example" \
  -f "$project_dir/compose.yaml" \
  config --quiet

python3 -m unittest discover -s "$project_dir/tests" -p 'test_*.py'

echo "Observability static validation passed"

