#!/usr/bin/env sh
set -eu

. "$(dirname "$0")/claude-hook-common.sh"

json="$(extract_hook_json)"

touches_implementations="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.touchesImplementations ? "yes" : "no")')"
has_activation="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.hasAgentActivation ? "yes" : "no")')"

if [ "$touches_implementations" = "yes" ] && [ "$has_activation" != "yes" ]; then
  hook_warn "JBoot AI governance final warning: implementations/* was touched without visible Agent Activation in the hook payload. Final response must state the gap or provide the activation/validation evidence."
fi

exit 0
