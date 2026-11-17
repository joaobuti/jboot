#!/usr/bin/env sh
set -eu

. "$(dirname "$0")/claude-hook-common.sh"

json="$(extract_hook_json)"

touches_runtime="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.touchesRuntime ? "yes" : "no")')"
touches_security="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.touchesSecuritySensitive ? "yes" : "no")')"
touches_ai_governance="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.touchesAiGovernance ? "yes" : "no")')"
has_runtime="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.hasRuntimeCommand ? "yes" : "no")')"
has_security="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.hasSecurityCommand ? "yes" : "no")')"

if [ "$touches_runtime" = "yes" ] && [ "$has_runtime" != "yes" ]; then
  hook_warn "JBoot AI governance warning: runtime-sensitive files changed. Run or document /jboot-runtime-profile before concluding."
fi

if [ "$touches_security" = "yes" ] && [ "$has_security" != "yes" ]; then
  hook_warn "JBoot AI governance warning: security-sensitive files changed. Run or document /jboot-security-review before merge/conclusion."
fi

if [ "$touches_ai_governance" = "yes" ]; then
  hook_warn "JBoot AI governance: regenerate derived context/adapters and run make ai-conformance before concluding."
fi

exit 0
