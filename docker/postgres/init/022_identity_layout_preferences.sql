\connect jboot_identity

CREATE TABLE IF NOT EXISTS identity_layout_preferences (
    identity_id uuid PRIMARY KEY REFERENCES identities(id),
    preference jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
