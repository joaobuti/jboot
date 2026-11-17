\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Flow Juridico foundation (ADR 015): visibilidade persistente de clientes
-- por escritorio e comando idempotente cliente -> card. O cadastro mestre
-- continua em jboot_pdv; estas tabelas guardam apenas IDs do dominio externo.
CREATE TABLE IF NOT EXISTS kanban_customer_offices (
    client_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    office_id uuid NOT NULL,
    source varchar(24) NOT NULL CHECK (source IN ('flow_customer', 'card', 'admin', 'migration')),
    linked_at timestamptz NOT NULL DEFAULT now(),
    linked_by_identity_id uuid NULL,
    unlinked_at timestamptz NULL,
    unlinked_by_identity_id uuid NULL,
    unlink_reason text NULL,
    PRIMARY KEY (client_id, customer_id, office_id, linked_at),
    CONSTRAINT kanban_customer_offices_office_fkey
        FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id),
    CONSTRAINT kanban_customer_offices_unlink_check CHECK (
        (unlinked_at IS NULL AND unlinked_by_identity_id IS NULL AND unlink_reason IS NULL)
        OR (unlinked_at IS NOT NULL AND unlinked_by_identity_id IS NOT NULL
            AND unlink_reason IS NOT NULL AND btrim(unlink_reason) <> '')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_customer_offices_active_idx
    ON kanban_customer_offices (client_id, customer_id, office_id)
    WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS kanban_customer_offices_visibility_idx
    ON kanban_customer_offices (client_id, office_id, customer_id)
    WHERE unlinked_at IS NULL;

CREATE TABLE IF NOT EXISTS kanban_customer_card_commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    idempotency_key varchar(128) NOT NULL,
    customer_id uuid NOT NULL,
    board_id uuid NOT NULL,
    column_id uuid NOT NULL,
    office_id uuid NOT NULL,
    card_id uuid NULL,
    request_hash char(64) NOT NULL,
    status varchar(24) NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
    error_code varchar(80) NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz NULL,
    UNIQUE (client_id, created_by_identity_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS kanban_customer_card_commands_customer_idx
    ON kanban_customer_card_commands (client_id, customer_id, created_at DESC);
