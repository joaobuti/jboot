# Kanban Sprint 8 Gate

## Status

PE Decision e Stack Fit Gate concluidos pelo Architect em 2026-09-13. Confirmado
por decisao humana em 2026-09-13. Backend implementado e testado (213/213).
Frontend (`app-jboot-next-platform/modules/kanban`) implementado em 2026-09-13:
aba "Automacoes" na settings da coluna do board, `type-check` e `build`
passando no container. Smoke manual completo (criar regra -> mover card ->
job na fila -> e-mail no Mailhog -> linha `sent` em
`kanban_automation_dispatch_log`) ainda nao executado nesta sessao — ver
`docs/product/kanban-sprints.md` (Sprint 8) para detalhe.

Agents/skills declarados: PE + Architect (documento de decisao); implementacao
usa `kanban-board-domain` (backend) e as skills `kanban-board-crud`/
`kanban-realtime` como referencia de padrao.

## Escopo

Sprint 8: motor de automacao por coluna (`trigger_type`/`action_type`
genericos), fundacao com `trigger_type=column_entered` e
`action_type=send_email_notification`.

Projetos afetados:

- `implementations/bff-jboot-platform/modules/kanban`;
- `implementations/app-jboot-next-platform/modules/kanban` (CRUD de regra na
  tela de settings do board).

## Regras De Negocio

- `ColumnAutomationRule` pertence a uma `BoardColumn`; CRUD restrito a
  `board_admin` do board.
- Disparo e reativo a movimentacao de card (hook em `cards.service.ts::move()`),
  nunca endpoint publico de disparo manual.
- Disparo e assincrono, idempotente por `(card_id, board_column_id,
  automation_rule_id, source_activity_id)`, e nunca bloqueia nem reverte a
  movimentacao do card.
- Destinatario dinamico por `recipient_role`: `assignee` (`CardAssignee`),
  `creator` (`Card.created_by_identity_id`) ou `board_member` (identidade fixa
  escolhida na configuracao da regra).
- Isolamento por `client_id` obrigatorio em toda tabela e query nova.
- Reentrada na mesma coluna dispara novamente; sem supressao por disparo
  anterior no mesmo card.
- Card sem destinatario resolvivel nao gera erro, so ausencia de envio.
- Falha de envio (provedor indisponivel) nunca bloqueia nem reverte a
  movimentacao do card.

## Banco/API

- Migration nova: `020_kanban_column_automation.sql` — tabelas
  `kanban_column_automation_rules` e `kanban_automation_dispatch_log`.
- Endpoints novos (`board_admin`):
  `GET/POST /kanban/boards/:boardId/columns/:columnId/automation-rules`,
  `PATCH/DELETE /kanban/boards/:boardId/columns/:columnId/automation-rules/:ruleId`
  (DELETE e soft, `is_active=false`).
- Fila BullMQ `kanban:column-automation` sobre Valkey, worker dentro do
  processo `platform-api` (sem app process novo).
- Envio de e-mail via `MailerService` proprio do modulo (nodemailer + SMTP
  generico via env), nao via `src/modules/notifications`.

## Validacao Planejada

- Backend: typecheck, lint, teste automatizado de idempotencia (mesmo
  `source_activity_id` nao dispara duas vezes), teste de resolucao de
  destinatario por `recipient_role`, teste de guard `board_admin` no CRUD,
  teste do worker com `Queue`/`Worker` mockados.
- Frontend: type-check, lint, testes Vitest existentes, smoke de CRUD de regra
  na tela de settings do board.
- Smoke manual: aplicar migration, criar regra, mover card para a coluna,
  confirmar job na fila (via `valkey-cli`), confirmar e-mail recebido no
  Mailhog/Mailpit local, confirmar linha `sent` em
  `kanban_automation_dispatch_log`.

## Decisao Do Architect

- Excecao ao "sem Redis/pub-sub multi-instancia sem decisao explicita" do
  `MODULE_CONTRACT.md`: autorizado uso de Valkey como broker BullMQ para fila
  de job assincrono (nao e pub/sub de broadcast WebSocket, que segue
  restrito). Valkey ja era container `required` no ambiente do modulo antes
  desta sprint — nao ha infra nova no `docker-compose.yml`.
- SMTP generico via env (nodemailer) escolhido em vez de provedor
  transacional dedicado: adequado ao volume/escopo da fundacao (1 acao, 1
  e-mail por evento configurado); troca futura de provedor e so troca de env
  (SMTP relay), sem reescrever codigo. Risco aceito e registrado: sem
  tracking de bounce/reputacao de dominio nesta fundacao — se o volume
  crescer, decisao de migrar para provedor transacional deve voltar para
  confirmacao humana, nao ser assumida silenciosamente.
- Envio de e-mail implementado dentro do modulo kanban (`MailerService`
  local), nao em `src/modules/notifications` (escopo diferente: in-app/
  WebSocket) nem em modulo compartilhado novo (sem segundo consumidor real
  hoje — extrair para `shared/mailer` somente quando surgir).
- Idempotencia e responsabilidade do banco (`UNIQUE` em
  `kanban_automation_dispatch_log`), nao da fila — BullMQ pode
  reenfileirar/reprocessar sem risco de e-mail duplicado.

## Riscos E Pendencias

- Enqueue fire-and-forget: se Valkey estiver indisponivel no momento da
  movimentacao, o job se perde silenciosamente (so logado) — sem outbox
  transacional nesta fundacao. Aceitavel para notificacao operacional, nao
  para automacao critica de negocio.
- Sem DLQ dedicada: jobs esgotados ficam no "failed set" do BullMQ + linha
  `status='failed'` no Postgres; sem alerta automatico de falha de envio.
- Sem tracking de bounce/reputacao de dominio (ver Decisao Do Architect
  acima).
- Motor generico por `trigger_type`/`action_type` abre a porta para
  automacoes futuras (outros triggers/acoes) que nao fazem parte desta
  fundacao e nao devem ser antecipadas sem nova sprint formal.

## Open Questions

1. Nome do servico Mailhog/Mailpit a adicionar ao `docker-compose.yml`
   (dev-only) e das variaveis `SMTP_*` em `.env.example` — decisao trivial de
   implementacao, sem impacto de escopo.
2. Sem alerta operacional automatico quando um job esgota tentativas
   (`status='failed'`) — aceitavel para a fundacao; se virar recorrente,
   precisa de decisao de produto sobre onde esse alerta aparece.
3. Ausencia de outbox transacional para o enqueue (risco de perda silenciosa
   se Valkey cair no exato momento da movimentacao) — aceito como risco de
   fundacao, nao bloqueante.

## Blocking Status

Nenhum bloqueio remanescente. Confirmacao humana obtida em 2026-09-13.
