\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE jboot_kanban_demo_dev'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'jboot_kanban_demo_dev'
)\gexec

\connect jboot_kanban_demo_dev

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Board do tenant
CREATE TABLE IF NOT EXISTS kanban_boards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    description text,
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Coluna de um board
CREATE TABLE IF NOT EXISTS kanban_board_columns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    name varchar(160) NOT NULL,
    position integer NOT NULL,
    color varchar(24),
    wip_limit integer CHECK (wip_limit IS NULL OR wip_limit > 0),
    is_default boolean NOT NULL DEFAULT false,
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- DEFERRABLE: reordenacao desloca varias linhas na mesma transacao; checagem so no COMMIT evita colisao transitoria
    UNIQUE (client_id, board_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- Card dentro de uma coluna
CREATE TABLE IF NOT EXISTS kanban_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    board_column_id uuid NOT NULL REFERENCES kanban_board_columns(id),
    title varchar(200) NOT NULL,
    description text,
    source_module varchar(80),
    source_type varchar(120),
    source_id varchar(160),
    source_payload jsonb,
    source_url text,
    position integer NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kanban_cards_source_ref_check CHECK (
        (source_module IS NULL AND source_type IS NULL AND source_id IS NULL)
        OR (source_module IS NOT NULL AND source_type IS NOT NULL AND source_id IS NOT NULL)
    ),
    UNIQUE (client_id, board_column_id, position) DEFERRABLE INITIALLY DEFERRED
);

-- Papel de uma identidade dentro de um board especifico
CREATE TABLE IF NOT EXISTS kanban_board_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    identity_id uuid NOT NULL,
    role varchar(40) NOT NULL CHECK (role IN ('board_admin', 'board_member')),
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, board_id, identity_id)
);

-- Audit log de mutacoes administrativas (estrutura do board)
CREATE TABLE IF NOT EXISTS kanban_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    identity_id uuid,
    event_type text NOT NULL,
    board_id uuid,
    payload jsonb NOT NULL DEFAULT '{}',
    ip text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS kanban_boards_client_status_name_idx ON kanban_boards(client_id, status, name);
CREATE INDEX IF NOT EXISTS kanban_audit_events_client_created_idx ON kanban_audit_events(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kanban_board_columns_client_board_position_idx ON kanban_board_columns(client_id, board_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS kanban_board_columns_default_idx ON kanban_board_columns(client_id, board_id) WHERE is_default = true AND status = 'active';
CREATE INDEX IF NOT EXISTS kanban_cards_client_board_column_position_idx ON kanban_cards(client_id, board_id, board_column_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS kanban_cards_source_active_idx ON kanban_cards(client_id, board_id, source_module, source_type, source_id)
    WHERE source_module IS NOT NULL AND status <> 'archived';
CREATE INDEX IF NOT EXISTS kanban_board_members_client_board_identity_idx ON kanban_board_members(client_id, board_id, identity_id);
CREATE INDEX IF NOT EXISTS kanban_board_members_client_identity_status_idx ON kanban_board_members(client_id, identity_id, status);
