\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Replica Drive dos documentos da ficha do cliente (ADR 017, S3).
-- Origem nova `customer_document` ao lado da peticao aprovada (`generated_document`).
-- O Drive e por empresa (ADR 016); a pasta passa a ser <raiz>/<CPF so digitos>/.
ALTER TABLE kanban_document_syncs
  ADD COLUMN IF NOT EXISTS source_type varchar(32) NOT NULL DEFAULT 'generated_document',
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL;

ALTER TABLE kanban_document_syncs DROP CONSTRAINT IF EXISTS kanban_document_syncs_source_type_check;
ALTER TABLE kanban_document_syncs
  ADD CONSTRAINT kanban_document_syncs_source_type_check
  CHECK (source_type IN ('generated_document', 'customer_document')
         AND (source_type = 'generated_document' OR customer_id IS NOT NULL));
