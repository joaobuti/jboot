\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

CREATE TABLE IF NOT EXISTS kanban_user_provisioning_commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    actor_identity_id uuid NOT NULL,
    idempotency_key varchar(160) NOT NULL,
    request_sha256 char(64) NOT NULL,
    state varchar(20) NOT NULL CHECK (state IN ('processing', 'completed', 'failed')),
    identity_id uuid NULL,
    office_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
    error_code varchar(80) NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, actor_identity_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS kanban_user_provisioning_state_idx
    ON kanban_user_provisioning_commands (state, updated_at)
    WHERE state <> 'completed';
