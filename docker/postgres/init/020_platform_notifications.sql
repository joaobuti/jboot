\set ON_ERROR_STOP on
\connect jboot_identity

CREATE TABLE IF NOT EXISTS platform_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    application_slug text NOT NULL,
    module_slug text NULL,
    recipient_identity_id uuid NOT NULL,
    actor_identity_id uuid NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text NULL,
    entity_type text NULL,
    entity_id text NULL,
    action_url text NULL,
    severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'danger')),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    read_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_notifications_recipient_idx
    ON platform_notifications (client_id, recipient_identity_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_notifications_app_idx
    ON platform_notifications (client_id, application_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_notifications_module_idx
    ON platform_notifications (client_id, module_slug, created_at DESC)
    WHERE module_slug IS NOT NULL;
