\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 9: quatro trigger_type novos no motor generico de automacao por
-- coluna (Sprint 8): due_date_approaching, card_stale, column_left,
-- juridico_process_moved. Mesmo action_type=send_email_notification.
-- Ver docs/product/kanban-sprint-9-gate.md e MODULE_CONTRACT.md, secao
-- "Gatilhos Adicionais De Automacao (Sprint 9+)".

ALTER TABLE kanban_column_automation_rules
  DROP CONSTRAINT IF EXISTS kanban_column_automation_rules_trigger_type_check;

ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_column_automation_rules_trigger_type_check
  CHECK (trigger_type IN ('column_entered', 'due_date_approaching', 'card_stale', 'column_left', 'juridico_process_moved'));

ALTER TABLE kanban_column_automation_rules
  ADD COLUMN IF NOT EXISTS trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Idempotencia por dia (due_date_approaching / card_stale): source_activity_id
-- passa a ser nullable e ganha a coluna irma dispatch_date, com duas UNIQUE
-- parciais no lugar da UNIQUE unica anterior. Ver "PE Decision — Idempotencia
-- por dia" no gate da Sprint 9.
ALTER TABLE kanban_automation_dispatch_log
  ALTER COLUMN source_activity_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS dispatch_date date NULL;

ALTER TABLE kanban_automation_dispatch_log
  DROP CONSTRAINT IF EXISTS kanban_automation_dispatch_lo_card_id_board_column_id_autom_key;

CREATE UNIQUE INDEX IF NOT EXISTS kanban_automation_dispatch_log_reactive_uq
  ON kanban_automation_dispatch_log (card_id, board_column_id, automation_rule_id, source_activity_id)
  WHERE source_activity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kanban_automation_dispatch_log_scheduled_uq
  ON kanban_automation_dispatch_log (card_id, board_column_id, automation_rule_id, dispatch_date)
  WHERE dispatch_date IS NOT NULL;

ALTER TABLE kanban_automation_dispatch_log
  DROP CONSTRAINT IF EXISTS kanban_automation_dispatch_log_origin_check;

ALTER TABLE kanban_automation_dispatch_log
  ADD CONSTRAINT kanban_automation_dispatch_log_origin_check
  CHECK ((source_activity_id IS NOT NULL) <> (dispatch_date IS NOT NULL));
