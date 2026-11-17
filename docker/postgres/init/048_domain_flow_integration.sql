\set ON_ERROR_STOP on

\connect jboot_kanban_demo_dev

ALTER TABLE kanban_board_columns
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE kanban_cards
  ADD COLUMN IF NOT EXISTS source_module varchar(80),
  ADD COLUMN IF NOT EXISTS source_type varchar(120),
  ADD COLUMN IF NOT EXISTS source_id varchar(160),
  ADD COLUMN IF NOT EXISTS source_payload jsonb,
  ADD COLUMN IF NOT EXISTS source_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kanban_cards_source_ref_check'
      AND conrelid = 'kanban_cards'::regclass
  ) THEN
    ALTER TABLE kanban_cards
      ADD CONSTRAINT kanban_cards_source_ref_check CHECK (
        (source_module IS NULL AND source_type IS NULL AND source_id IS NULL)
        OR (source_module IS NOT NULL AND source_type IS NOT NULL AND source_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS kanban_board_columns_default_idx
  ON kanban_board_columns(client_id, board_id)
  WHERE is_default = true AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS kanban_cards_source_active_idx
  ON kanban_cards(client_id, board_id, source_module, source_type, source_id)
  WHERE source_module IS NOT NULL AND status <> 'archived';

DO $$
DECLARE
  v_board record;
BEGIN
  FOR v_board IN
    SELECT b.id, b.client_id
    FROM kanban_boards b
    WHERE b.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM kanban_board_columns c
        WHERE c.client_id = b.client_id
          AND c.board_id = b.id
          AND c.is_default = true
          AND c.status = 'active'
      )
  LOOP
    UPDATE kanban_board_columns
    SET position = position + 1,
        updated_at = now()
    WHERE client_id = v_board.client_id
      AND board_id = v_board.id
      AND status = 'active';

    INSERT INTO kanban_board_columns (client_id, board_id, name, position, is_default)
    VALUES (v_board.client_id, v_board.id, 'BACKLOG', 0, true);
  END LOOP;
END $$;
