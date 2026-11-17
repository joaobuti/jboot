\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 5: cadastro de Tags (N:N por card) e Status (1:1 por card), com
-- gestao controlada por MemberProfile. Ver docs/product/kanban-sprint-5-gate.md.

CREATE TABLE IF NOT EXISTS kanban_card_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    name varchar(80) NOT NULL,
    color varchar(24) NOT NULL DEFAULT '#6c757d',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, board_id, name)
);

CREATE TABLE IF NOT EXISTS kanban_card_statuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    name varchar(80) NOT NULL,
    color varchar(24) NOT NULL DEFAULT '#6c757d',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, board_id, name)
);

CREATE TABLE IF NOT EXISTS kanban_card_tag_links (
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards(id),
    tag_id uuid NOT NULL REFERENCES kanban_card_tags(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, tag_id)
);

ALTER TABLE kanban_cards
    ADD COLUMN IF NOT EXISTS card_status_id uuid NULL REFERENCES kanban_card_statuses(id) ON DELETE SET NULL;

ALTER TABLE kanban_member_profiles
    ADD COLUMN IF NOT EXISTS can_manage_tags boolean NOT NULL DEFAULT false;

ALTER TABLE kanban_member_profiles
    ADD COLUMN IF NOT EXISTS can_manage_statuses boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS kanban_card_tags_client_board_idx ON kanban_card_tags(client_id, board_id);
CREATE INDEX IF NOT EXISTS kanban_card_statuses_client_board_idx ON kanban_card_statuses(client_id, board_id);
CREATE INDEX IF NOT EXISTS kanban_card_tag_links_client_tag_idx ON kanban_card_tag_links(client_id, tag_id);
CREATE INDEX IF NOT EXISTS kanban_cards_client_status_idx ON kanban_cards(client_id, card_status_id);
