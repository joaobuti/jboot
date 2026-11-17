#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${OBS_ENV_FILE:-$project_dir/.env}"

if [[ -f "$env_file" ]]; then
  if grep -q 'replace-with-' "$env_file"; then
    echo "Observability environment still contains placeholder credentials: $env_file" >&2
    exit 2
  fi
  exec docker compose --env-file "$env_file" -f "$project_dir/compose.yaml" "$@"
fi

required_variables=(
  OBS_MINIO_ROOT_USER
  OBS_MINIO_ROOT_PASSWORD
  OBS_POSTGRES_USER
  OBS_POSTGRES_PASSWORD
  OBS_GRAFANA_ADMIN_USER
  OBS_GRAFANA_ADMIN_PASSWORD
)

for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing $variable and no environment file exists at $env_file" >&2
    echo "Copy $project_dir/.env.example to $project_dir/.env or export all required variables." >&2
    exit 2
  fi
done

exec docker compose -f "$project_dir/compose.yaml" "$@"
