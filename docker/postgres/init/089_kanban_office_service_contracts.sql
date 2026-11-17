\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Contrato de servicos por escritorio, Sprint 1
-- (docs/product/flow-office-service-contract-sprints.md): um modelo por
-- escritorio, guardado como versoes imutaveis do HTML do editor (ja limpo no
-- servidor). A versao atual e a de maior numero. `tags` guarda as tags
-- `[[ASSIM]]` detectadas na versao, usadas pela extracao da IA (Sprint 2).
--
-- Migration aditiva e idempotente.

CREATE TABLE IF NOT EXISTS kanban_office_service_contract_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    office_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    content_html text NOT NULL CHECK (length(content_html) <= 300000),
    tags text[] NOT NULL DEFAULT '{}',
    content_sha256 char(64) NOT NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kanban_office_service_contract_versions_office_fk
        FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id),
    CONSTRAINT kanban_office_service_contract_versions_version_key
        UNIQUE (client_id, office_id, version)
);
