#!/usr/bin/env sh
set -eu

metrics_file="docs/ai-governance/metrics/ai-executions.tsv"
nonconformities_dir="docs/ai-governance/records/non-conformities"

[ -f "$metrics_file" ] || {
  echo "fail: missing metrics file $metrics_file"
  exit 1
}

executions="$(awk 'NR > 1 && NF { count++ } END { print count + 0 }' "$metrics_file")"
success="$(awk -F '\t' 'NR > 1 && $4 == "success" { count++ } END { print count + 0 }' "$metrics_file")"
failed="$(awk -F '\t' 'NR > 1 && ($4 == "failed" || $4 == "blocked" || $4 == "partial") { count++ } END { print count + 0 }' "$metrics_file")"
measured_tokens="$(awk -F '\t' 'NR > 1 && $13 == "measured" { count++ } END { print count + 0 }' "$metrics_file")"
measured_latency="$measured_tokens"
legacy_unverified="$(awk -F '\t' 'NR > 1 && $13 == "legacy_unverified" { count++ } END { print count + 0 }' "$metrics_file")"
attestations="$(find docs/ai-governance/attestations -type f -name '*.yaml' | wc -l | tr -d ' ')"
nonconformities="$(find "$nonconformities_dir" -type f -name '*.md' ! -name README.md | wc -l | tr -d ' ')"
open_nonconformities="$(grep -R -l '^status: open$' "$nonconformities_dir" --include='*.md' 2>/dev/null | wc -l | tr -d ' ')"
corrected_nonconformities="$(grep -R -l '^status: corrected$' "$nonconformities_dir" --include='*.md' 2>/dev/null | wc -l | tr -d ' ')"

if [ "$executions" -gt 0 ]; then
  success_rate="$(awk -v success="$success" -v total="$executions" 'BEGIN { printf "%.1f", (success * 100) / total }')"
else
  success_rate="0.0"
fi

cat <<REPORT
AI governance report
executions=$executions
success=$success
non_success=$failed
success_rate_percent=$success_rate
executions_with_token_measurement=$measured_tokens
executions_with_latency_measurement=$measured_latency
legacy_unverified_executions=$legacy_unverified
execution_attestations=$attestations
nonconformity_records=$nonconformities
open_nonconformities=$open_nonconformities
corrected_nonconformities=$corrected_nonconformities
REPORT

if [ "$legacy_unverified" -gt 0 ]; then
  echo "notice: historical executions remain legacy_unverified; no provenance was fabricated"
fi

if [ "$open_nonconformities" -gt 0 ]; then
  echo "warning: open AI governance nonconformities require an owner and correction plan"
fi
