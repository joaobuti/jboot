\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Contrato de servicos por escritorio, Sprint 3 (docs/product/flow-office-service-contract-sprints.md;
-- ADR 019, decisao 14): o modelo passa a ser o `.docx` do escritorio. Cada envio e uma versao nova
-- (`format = 'docx'`) com o arquivo no storage do Flow e a analise do arquivo (tags, marcas de genero e
-- plural, blocos, avisos). As versoes HTML do editor Quill (Sprint 1) ficam so como historico.
-- `content_sha256` passa a ser o hash do arquivo nas versoes `.docx` (mesmo arquivo nao cria versao).
--
-- Migration aditiva e idempotente.

ALTER TABLE kanban_office_service_contract_versions
    ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'html',
    ADD COLUMN IF NOT EXISTS storage_key text,
    ADD COLUMN IF NOT EXISTS file_name text,
    ADD COLUMN IF NOT EXISTS size_bytes integer,
    ADD COLUMN IF NOT EXISTS analysis jsonb;

ALTER TABLE kanban_office_service_contract_versions ALTER COLUMN content_html DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kanban_office_service_contract_versions_format_check'
                   AND conrelid = 'kanban_office_service_contract_versions'::regclass) THEN
        ALTER TABLE kanban_office_service_contract_versions
            ADD CONSTRAINT kanban_office_service_contract_versions_format_check CHECK (
                (format = 'html' AND content_html IS NOT NULL)
                OR (format = 'docx' AND content_html IS NULL AND storage_key IS NOT NULL
                    AND file_name IS NOT NULL AND size_bytes > 0 AND analysis IS NOT NULL)
            );
    END IF;
END $$;
