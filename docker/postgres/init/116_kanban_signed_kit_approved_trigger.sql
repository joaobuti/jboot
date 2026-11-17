\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Gatilho "Quando o kit assinado for aprovado" (docs/product/flow-signed-kit-sprints.md, S3): so com a acao
-- "Ir para a coluna" (`move_card`), como `ai_completed`. Dispara pelo evento `card.signed_kit_approved` do card
-- que esta na coluna da regra (o motor de movimento confere a coluna de novo antes de mover).
--
-- Migration aditiva e idempotente.
BEGIN;

ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_column_automation_rules_trigger_type_check;
ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_column_automation_rules_trigger_type_check CHECK (trigger_type IN (
    'column_entered', 'column_left', 'due_date_approaching', 'card_stale', 'juridico_process_moved', 'ai_completed',
    'signed_kit_approved'
  ));

ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_automation_signed_kit_approved_check;
ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_automation_signed_kit_approved_check CHECK (trigger_type <> 'signed_kit_approved' OR action_type = 'move_card');

COMMIT;
