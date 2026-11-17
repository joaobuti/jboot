---
name: jboot-platform-execution
description: Use when implementing or modifying JBoot platform projects under implementations/bff-jboot-platform or implementations/app-jboot-next-platform, including module-specific agents and skills.
---

# JBoot Platform Execution

## Backend Platform

Read:

1. `implementations/bff-jboot-platform/PROJECT_CONTRACT.md`
2. `implementations/bff-jboot-platform/modules/<module>/MODULE_CONTRACT.md`

Use global agents/skills and module agents/skills together.

## Web Platform

Read:

1. `implementations/app-jboot-next-platform/PROJECT_CONTRACT.md`
2. `implementations/app-jboot-next-platform/modules/<module>/MODULE_CONTRACT.md`

Use global agents/skills and module agents/skills together.

## Rules

- Emit `Agent Activation` before code.
- Do not implement without `target_project` and `target_module`.
- Do not bypass Identity Hub.
- Do not accept `client_id` from business payloads.
- Do not create generic controllers/services/repositories for unrelated domains.
- Validate according to the project contract.
