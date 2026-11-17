\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 4: atribuicao multipla de card (CardAssignee), historico cronologico
-- unico (CardActivity, estilo Azure Boards) e anexos vinculados a um registro
-- do historico (CardAttachment). Ver docs/product/kanban-sprint-4-gate.md e
-- docs/data/kanban-sprint-4-data-model.md.

CREATE TABLE IF NOT EXISTS kanban_card_assignees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards(id),
    identity_id uuid NOT NULL,
    assigned_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, card_id, identity_id)
);

CREATE TABLE IF NOT EXISTS kanban_card_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards(id),
    type varchar(24) NOT NULL CHECK (type IN ('comment', 'system_event')),
    author_identity_id uuid NOT NULL,
    text_content text NULL,
    event_payload jsonb NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (type <> 'comment' OR text_content IS NOT NULL),
    CHECK (type <> 'system_event' OR event_payload IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS kanban_card_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    activity_id uuid NOT NULL REFERENCES kanban_card_activities(id),
    file_name varchar(255) NOT NULL,
    content_type varchar(120) NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
    storage_bucket varchar(120) NOT NULL,
    storage_key varchar(500) NOT NULL,
    uploaded_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, storage_bucket, storage_key)
);

CREATE INDEX IF NOT EXISTS kanban_card_assignees_client_card_identity_idx
    ON kanban_card_assignees(client_id, card_id, identity_id);

CREATE INDEX IF NOT EXISTS kanban_card_assignees_client_identity_idx
    ON kanban_card_assignees(client_id, identity_id);

CREATE INDEX IF NOT EXISTS kanban_card_activities_client_card_created_idx
    ON kanban_card_activities(client_id, card_id, created_at);

CREATE INDEX IF NOT EXISTS kanban_card_attachments_client_activity_idx
    ON kanban_card_attachments(client_id, activity_id);
