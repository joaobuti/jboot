\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 7: notificacoes in-app (atribuicao, comentario em card que voce e responsavel,
-- movimentacao de card que voce e responsavel) e due date de card. Ver
-- docs/product/kanban-sprint-7-gate.md.

CREATE TABLE IF NOT EXISTS kanban_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    card_id uuid NOT NULL REFERENCES kanban_cards(id),
    recipient_identity_id uuid NOT NULL,
    actor_identity_id uuid NOT NULL,
    kind text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    read_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kanban_notifications_recipient_idx
    ON kanban_notifications (client_id, recipient_identity_id, read_at, created_at DESC);

ALTER TABLE kanban_cards
    ADD COLUMN IF NOT EXISTS due_date date NULL;
