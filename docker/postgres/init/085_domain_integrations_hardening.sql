\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

ALTER TABLE juridico_audit_events
  ADD COLUMN IF NOT EXISTS operation_key varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS juridico_audit_events_operation_key_uidx
  ON juridico_audit_events (client_id, event_type, operation_key);

\connect jboot_kanban_demo_dev

ALTER TABLE kanban_card_activities
  ADD COLUMN IF NOT EXISTS integration_key varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_card_activities_integration_key_uidx
  ON kanban_card_activities (client_id, card_id, integration_key);
