\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Flow CRM de leads, Sprint 5 (docs/product/flow-crm-leads-sprints.md;
-- ADR 014, Decisoes 1 e 4): tipos de caso e modelos de documento `.docx`
-- versionados, configuracao do tenant (somente `flow:admin`).
--
-- - `kanban_document_templates`: modelo do tenant (nome, descricao, ativo).
--   Nunca e apagado, so inativado. `current_version_id` = ultima versao
--   enviada; a geracao (S6) so usa a versao atual quando ela e `valid`.
-- - `kanban_document_template_versions`: versao IMUTAVEL (trigger recusa
--   UPDATE e DELETE). Objeto em `{client_id}/templates/{template_id}/{id}.docx`
--   no bucket do modulo (sem nome de arquivo na chave; nome original so aqui),
--   com `sha256` do arquivo enviado, versao do catalogo de variaveis contra a
--   qual foi validada, status (`valid` | `invalid_variables`) e relatorio de
--   validacao sem dado de cliente (so nomes de tag e avisos do modelo).
-- - `kanban_template_version_variables`: variaveis detectadas na versao. Chave,
--   `known` e `value_type` sao imutaveis; so `required` (obrigatoria/opcional,
--   default obrigatoria) e alteravel pelo administrador, com autor e data.
-- - `kanban_case_types`: tipo de caso do tenant (nome unico entre ativos,
--   descricao, criterios de classificacao em texto, evidencias esperadas,
--   modelo padrao, ativo). Nunca e apagado, so inativado.
-- - `kanban_case_type_templates`: modelos vinculados ao tipo de caso (N:N). O
--   modelo padrao precisa estar entre os vinculados (FK composta adiavel).
--
-- Chaves compostas `(client_id, id)` amarram tudo ao MESMO tenant.
-- Migration aditiva e idempotente: so cria objetos ausentes; nao altera nem
-- remove dado existente.

CREATE TABLE IF NOT EXISTS kanban_document_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    name varchar(160) NOT NULL CHECK (btrim(name) <> ''),
    description varchar(2000) NULL,
    active boolean NOT NULL DEFAULT true,
    current_version_id uuid NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_by_identity_id uuid NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kanban_document_templates_client_id_id_key UNIQUE (client_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_document_templates_active_name_idx
    ON kanban_document_templates (client_id, lower(btrim(name)))
    WHERE active;

CREATE TABLE IF NOT EXISTS kanban_document_template_versions (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL,
    template_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    storage_bucket varchar(120) NOT NULL,
    storage_key varchar(400) NOT NULL,
    file_name varchar(255) NOT NULL,
    content_type varchar(160) NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes > 0),
    sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    catalog_version integer NOT NULL CHECK (catalog_version > 0),
    validation_status varchar(30) NOT NULL CHECK (validation_status IN ('valid', 'invalid_variables')),
    validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
    uploaded_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kanban_document_template_versions_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_document_template_versions_number_key UNIQUE (client_id, template_id, version),
    CONSTRAINT kanban_document_template_versions_storage_key_key UNIQUE (storage_key),
    CONSTRAINT kanban_document_template_versions_template_fkey
        FOREIGN KEY (client_id, template_id) REFERENCES kanban_document_templates (client_id, id),
    -- Chave sempre no prefixo do tenant e do modelo, terminando no id da versao (sem nome de arquivo).
    CONSTRAINT kanban_document_template_versions_storage_key_check
        CHECK (storage_key = client_id::text || '/templates/' || template_id::text || '/' || id::text || '.docx')
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kanban_document_templates_current_version_fkey'
    ) THEN
        ALTER TABLE kanban_document_templates
            ADD CONSTRAINT kanban_document_templates_current_version_fkey
            FOREIGN KEY (client_id, current_version_id)
            REFERENCES kanban_document_template_versions (client_id, id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS kanban_template_version_variables (
    client_id uuid NOT NULL,
    version_id uuid NOT NULL,
    variable_key varchar(200) NOT NULL CHECK (btrim(variable_key) <> ''),
    known boolean NOT NULL,
    -- Tipo no catalogo; NULO para variavel desconhecida.
    value_type varchar(20) NULL CHECK (value_type IN ('text', 'boolean', 'collection')),
    required boolean NOT NULL DEFAULT true,
    required_updated_by_identity_id uuid NULL,
    required_updated_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, version_id, variable_key),
    CONSTRAINT kanban_template_version_variables_version_fkey
        FOREIGN KEY (client_id, version_id) REFERENCES kanban_document_template_versions (client_id, id),
    CONSTRAINT kanban_template_version_variables_known_type_check
        CHECK ((known AND value_type IS NOT NULL) OR (NOT known AND value_type IS NULL))
);

