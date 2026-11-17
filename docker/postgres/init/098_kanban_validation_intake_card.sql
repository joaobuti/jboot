\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Card automatico na confirmacao da validacao (ADR 019, decisao 16, 2026-10-26):
-- 1. Board de entrada por escritorio: o card do cliente validado nasce na coluna BACKLOG dele.
-- 2. Na validacao: escritorio do pedido e o resultado da criacao do card (para a tela e auditoria).
BEGIN;
CREATE TABLE IF NOT EXISTS kanban_office_intake_boards (
  client_id uuid NOT NULL,
  office_id uuid NOT NULL,
  board_id uuid NOT NULL REFERENCES kanban_boards (id) ON DELETE CASCADE,
  updated_by_identity_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (client_id, office_id),
  CONSTRAINT kanban_office_intake_boards_office_fk
    FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id) ON DELETE CASCADE
);

ALTER TABLE kanban_customer_validation_runs
  ADD COLUMN IF NOT EXISTS intake_office_id uuid,
  ADD COLUMN IF NOT EXISTS intake_result text,
  ADD COLUMN IF NOT EXISTS intake_board_id uuid,
  ADD COLUMN IF NOT EXISTS intake_card_id uuid;

ALTER TABLE kanban_customer_validation_runs
  DROP CONSTRAINT IF EXISTS kanban_customer_validation_runs_intake_check;
ALTER TABLE kanban_customer_validation_runs
  ADD CONSTRAINT kanban_customer_validation_runs_intake_check CHECK (
    intake_result IS NULL
    OR intake_result IN ('created', 'existing', 'no_office', 'no_board', 'no_backlog', 'failed')
  );
COMMIT;
