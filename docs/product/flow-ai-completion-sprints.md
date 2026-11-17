# Flow — Conclusao Explicita Da IA E Movimentacao

## Decisoes Confirmadas — 2026-10-21

- Trabalhar no checkout do runtime `flow-office-contract`, sem trocar branch.
- Gatilho `ai_completed`: todas as atividades do prompt concluidas com sucesso,
  com confirmacao estruturada explicita. Comentario isolado nao conclui run.
- Rotina Claude: tool `flow_complete_automation` com run/card/board e
  `confirmation = {version:1,status:succeeded,allTasksCompleted:true}`.
- API: function tool `kanban.automation.complete`, com o mesmo contrato,
  como ultima chamada, apos efeitos autorizados. Sem confirmacao: aguardando;
  efeito sujeito a revisao humana: review_required, nunca conclusao automatica.
- Contrato acrescentado ao input da execucao e as instrucoes MCP, sem
  sobrescrever prompts particulares. Prompts novos devem exigir a confirmacao.
- Acao `move_card`: destino fixado pela regra, ativo e do mesmo board.
- Neste gatilho a acao e movimentacao. Outros gatilhos existentes continuam
  disponiveis e a movimentacao tambem pode ser configurada para eles.
- Executor revalida dono da regra no Identity, tenant, card visivel, transicao,
  ACL, checklist e WIP pelo servico canonico. Nunca usar autoridade do modelo.
- Outbox duravel, claim com fencing, receipt atomico com a movimentacao,
  revalidacao da coluna original, limite de 10 saltos para cadeias automaticas.

## Sprint 1

Estado: `em andamento`.
Objetivo: confirmar conclusao da IA e mover o card pela regra do administrador.

### Sprint Gate

- [x] Gatilho e seletor de coluna de destino na UI existente.
- [x] DTO, persistencia e validacao da combinacao/destino no backend.
- [x] Confirmacao explicita, vinculada ao run, idempotente e autorizada.
- [x] Ausencia de confirmacao, falha ou review nao dispara.
- [x] Movimento duravel e auditavel, revalida permissoes e estado atual.
- [x] Testes positivos/negativos, evals, typechecks e builds no container.
- [x] Graphs, seguranca, contexto e conformance atualizados.
- [x] Runtime compartilhado atualizado e smoke de rotas aprovado.

## Evidencias — 2026-10-21

- Backend final: 667 testes, 665 aprovados e 2 skips Gotenberg, zero falhas.
  Inclui recovery/scheduler/Identity e rejeicao de confirmacoes parciais no MCP.
- Estabilizado um teste existente de visibilidade P11 que pressupunha ordem
  entre eventos com o mesmo timestamp (`now()` da transacao do fixture).
  A assercao preserva tipos, quantidades e ausencia de eventos privados;
  nenhum comportamento de producao foi alterado por essa correcao do teste.
- Frontend: 139 testes aprovados. Gateway: 46 testes aprovados.
- Typecheck/build dos tres projetos e lint backend do escopo aprovados no container.
- `make ai-check`: aprovado, API/Architecture Graph sem erros.
- Migration 092 aplicada; API 8010 e Gateway 8050 health 200; pagina Automacoes 3002 200.
- Gateway tambem passou a executar deste mesmo worktree, preservando o ambiente
  anterior; manifestos/locks comparados com a raiz, sem divergencia previa.
  Dependencias ja instaladas reutilizadas localmente, sem download/alterar locks.
- Seguranca: `docs/security/flow-ai-completion-checklist.md`.
- Prompts/protocolo: `docs/runbooks/flow-ai-completion.md`.
- Stewardship: confirmacao nao autoriza destino escolhido por modelo; a nova
  capacidade permanece dentro das fronteiras existentes. Sem nova taxonomia.
- Arvore inicialmente suja preservada, sem commit/push. Fechamento terminal da
  sprint permanece pendente de revisao/commit conjunto com o trabalho paralelo.
- Nenhum prompt privado foi reescrito e nenhuma chamada paga de IA foi feita.
  Operador deve atualizar o prompt da rotina/versao do agente conforme runbook;
  agentes API precisam habilitar a nova ferramenta de confirmacao.

Fora de escopo: aprovar documentos por IA, mudar prompts privados em massa,
novos providers, permitir que o modelo escolha destino ou desvie das ACLs.
Deployment Boundary Gate: feature embedded nos processos existentes.
Stack Fit Gate: herdada; nenhum deploy/runtime independente novo.
Open questions: nenhuma. Owner: kanban; stewardship do graph sem nova taxonomia.

Limite: confirmacao e uma declaracao estruturada da IA, nao prova independente
de cada tarefa do prompt. Gates locais e revisao humana continuam soberanos.
