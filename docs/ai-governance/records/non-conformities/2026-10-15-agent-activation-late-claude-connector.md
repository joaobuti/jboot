# Non-Conformity: Agent Activation exibida depois do inicio do codigo (conector Claude)

date: 2026-10-15
severity: blocking
owner: ai-governance
status: open
regression_test: pendente (ver Correction Plan)

## Expected

`CLAUDE.md`/`AGENTS.md`: `Agent Activation` visivel antes de qualquer
implementacao em `implementations/*`.

## Actual

Na implementacao do conector Claude do Flow (branch
`feature/flow-claude-connector`), o assistente Claude Code criou migrations e
codigo em `bff-jboot-identity`, `bff-jboot-platform` e `app-jboot-next-platform`
sem exibir o bloco `Agent Activation`. O bloco so foi exibido quando o hook
`tools/ai/claude-hook-pretool.sh` bloqueou a escrita de `docs/api` mais tarde.
Agents/skills usados foram os previstos no plano, mas a declaracao nao precedeu o
codigo.

## Impact

- A rastreabilidade entre ativacao e codigo ficou retroativa nesta entrega.
- O hook nao detectou a ausencia durante a maior parte da sessao.

## Root Cause

O hook considera `hasAgentActivation` verdadeiro quando o texto
`Agent Activation:` aparece nos ultimos 2 MiB da transcricao. O proprio
`.claude/CLAUDE.md` contem o modelo vazio do bloco (`Agent Activation:` seguido
de campos sem valor) e entra na transcricao no inicio da sessao; enquanto ele
estiver na janela lida, qualquer edicao passa como se houvesse ativacao. O
bloqueio so ocorreu quando a transcricao cresceu e o texto saiu da janela.
O mesmo vale para `hasAiGovernanceSkill` (`ai-first-governance` aparece no
`CLAUDE.md`).

## Correction Plan

- Hook: aceitar como ativacao apenas bloco com `project:` e `using_agent:`
  preenchidos (nao vazios), ignorando o modelo do adapter; idem para a skill de
  governanca (exigir mencao fora do texto do adapter).
- Eval de regressao em `docs/ai-governance/evals/scenarios.yaml`: transcricao
  contendo so o modelo vazio do `CLAUDE.md` deve bloquear edicao em
  `implementations/*`; transcricao com bloco preenchido deve liberar.
- Implementar em branch propria de governanca (nao misturar com o conector).

## Evidence

- Plano e entrega: `docs/product/kanban-claude-connector-sprints.md`.
- Attestation: `docs/ai-governance/attestations/2026-10-16-flow-claude-connector-routine.yaml`
  (substitui a de 2026-10-15, descartada no rebase sobre a Sprint 12 da base).
