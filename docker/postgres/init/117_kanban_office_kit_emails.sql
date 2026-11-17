\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- E-mail do kit ao cliente (docs/product/flow-signed-kit-sprints.md, S4):
-- - `kanban_office_kit_email_settings`: por escritorio, liga/desliga o envio automatico e guarda assunto e texto
--   (com [[NOME]] e [[ESCRITORIO]]);
-- - `kanban_office_kit_emails`: um envio por kit gerado, com destinatario, assunto e texto ja montados no momento
--   da geracao (o que sai e o que foi configurado entao); o kit vai anexo; novas tentativas com espera crescente.
--
-- Migration aditiva e idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS kanban_office_kit_email_settings (
    client_id uuid NOT NULL,
    office_id uuid NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    subject varchar(200) NOT NULL CHECK (btrim(subject) <> ''),
    body text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 4000),
    updated_by_identity_id uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (client_id, office_id),
    CONSTRAINT kanban_office_kit_email_settings_office_fk FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id)
);

CREATE TABLE IF NOT EXISTS kanban_office_kit_emails (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    kit_id uuid NOT NULL REFERENCES kanban_customer_office_kits (id),
    to_email varchar(254) NOT NULL CHECK (to_email ~ '^[^@\s]+@[^@\s]+$'),
    subject varchar(200) NOT NULL,
    body text NOT NULL,
    status varchar(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NULL DEFAULT clock_timestamp(),
    lease_until timestamptz NULL,
    last_error varchar(80) NULL,
    sent_at timestamptz NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT kanban_office_kit_emails_kit_key UNIQUE (client_id, kit_id),
    CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS kanban_office_kit_emails_due_idx
    ON kanban_office_kit_emails (client_id, next_attempt_at) WHERE status IN ('pending', 'sending');

COMMIT;
