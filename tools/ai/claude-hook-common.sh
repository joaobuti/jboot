#!/usr/bin/env sh

extract_hook_json() {
  hook_payload="$(cat)"
  HOOK_PAYLOAD="$hook_payload" node -e '
const input = process.env.HOOK_PAYLOAD || "";
  let payload = {};
  try { payload = input.trim() ? JSON.parse(input) : {}; } catch (_) {}

  const toolName = payload.tool_name || payload.toolName || "";
  const toolInput = payload.tool_input || payload.toolInput || {};
  const inlineTranscript = payload.transcript || payload.conversation || payload.messages || "";

  // Claude Code does not inline the conversation in the hook payload; it only
  // provides transcript_path (a .jsonl file). Read it so hasAgentActivation
  // and the other conversation-text checks below can actually see what the
  // assistant said, instead of always evaluating against an empty string.
  let transcript = inlineTranscript;
  if (!transcript && payload.transcript_path) {
    try {
      const fs = require("fs");
      const stat = fs.statSync(payload.transcript_path);
      const maxBytes = 2 * 1024 * 1024;
      if (stat.size > maxBytes) {
        const fd = fs.openSync(payload.transcript_path, "r");
        const buf = Buffer.alloc(maxBytes);
        fs.readSync(fd, buf, 0, maxBytes, stat.size - maxBytes);
        fs.closeSync(fd);
        transcript = buf.toString("utf8");
      } else {
        transcript = fs.readFileSync(payload.transcript_path, "utf8");
      }
    } catch (_) {
      transcript = "";
    }
  }

  const paths = [];
  const push = (value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach(push);
    else if (typeof value === "string") paths.push(value);
    else if (typeof value === "object") {
      for (const key of ["file_path", "filepath", "path", "target_file"]) push(value[key]);
    }
  };

  push(toolInput.file_path);
  push(toolInput.filepath);
  push(toolInput.path);
  push(toolInput.target_file);
  push(toolInput.files);
  push(toolInput.edits);

  const haystack = [
    JSON.stringify(payload),
    typeof transcript === "string" ? transcript : JSON.stringify(transcript),
  ].join("\n");

  const has = (pattern) => pattern.test(haystack);
  const uniquePaths = [...new Set(paths)];

  const result = {
    toolName,
    paths: uniquePaths,
    touchesImplementations: uniquePaths.some(p => p.includes("implementations/")),
    touchesAiGovernance: uniquePaths.some(p =>
      p === "AGENTS.md" ||
      p === "Makefile" ||
      p.includes("docs/ai-governance/") ||
      p.includes("docs/agents/") ||
      p.includes("docs/skills/") ||
      p.includes("docs/ai-commands/") ||
      p.includes("tools/ai/") ||
      p.includes(".codex.d/") ||
      p.includes(".claude/") ||
      p.includes(".cursor/") ||
      p.includes("copilot-instructions.md") ||
      /(?:PROJECT|MODULE)_CONTRACT\.md$/.test(p)
    ),
    touchesRuntime: uniquePaths.some(p =>
      p === "docker-compose.yml" ||
      p === "Makefile" ||
      p.includes("tools/dev-up.sh") ||
      p.includes("docker/postgres/init/") ||
      /package(-lock)?\.json$/.test(p)
    ),
    touchesSecuritySensitive: uniquePaths.some(p =>
      /\/auth\//.test(p) ||
      /\/guards\//.test(p) ||
      /\/dto\//.test(p) ||
      /controller\./.test(p) ||
      /repository\./.test(p) ||
      /package(-lock)?\.json$/.test(p)
    ),
    hasAgentActivation: has(/Agent Activation:/),
    hasAiCommand: has(/\/jboot-(plan-feature|implement-feature|new-module|security-review|runtime-profile)\b/),
    hasRuntimeCommand: has(/\/jboot-runtime-profile\b|dev-runtime-profile/),
    hasSecurityCommand: has(/\/jboot-security-review\b|security-checklist/),
    hasNewModuleCommand: has(/\/jboot-new-module\b/),
    hasAiGovernanceSkill: has(/ai-first-governance|make ai-conformance/),
    appearsNewModule: has(/novo (modulo|m[oó]dulo|produto|app|bff|worker|servi[cç]o|integra[cç][aã]o)|new (module|project|app|bff|worker|service|integration)/i),
  };

  process.stdout.write(JSON.stringify(result));
'
}

hook_warn() {
  printf '%s\n' "$*" >&2
}

hook_block() {
  printf '%s\n' "$*" >&2
  exit 2
}
