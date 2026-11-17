# Flow — Unificacao Do Trabalho Sem Commit Em `feature/flow-office-kit`

```yaml
data: 2026-10-28
branch_destino: feature/flow-office-kit (checkpoint 1a0e7f220)
origem: worktree .claude/worktrees/flow-office-contract (branch feature/flow-office-service-contract, base a0f1ddf60, 79 arquivos sem commit, trabalho de 2026-10-21)
snapshot_da_origem: commit solto 273c24c71 (sem ref; a arvore da origem nao foi alterada)
decisao_do_usuario: manter TUDO da origem (gatilho customizavel ai_completed -> move_card, acoes manuais por coluna, HISCRED) e revisar as implementacoes desta branch
estado: unificado em 2026-10-28 (squash do snapshot 273c24c71 sobre 1a0e7f220, sem commit)
```

## Diagnostico

- Em commits, esta branch ja contem todas as branches do Flow. Fora dela so ha:
  - `codex/flow-drive-oauth-wip` (1 commit WIP de 2026-10-15), superado por `d305ee434` (Drive conectado
    pela tela), que ja esta aqui;
  - 2 stashes de 13 dias atras sobre o Drive, tambem superados;
  - trabalho **sem commit** no worktree `flow-office-contract` (este documento) e no checkout principal
    (acoes por coluna numa versao mais antiga, migrations 085/086; nao lido, por regra da sessao).
- O que esta no ar no dev e o checkout principal (`codex/juridico-flow-resume` + o trabalho sem commit dele):
  por isso os menus antigos.
- O banco de dev ja tem as migrations 090, 091 e 092 da origem aplicadas (tabela de acoes por coluna,
  outbox de movimento, gatilho `ai_completed`) e 1 regra `ai_completed`/`move_card`.
- Fusao simulada (merge de 273c24c71 sobre 1a0e7f220): 24 arquivos em conflito, 1 adicionado nos dois
  lados (`docs/security/flow-hiscred-checklist.md`).

## A. Trazer Da Origem (Comportamento Mantido)

- [x] Acoes manuais por coluna: `src/modules/kanban/actions/` (catalogo, handlers Gerar Protocolo e
      Monitorar, politica, rate limit), migrations `090_kanban_card_actions.sql` e
      `091_identity_flow_card_actions.sql` (`flow:actions:execute`), `BoardActionsSettings`,
      `CardActionButtons`, rota `/flow/boards/[boardId]/settings/actions`, `lib/card-actions.ts`, openapi,
      checklist de seguranca, sprint e attestation.
- [x] Conclusao explicita da IA e movimentacao: gatilho `ai_completed`, acao `move_card` com
      `toBoardColumnId` (para qualquer gatilho), `092_kanban_ai_completion_move.sql`
      (`kanban_movement_automation_outbox`, status `awaiting_confirmation`, limite de 10 saltos),
      `automation-completion.ts`, `movement-automation.*`, tool MCP `flow_complete_automation`, tool
      `kanban.automation.complete` no `svc-jboot-ai-gateway`, `lib/automation-movement.ts`, ajustes em
      `BoardView`, `flow-admin-directory.service.ts`, `scheduled-automation.repository.ts`, docs (sprint,
      runbook, API, seguranca, attestation).
- [x] HISCRED: ja esta nesta branch como `095_kanban_customer_hiscred.sql` (conteudo identico). Nao trazer o
      `093_kanban_customer_hiscred.sql` da origem; unificar os dois `flow-hiscred-checklist.md`.
- [x] Rotulos do catalogo de documentos: manter os desta branch ("HISCON — Historico de Consignado"); a
      origem tem os antigos.

## B. Conflitos De Base (A Origem Foi Feita Antes Do Outbox De E-mail E Do Kit)

- [x] `cards.service.ts`/`cards.repository.ts`: a origem passa `automation` (profundidade, raiz, commit do
      recibo) para `move` e grava `card.moved` com `automationDepth`; aqui `move` devolve
      `movedActivityId` e o disparo vai para `emailAutomations.recordForActivity`. Reescrever o movimento
      com os dois.
- [x] `automation-worker.service.ts`: injetar `MovementAutomationService` junto do agendador e das
      metricas de e-mail.
- [x] `ai-automation-processor.service.ts`, `ai-automation-outbox.repository.ts`: somar
      `awaiting_confirmation` e a exigencia de confirmacao aos prazos por resultado esperado (30 min/3 h) e
      as pre-condicoes de peticoes desta branch.
- [x] `automation-rules.service.ts`/DTO: validacao da origem (`ai_completed`, `move_card`) junto com
      `expectedResult`/`documentGenerator`.
- [x] `flow-connector-tools.service.ts` e spec: `flow_complete_automation` junto das tools novas
      (analise, peticoes, print, cliente com `petition`).
- [x] `customer-documents`, `customer-validation` (steps e specs): ficar com a versao desta branch (mais
      nova); conferir se a origem tinha algo alem do HISCRED.