-- Imutabilidade (ADR 014, Decisao 4): versao nunca muda nem some; da variavel
-- so `required` (e quem/quando alterou) pode mudar.
CREATE OR REPLACE FUNCTION kanban_template_versions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'kanban_document_template_versions is immutable (% blocked)', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION kanban_template_variables_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'kanban_template_version_variables rows cannot be deleted'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.version_id IS DISTINCT FROM OLD.version_id
       OR NEW.variable_key IS DISTINCT FROM OLD.variable_key
       OR NEW.known IS DISTINCT FROM OLD.known
       OR NEW.value_type IS DISTINCT FROM OLD.value_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'only "required" of kanban_template_version_variables can change'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'kanban_template_versions_immutable_trg'
    ) THEN
        CREATE TRIGGER kanban_template_versions_immutable_trg
            BEFORE UPDATE OR DELETE ON kanban_document_template_versions
            FOR EACH ROW EXECUTE FUNCTION kanban_template_versions_immutable();
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'kanban_template_variables_guard_trg'
    ) THEN
        CREATE TRIGGER kanban_template_variables_guard_trg
            BEFORE UPDATE OR DELETE ON kanban_template_version_variables
            FOR EACH ROW EXECUTE FUNCTION kanban_template_variables_guard();
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS kanban_case_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    name varchar(160) NOT NULL CHECK (btrim(name) <> ''),
    description varchar(2000) NULL,
    classification_criteria varchar(8000) NULL,
    expected_evidence varchar(4000) NULL,
    default_template_id uuid NULL,
    active boolean NOT NULL DEFAULT true,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_by_identity_id uuid NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kanban_case_types_client_id_id_key UNIQUE (client_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_case_types_active_name_idx
    ON kanban_case_types (client_id, lower(btrim(name)))
    WHERE active;

CREATE TABLE IF NOT EXISTS kanban_case_type_templates (
    client_id uuid NOT NULL,
    case_type_id uuid NOT NULL,
    template_id uuid NOT NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, case_type_id, template_id),
    CONSTRAINT kanban_case_type_templates_case_type_fkey
        FOREIGN KEY (client_id, case_type_id) REFERENCES kanban_case_types (client_id, id),
    CONSTRAINT kanban_case_type_templates_template_fkey
        FOREIGN KEY (client_id, template_id) REFERENCES kanban_document_templates (client_id, id)
);

CREATE INDEX IF NOT EXISTS kanban_case_type_templates_template_idx
    ON kanban_case_type_templates (client_id, template_id);

-- Modelo padrao sempre entre os vinculados; adiavel para trocar vinculos e
-- padrao na mesma transacao.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kanban_case_types_default_template_fkey'
    ) THEN
        ALTER TABLE kanban_case_types
            ADD CONSTRAINT kanban_case_types_default_template_fkey
            FOREIGN KEY (client_id, id, default_template_id)
            REFERENCES kanban_case_type_templates (client_id, case_type_id, template_id)
            DEFERRABLE INITIALLY DEFERRED;
    END IF;
END $$;
