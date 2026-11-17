\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Kit assinado e Validador de assinatura (docs/product/flow-signed-kit-sprints.md, S2):
-- - `kanban_customer_signed_kits`: versoes do kit assinado devolvido pelo cliente, ligadas ao kit de origem;
--   o original continua em `kanban_customer_office_kits`; so uma versao atual por kit;
-- - `kanban_signed_kit_validation_settings`: agente de rotina do Validador de assinatura, da conta principal
--   (`office_id` nulo) ou do escritorio do kit; quem salva vira a identidade executora;
-- - `kanban_signed_kit_validations`: execucoes do validador (parecer da IA + confirmacao humana), como a
--   validacao de cadastro; uma em andamento por kit assinado;
-- - requisito de entrada `signed_kit` e `kanban_document_syncs.source_type` `signed_kit` (Drive).
--
-- Migration aditiva e idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS kanban_customer_signed_kits (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    kit_id uuid NOT NULL REFERENCES kanban_customer_office_kits (id),
    version integer NOT NULL CHECK (version > 0),
    file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
    content_type text NOT NULL CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
    size_bytes integer NOT NULL CHECK (size_bytes > 0),
    sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    storage_key text NOT NULL,
    uploaded_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    superseded_at timestamptz NULL,
    CONSTRAINT kanban_customer_signed_kits_version_key UNIQUE (client_id, kit_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_customer_signed_kits_current_uidx
    ON kanban_customer_signed_kits (client_id, kit_id) WHERE superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS kanban_signed_kit_validation_settings (
    client_id uuid NOT NULL,
    office_id uuid NULL,
    agent_id uuid NOT NULL,
    executor_identity_id uuid NOT NULL,
    updated_by_identity_id uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT kanban_signed_kit_validation_settings_office_fk
        FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_signed_kit_validation_settings_uidx
    ON kanban_signed_kit_validation_settings (client_id, COALESCE(office_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS kanban_signed_kit_validations (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    kit_id uuid NOT NULL REFERENCES kanban_customer_office_kits (id),
    signed_kit_id uuid NOT NULL REFERENCES kanban_customer_signed_kits (id),
    agent_id uuid NOT NULL,
    executor_identity_id uuid NOT NULL,
    requested_by_identity_id uuid NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('dispatching', 'dispatched', 'answered', 'failed', 'expired')),
    error_code varchar(80) NULL,
    gateway_execution_id uuid NULL,
    external_session_url text NULL,
    dispatched_at timestamptz NULL,
    picked_up_at timestamptz NULL,
    verdict varchar(16) NULL CHECK (verdict IS NULL OR verdict IN ('aprovado', 'pendencias')),
    summary text NULL CHECK (summary IS NULL OR length(summary) <= 4000),
    findings jsonb NULL CHECK (findings IS NULL OR (jsonb_typeof(findings) = 'array' AND pg_column_size(findings) <= 65536)),
    answered_at timestamptz NULL,
    confirmed_at timestamptz NULL,
    confirmed_by_identity_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((status = 'answered') = (verdict IS NOT NULL AND answered_at IS NOT NULL AND summary IS NOT NULL)),
    CHECK (confirmed_at IS NULL OR status = 'answered'),
    CHECK ((confirmed_at IS NULL) = (confirmed_by_identity_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_signed_kit_validations_active_uidx
    ON kanban_signed_kit_validations (client_id, signed_kit_id) WHERE status IN ('dispatching', 'dispatched');
CREATE INDEX IF NOT EXISTS kanban_signed_kit_validations_kit_idx
    ON kanban_signed_kit_validations (client_id, kit_id, created_at DESC);

ALTER TABLE kanban_document_syncs DROP CONSTRAINT IF EXISTS kanban_document_syncs_source_type_check;
ALTER TABLE kanban_document_syncs
    ADD CONSTRAINT kanban_document_syncs_source_type_check
    CHECK (source_type IN ('generated_document', 'customer_document', 'office_kit', 'card_extra_document', 'signed_kit')
           AND (source_type IN ('generated_document', 'card_extra_document') OR customer_id IS NOT NULL));

COMMIT;
