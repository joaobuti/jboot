#!/usr/bin/env sh
set -eu

. "$(dirname "$0")/claude-hook-common.sh"

json="$(extract_hook_json)"

tool_name="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.toolName || "")')"
touches_implementations="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.touchesImplementations ? "yes" : "no")')"
touches_ai_governance="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.touchesAiGovernance ? "yes" : "no")')"
has_activation="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.hasAgentActivation ? "yes" : "no")')"
has_command="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.hasAiCommand ? "yes" : "no")')"
appears_new_module="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.appearsNewModule ? "yes" : "no")')"
has_new_module_command="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.hasNewModuleCommand ? "yes" : "no")')"
has_ai_governance="$(printf '%s' "$json" | node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); console.log(j.hasAiGovernanceSkill ? "yes" : "no")')"

case "$tool_name" in
  Edit|Write|MultiEdit)
    if [ "$touches_implementations" = "yes" ] && [ "$has_activation" != "yes" ] && [ "$has_command" != "yes" ]; then
      hook_block "JBoot AI governance blocked this edit: changes under implementations/* require visible Agent Activation or a /jboot-* command. Use docs/AI-COMMANDS.md."
    fi

    if [ "$touches_implementations" = "yes" ] && [ "$appears_new_module" = "yes" ] && [ "$has_new_module_command" != "yes" ]; then
      hook_block "JBoot AI governance blocked this edit: new project/module/product/service work must use /jboot-new-module or the approved new-project flow before files/code are created."
    fi

    if [ "$touches_ai_governance" = "yes" ] && [ "$has_ai_governance" != "yes" ]; then
      hook_block "JBoot AI governance blocked this edit: governance/contracts/adapters require ai-first-governance and make ai-conformance."
    fi
    ;;
esac

exit 0
