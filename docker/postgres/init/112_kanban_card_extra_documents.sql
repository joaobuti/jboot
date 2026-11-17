\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Documentos avulsos no card (docs/product/flow-card-extra-documents-sprints.md, D1):
-- - `kanban_card_extra_documents`: arquivo enviado fora do checklist de tipos do quadro, com descricao
--   opcional e o sha256 do arquivo (checksum da fila do Drive); remocao logica (`removed_at`): sai do bloco Documentos e do protocolo, o arquivo fica no Flow;
-- - `kanban_document_syncs.source_type` ganha `card_extra_document` (pasta do cliente do card no Drive;
--   card sem cliente usa o caminho legado) e `remove_requested_at` pede a remocao do arquivo no Drive.
--
-- Migration aditiva e idempotente.
CREATE TABLE IF NOT EXISTS kanban_card_extra_documents (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards (id),
    attachment_id uuid NOT NULL UNIQUE REFERENCES kanban_card_attachments (id),
    description varchar(200) NULL CHECK (description IS NULL OR btrim(description) <> ''),
    sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    removed_at timestamptz NULL,
    removed_by_identity_id uuid NULL,
    CHECK ((removed_at IS NULL) = (removed_by_identity_id IS NULL))
);

CREATE INDEX IF NOT EXISTS kanban_card_extra_documents_card_idx
    ON kanban_card_extra_documents (client_id, card_id, created_at)
    WHERE removed_at IS NULL;

ALTER TABLE kanban_document_syncs
    ADD COLUMN IF NOT EXISTS remove_requested_at timestamptz NULL;

ALTER TABLE kanban_document_syncs DROP CONSTRAINT IF EXISTS kanban_document_syncs_source_type_check;
ALTER TABLE kanban_document_syncs
    ADD CONSTRAINT kanban_document_syncs_source_type_check
    CHECK (source_type IN ('generated_document', 'customer_document', 'office_kit', 'card_extra_document')
           AND (source_type IN ('generated_document', 'card_extra_document') OR customer_id IS NOT NULL));
