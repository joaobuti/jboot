\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Gatilho "Quando houver publicacao nova no DJEN" (ADR 022, docs/product/process-monitoring-sprints.md,
-- Sprint 8): reage ao evento `djen_publication_received` do card que esta na coluna da regra, com as
-- mesmas acoes da movimentacao processual (e-mail ou "Ir para a coluna").
--
-- Migration aditiva e idempotente.
BEGIN;

ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_column_automation_rules_trigger_type_check;
ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_column_automation_rules_trigger_type_check CHECK (trigger_type IN (
    'column_entered', 'column_left', 'due_date_approaching', 'card_stale', 'juridico_process_moved', 'ai_completed',
    'signed_kit_approved', 'djen_publication_received'
  ));

COMMIT;
