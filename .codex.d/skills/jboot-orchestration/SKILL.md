---
name: jboot-orchestration
description: Use for JBoot architectural planning, project routing, target_project/target_module selection, Agent Activation, sprint gates, and contract-first execution before coding.
---

# JBoot Orchestration

## Response Style

- When answering questions, prioritize technical accuracy over social agreement.
- Do not use performative empathy, praise, or generic validation as a substitute for analysis.
- If the user's premise is incorrect, incomplete, ambiguous, or risky, suggest a correction directly and briefly explain the technical basis, avoided risk, or tradeoff involved.

## Workflow

1. Read `AGENTS.md`.
2. Read `docs/architecture/implementation-contracts.md`.
3. Determine `execution_mode`.
4. Determine `target_project`.
5. If platform modular, determine `target_module`.
6. Natural-language requests to map implementation, plan implementation, design architecture, create a service, create a new integration, integrate products, or plan a cross-module feature in `implementations/*` are governed planning work even before file edits. Before a closed technical/architectural recommendation, emit `PE Decision`, `Stack Fit Gate` when applicable, `sprint_artifact`, `sprint_gate`, `open_questions`, and `blocking_status`.
7. If the task creates a project/module/product/landing/app/BFF/worker/service/integration in `implementations/*`, run `PO -> PE -> Architect -> human confirmation` before creating contracts, agents, skills, or code.
8. For any new project/module/product/landing/app/BFF/worker/service/integration, run `Stack Fit Gate` before recommending a stack: PE classifies the real delivery type; Architect compares candidate stacks by fit for scope, SEO/interactivity when applicable, runtime, deployment, maintainability, tests, and evolution. Repository baseline is a justified fallback, not an automatic choice. For static sites, documentation, portfolios, landing pages, or technical marketing with little interactivity, compare Astro before Next.js.
9. After human confirmation and before creating `PROJECT_CONTRACT.md`, `MODULE_CONTRACT.md`, directories, agents, skills, or code for a new project/module/product/landing/app/BFF/worker/service/integration, create/switch automatically to a dedicated Git branch following the repository's existing branch conventions.
10. Do not mix unrelated projects/features in the same implementation branch.
11. Resolve every PO/PE/Architect open question before materializing work: user answered, user approved non-blocking deferral, or user approved a temporary assumption with recorded risk.
11b. Persist PO functional sprints to `docs/product/<module-or-product>-sprints.md` (existing convention: `pdv-sprints.md`, `kanban-sprints.md`, `comanda-sprints.md`) and reference that file under `Contratos Obrigatorios` in the affected `MODULE_CONTRACT.md` before implementing any sprint. Record per sprint: objective, acceptance criteria, out-of-scope items, and delivery state (`pendente`/`em andamento`/`concluida`), plus closed scope decisions and known debts. Sprints that exist only as conversation output are not deliverable — they are lost across sessions and context windows and are invisible to later agents.
12. If the task affects brand, public landing, institutional site, public SEO, campaign, commercial copy, or public positioning, require `docs/agents/orchestration/marketing-brand.md` before visual/text implementation. Use `docs/mkt/jb-cyan.jpg` as the default JBoot visual reference and `docs/mkt/jb-cyan-white.png` for clean/light contexts unless a human decision overrides it.
13. For main visual assets, require practical integration into the visual system: derived tokens, palette, lines, components, sections, CTAs, or narrative. An isolated hero image is not sufficient visual identity.
14. If the delivery in `implementations/*` includes a screen, user flow, or new web UI component, require `docs/agents/orchestration/ui-ux.md` before the local `frontend-*` agent.
15. Use `docs/agents/stacks/*` as reference subagents for Stack Fit Gate and local-agent creation/review; do not use stack agents as primary executors when a `target_project` exists.
16. Read the relevant `PROJECT_CONTRACT.md`.
17. Validate `lifecycle_status` and never infer `production_ready` from code presence.
18. If applicable, read `MODULE_CONTRACT.md`.
19. If the task creates a project/module or changes local runtime infra, use `dev-runtime-profile`.
20. Emit `Agent Activation` before code.

## Required Output Before Code

```text
Agent Activation:
  project:
  module:
  using_agent:
  using_skill:
  referenced_only:
  not_using:
```

If the block is absent, the execution is non-conformant.