- [x] `card-visibility.static.spec.ts`: unir as entradas da allowlist dos dois lados.
- [x] `MODULE_CONTRACT.md` (BFF e web), `AI_CONTEXT.md` (regerar), `kanban-sprint-10-12-openapi.yaml`.

## C. Refazer Nesta Branch Para O Desenho Da Origem

- [x] Retirar "Ao concluir sem erro, mover o card para" (`actionConfig.onSuccessMoveToColumnId`) da regra
      "Executar agente" e o `AutomationCardMoveService`. O movimento passa a ser uma regra propria
      `ai_completed -> move_card`, com o gatilho customizavel.
- [x] Migrar a regra `37e6a1e0` (Analise de Acoes, destino `edaefcd8`) para uma regra `ai_completed` +
      `move_card` na mesma coluna; tirar `onSuccessMoveToColumnId` das regras existentes.
- [x] A1 (Analise de Acoes): `flow_submit_action_analysis` deixa de mover; com analise concluida e ao
      menos uma acao, encerra a execucao emitindo a conclusao (`ai.automation_completed`, atomica com o
      `completed`). Sem acao ou nao concluida: sem conclusao.
- [x] S5 (Peticoes iniciais): `flow_finish_initial_petitions` idem, com ao menos uma peticao.
- [x] `move_outcome`/`move_detail` em `kanban_card_action_analyses` e `kanban_card_petition_runs`, os textos
      "card movido" nos paineis (`CardActionAnalysisPanel`, `CardInitialPetitionsPanel`) e no historico
      (`card.automation_completed`): passar a refletir a regra de movimento ou sair.
- [x] S1 (Resultado esperado): na origem, comentario nunca conclui; conclui so `flow_complete_automation`.
      `comment` passa a concluir pela confirmacao; `flow_complete_automation` recusa execucao de
      `action_analysis` e `initial_petitions` (essas concluem pela ferramenta propria). Rever
      `commentCompletesRun`, `runNote` e a descricao das tools.
- [x] Modal da regra (`AutomationRulesSettings`): unir gatilho `ai_completed` e acao `move_card` da origem
      com "Resultado esperado" e "Quem gera o documento"; tirar a secao "Depois da execucao"; reescrever os
      avisos (quem conclui, como o card anda).
- [x] Prompts: analise de acoes (v2 fala do movimento pela regra), peticoes iniciais (secao 00 e 14) e o da
      validacao, conforme o protocolo de confirmacao da origem (`docs/runbooks/flow-ai-completion.md`).
- [x] Testes: os de movimento na A1 e na S5 (`moveAfterSuccess`), conclusao generica e comentario com
      `run_id` (S1) passam a testar a emissao da conclusao; conectar com os testes de movimento da origem.
- [x] Docs: ADR 019 decisao 18, ADR 020 decisoes 2 e 3 (registrar a substituicao pelo gatilho
      customizavel), `flow-action-analysis-sprints.md` (complemento da A1), `flow-initial-petitions-sprints.md`
      (S1, S5), `claudeconf.md` (configurar a regra de movimento), openapi do conector.

## D. Numeracao E Runtime

- [x] Migrations da origem 090, 091 e 092 entram com o mesmo numero (livres aqui e ja aplicadas no dev);
      o `093` da origem sai (duplica o 095). Conferir que 101 e 103 continuam aplicando sobre 092.
- [ ] (Fora desta sessao) Checkout principal: as acoes por coluna em versao antiga (085/086, sem commit) ficam para quem
      trabalha naquele checkout descartar; o numero 085 ja existe aqui com outros arquivos.
- [x] Depois da unificacao: BFF, web e AI Gateway do container rodando este worktree (o gateway porque a
      origem mudou o catalogo de tools).
- [x] Gates: testes, type-check, lint e build dos tres projetos no container; `make ai-check`,
      `make ai-diff-check`; attestation nova cobrindo a unificacao.

## Segunda Rodada (2026-10-28): Trabalho Sem Commit Do Checkout Principal

Com autorizacao do usuario, o diff sem commit de `/home/projetos/jboot` (branch `codex/juridico-flow-resume`,
26 commits atras da `main`) foi lido so em modo leitura, por snapshot solto (`fe8313e4d`) e fusao simulada em
worktree descartavel. Nada foi editado la.

- [x] Acoes por coluna (085/086 e codigo): versao antiga; 085 e 086 identicas a 090 e 091 desta branch. Nao
      portado.
- [x] `BoardView`, `kanban-api`, `kanban.module`: ja cobertos por esta branch.
- [x] Replica do Drive com fencing de reserva e recuperacao de reserva vencida: portado para a versao atual
      (`document-sync.repository.ts`/`.service.ts`), com o spec novo adaptado ao esquema OAuth atual e um teste
      do servico para a reserva perdida.
- [x] ADR 015 e `sprint-juridico-flow.md`: atualizacoes do registro no Architecture Graph aplicadas.
- [ ] (Fora desta sessao) Descartar o trabalho sem commit do checkout principal depois do merge na `main`.

Fora do Flow e fora desta unificacao: `feature/marketing-agent-worker` e `chore/marketing-descarte-modulo`
(modulo de marketing descartado; a `main` ja tem o revert).

