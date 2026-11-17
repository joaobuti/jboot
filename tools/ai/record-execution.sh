#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  tools/ai/record-execution.sh --title "..." --project path [options]

Options:
  --module path
  --mode architectural|implementation|review|governance
  --status success|failed|partial|blocked
  --agents "a,b,c"
  --skills "x,y,z"
  --validations "make ai-check; npm run build"
  --prompt-tokens n
  --completion-tokens n
  --total-tokens n
  --estimated-cost value
  --latency-ms n
  --measurement-status measured|not_exposed|not_collected|not_applicable
  --runtime runtime-name
  --model exact-model-or-unknown
  --execution-id globally-unique-id
  --revision git-revision
  --output "summary"

Creates:
  docs/ai-governance/records/executions/YYYY-MM-DD-slug.md
  docs/ai-governance/metrics/ai-executions.tsv
USAGE
}

title=""
project=""
module=""
mode="governance"
status="success"
agents=""
skills=""
validations=""
prompt_tokens=""
completion_tokens=""
total_tokens=""
estimated_cost=""
latency_ms=""
output=""
measurement_status="not_collected"
runtime="unknown"
model="unknown"
execution_id=""
revision=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --title) title="${2:-}"; shift 2 ;;
    --project) project="${2:-}"; shift 2 ;;
    --module) module="${2:-}"; shift 2 ;;
    --mode) mode="${2:-}"; shift 2 ;;
    --status) status="${2:-}"; shift 2 ;;
    --agents) agents="${2:-}"; shift 2 ;;
    --skills) skills="${2:-}"; shift 2 ;;
    --validations) validations="${2:-}"; shift 2 ;;
    --prompt-tokens) prompt_tokens="${2:-}"; shift 2 ;;
    --completion-tokens) completion_tokens="${2:-}"; shift 2 ;;
    --total-tokens) total_tokens="${2:-}"; shift 2 ;;
    --estimated-cost) estimated_cost="${2:-}"; shift 2 ;;
    --latency-ms) latency_ms="${2:-}"; shift 2 ;;
    --measurement-status) measurement_status="${2:-}"; shift 2 ;;
    --runtime) runtime="${2:-}"; shift 2 ;;
    --model) model="${2:-}"; shift 2 ;;
    --execution-id) execution_id="${2:-}"; shift 2 ;;
    --revision) revision="${2:-}"; shift 2 ;;
    --output) output="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1"; usage; exit 2 ;;
  esac
done

[ -n "$title" ] || { echo "missing --title"; exit 2; }
[ -n "$project" ] || { echo "missing --project"; exit 2; }
case "$measurement_status" in
  measured|not_exposed|not_collected|not_applicable) ;;
  *) echo "invalid --measurement-status: $measurement_status"; exit 2 ;;
esac
if [ "$measurement_status" = "measured" ]; then
  for value in "$prompt_tokens" "$completion_tokens" "$total_tokens" "$estimated_cost" "$latency_ms"; do
    [ -n "$value" ] || { echo "measured status requires all measurement values"; exit 2; }
  done
else
  [ -z "$prompt_tokens$completion_tokens$total_tokens$estimated_cost$latency_ms" ] || {
    echo "unavailable measurements must be empty, not zero"; exit 2;
  }
fi

date_id="$(date +%F)"
timestamp_id="$(date -u +%Y%m%dT%H%M%SZ)"
slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//; s/-$//')"
execution_id="${execution_id:-$timestamp_id-$slug}"
if [ -z "$revision" ]; then
  if [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
    # O registro nasce para ser versionado junto com a mudanca, entao a revisao e
    # resolvida pelo CI no SHA do commit. `working-tree` reprova em
    # tools/ai/diff-preflight.py por ser marcacao local-only.
    revision="resolved_by_ci"
  else
    revision="$(git rev-parse HEAD 2>/dev/null || printf unavailable)"
  fi
fi
records_dir="docs/ai-governance/records/executions"
metrics_dir="docs/ai-governance/metrics"
record_file="$records_dir/$date_id-$slug.md"
metrics_file="$metrics_dir/ai-executions.tsv"

mkdir -p "$records_dir" "$metrics_dir"

{
  echo "# $title"
  echo
  echo "## Metadata"
  echo
  echo "| Campo | Valor |"
  echo "|---|---|"
  echo "| date | $date_id |"
  echo "| mode | $mode |"
  echo "| status | $status |"
  echo "| target_project | $project |"
  echo "| target_module | ${module:-n/a} |"
  echo "| agents | ${agents:-n/a} |"
  echo "| skills | ${skills:-n/a} |"
  echo "| execution_id | $execution_id |"
  echo "| revision | $revision |"
  echo "| runtime | $runtime |"
  echo "| model | $model |"
  echo
  echo "## Metricas"
  echo
  echo "| Metrica | Valor |"
  echo "|---|---:|"
  echo "| prompt_tokens | ${prompt_tokens:-null} |"
  echo "| completion_tokens | ${completion_tokens:-null} |"
  echo "| total_tokens | ${total_tokens:-null} |"
  echo "| estimated_cost | ${estimated_cost:-null} |"
  echo "| latency_ms | ${latency_ms:-null} |"
  echo "| measurement_status | $measurement_status |"
  echo
  echo "## Validacoes"
  echo
  if [ -n "$validations" ]; then
    printf '%s\n' "$validations" | tr ';' '\n' | while read -r item; do
      [ -n "$item" ] && echo "- $(printf '%s' "$item" | sed 's/^ *//')"
    done
  else
    echo "- n/a"
  fi
  echo
  echo "## Resultado"
  echo
  echo "${output:-n/a}"
} > "$record_file"

if [ ! -f "$metrics_file" ]; then
  echo "date	title	mode	status	target_project	target_module	prompt_tokens	completion_tokens	total_tokens	estimated_cost	latency_ms	validations	measurement_status	execution_id	revision	runtime	model" > "$metrics_file"
fi

printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$date_id" "$title" "$mode" "$status" "$project" "${module:-n/a}" \
  "$prompt_tokens" "$completion_tokens" "$total_tokens" "$estimated_cost" "$latency_ms" "${validations:-n/a}" \
  "$measurement_status" "$execution_id" "$revision" "$runtime" "$model" >> "$metrics_file"

echo "$record_file"
