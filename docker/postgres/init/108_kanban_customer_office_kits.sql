\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Kit do escritorio gerado na confirmacao da validacao, Sprint 4
-- (docs/product/flow-office-service-contract-sprints.md; ADR 019, decisao 19):
-- - `kanban_customer_office_kits`: um kit por validacao confirmada, com o `.docx` no storage do Flow
--   (origem do envio ao Drive; nao aparece na ficha), a versao do modelo usada e o relatorio da montagem
--   (tags sem valor, marcas nao resolvidas, avisos), sem conteudo do documento;
-- - `kanban_customer_validation_runs.kit_result`/`kit_id`: resultado da geracao, como o card de entrada;
-- - `kanban_document_syncs.source_type` ganha `office_kit` (pasta do CPF no Drive do escritorio).
--
-- Migration aditiva e idempotente.

CREATE TABLE IF NOT EXISTS kanban_customer_office_kits (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    run_id uuid NOT NULL REFERENCES kanban_customer_validation_runs (id) ON DELETE CASCADE,
    office_id uuid NOT NULL,
    contract_version integer NOT NULL CHECK (contract_version > 0),
    storage_key text NOT NULL,
    file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
    size_bytes integer NOT NULL CHECK (size_bytes > 0),
    sha256 char(64) NOT NULL,
    report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object' AND pg_column_size(report) <= 65536),
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kanban_customer_office_kits_run_key UNIQUE (client_id, run_id),
    CONSTRAINT kanban_customer_office_kits_office_fk
        FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id)
);

CREATE INDEX IF NOT EXISTS kanban_customer_office_kits_customer_idx
    ON kanban_customer_office_kits (client_id, customer_id, created_at DESC);

ALTER TABLE kanban_customer_validation_runs
    ADD COLUMN IF NOT EXISTS kit_result text,
    ADD COLUMN IF NOT EXISTS kit_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kanban_customer_validation_runs_kit_result_check'
                   AND conrelid = 'kanban_customer_validation_runs'::regclass) THEN
        ALTER TABLE kanban_customer_validation_runs
            ADD CONSTRAINT kanban_customer_validation_runs_kit_result_check CHECK (
                (kit_result IS NULL OR kit_result IN ('generated', 'not_approved', 'no_model', 'model_not_docx', 'failed'))
                AND ((kit_result = 'generated') = (kit_id IS NOT NULL))
            );
    END IF;
END $$;

ALTER TABLE kanban_document_syncs DROP CONSTRAINT IF EXISTS kanban_document_syncs_source_type_check;
ALTER TABLE kanban_document_syncs
    ADD CONSTRAINT kanban_document_syncs_source_type_check
    CHECK (source_type IN ('generated_document', 'customer_document', 'office_kit')
           AND (source_type = 'generated_document' OR customer_id IS NOT NULL));
