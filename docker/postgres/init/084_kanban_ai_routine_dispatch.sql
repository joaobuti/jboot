\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 12, modo `claude_routine` (docs/product/kanban-claude-connector-sprints.md):
-- o gateway so dispara a rotina do Claude Code do dono; a rotina le o card e
-- comenta pelo conector MCP, e esse comentario (com o run_id = id do outbox)
-- conclui o item. Enquanto isso o item fica `dispatched`.
ALTER TABLE kanban_ai_automation_outbox
  ADD COLUMN IF NOT EXISTS dispatch_attempt INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS external_session_url TEXT NULL;

ALTER TABLE kanban_ai_automation_outbox
  DROP CONSTRAINT IF EXISTS kanban_ai_automation_outbox_status_check;
ALTER TABLE kanban_ai_automation_outbox
  ADD CONSTRAINT kanban_ai_automation_outbox_status_check
  CHECK (status IN ('pending', 'processing', 'dispatched', 'completed', 'review_required', 'failed'));

-- O disparo da rotina nao tem idempotencia: so um limite (429) gera nova
-- tentativa, com chave nova; falha de transporte reusa a mesma chave.
ALTER TABLE kanban_ai_automation_outbox
  DROP CONSTRAINT IF EXISTS kanban_ai_automation_outbox_dispatch_attempt_check;
ALTER TABLE kanban_ai_automation_outbox
  ADD CONSTRAINT kanban_ai_automation_outbox_dispatch_attempt_check
  CHECK (dispatch_attempt BETWEEN 1 AND 10);
