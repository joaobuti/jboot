\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

CREATE UNIQUE INDEX IF NOT EXISTS kanban_columns_tenant_board_id
  ON kanban_board_columns (client_id, board_id, id);

CREATE TABLE IF NOT EXISTS kanban_column_actions (
    client_id uuid NOT NULL,
    board_id uuid NOT NULL,
    column_id uuid NOT NULL,
    action_id varchar(80) NOT NULL,
    configured_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, board_id, column_id, action_id),
    FOREIGN KEY (client_id, board_id, column_id)
      REFERENCES kanban_board_columns (client_id, board_id, id) ON DELETE CASCADE
);
