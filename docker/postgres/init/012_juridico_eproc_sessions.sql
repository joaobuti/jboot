\set ON_ERROR_STOP on
\connect jboot_juridico_advocacia_dev

CREATE TABLE IF NOT EXISTS juridico_eproc_sessions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       uuid        NOT NULL,
    phase           text        NOT NULL DEFAULT 'pending',
    -- phases: pending | waiting_2fa | waiting_profile | saving | completed | failed
    available_profiles  jsonb,
    totp_code       text,
    selected_profile    text,
    session_state_enc   bytea,
    encryption_key_ref  text    NOT NULL DEFAULT 'hmac-v1',
    error_message   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eproc_sessions_client
    ON juridico_eproc_sessions (client_id, created_at DESC);
