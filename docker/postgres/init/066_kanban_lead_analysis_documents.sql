\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Flow CRM de leads, Sprint 6 (docs/product/flow-crm-leads-sprints.md; gate
-- docs/product/flow-crm-leads-sprint-4-9-gate.md; ADR 014, Decisoes 1, 2 e 4):
-- classificacao manual do caso pelo gestor, documento gerado a partir do modelo,
-- revisao (aprovar ou substituir por versao editada) e PDF do aprovado.
--
-- - `kanban_lead_cases`: caso do lead decidido pelo gestor (P3: N casos por
--   lead), sempre de UM ciclo de envio (`submission_id`). Troca e remocao nunca
--   apagam: a linha recebe `superseded_*` (autor, data, motivo) e a troca cria
--   um caso novo que aponta para o anterior (`replaces_case_id`). `source`
--   reserva `ai` para a S8.
-- - `kanban_card_generated_documents`: documento do caso, versionado por caso
--   (`version`). Origem `generated` (preenchido do modelo) ou `uploaded_edit`
--   (versao editada enviada pelo gestor, ja aprovada). Aponta por FK para a
--   versao do modelo, guarda o `sha256` do modelo lido na geracao
--   (`template_sha256`) e `filled_variables` (valor, origem e marca obrigatoria
--   de cada variavel, R7; dado pessoal que fica no banco do tenant e nunca vai
--   para log, evento ou auditoria). Estado `rascunho` -> `aprovado` |
--   `substituido`. Objeto em `{client_id}/{card_id}/generated/{id}.docx`
--   (e `.pdf`), sem nome de arquivo na chave, nunca sobrescrito.
-- - PDF (ADR 014, Decisao 2): a linha do documento aprovado E o registro de
--   outbox (`pdf_status = 'pending'` gravado na mesma transacao da aprovacao);
--   `pdf_attempts`, `pdf_error_code`, `pdf_lease_until` (claim do worker) e o
--   resultado (`pdf_storage_key`, `pdf_sha256`, `pdf_size_bytes`). Falha de
--   conversao nunca desfaz a aprovacao (`failed` = "PDF pendente").
--
-- Chaves compostas `(client_id, id)` amarram caso, ciclo, tipo de caso, versao
-- do modelo e documento ao MESMO tenant. Migration aditiva e idempotente: so
-- cria objetos ausentes; nao altera nem remove dado existente.

CREATE TABLE IF NOT EXISTS kanban_lead_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards (id),
    submission_id uuid NOT NULL,
    case_type_id uuid NOT NULL,
    source varchar(16) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
    decided_by_identity_id uuid NOT NULL,
    decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    replaces_case_id uuid NULL,
    superseded_at timestamptz NULL,
    superseded_by_identity_id uuid NULL,
    superseded_reason varchar(500) NULL,
    CONSTRAINT kanban_lead_cases_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_lead_cases_submission_fkey
        FOREIGN KEY (client_id, submission_id) REFERENCES kanban_lead_submissions (client_id, id),
    CONSTRAINT kanban_lead_cases_case_type_fkey
        FOREIGN KEY (client_id, case_type_id) REFERENCES kanban_case_types (client_id, id),
    CONSTRAINT kanban_lead_cases_replaces_fkey
        FOREIGN KEY (client_id, replaces_case_id) REFERENCES kanban_lead_cases (client_id, id),
    -- Troca/remocao auditada: autor, data e motivo juntos (ou nenhum).
    CONSTRAINT kanban_lead_cases_superseded_check CHECK (
        (superseded_at IS NULL AND superseded_by_identity_id IS NULL AND superseded_reason IS NULL)
        OR (superseded_at IS NOT NULL AND superseded_by_identity_id IS NOT NULL AND btrim(superseded_reason) <> '')
    )
);

CREATE INDEX IF NOT EXISTS kanban_lead_cases_card_idx
    ON kanban_lead_cases (client_id, card_id, submission_id, decided_at);

CREATE TABLE IF NOT EXISTS kanban_card_generated_documents (
    id uuid PRIMARY KEY,
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards (id),
    submission_id uuid NOT NULL,
    lead_case_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    origin varchar(20) NOT NULL CHECK (origin IN ('generated', 'uploaded_edit')),
    based_on_document_id uuid NULL,
    template_id uuid NOT NULL,
    template_version_id uuid NOT NULL,
    template_sha256 char(64) NOT NULL CHECK (template_sha256 ~ '^[0-9a-f]{64}$'),
    catalog_version integer NOT NULL CHECK (catalog_version > 0),
    status varchar(16) NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovado', 'substituido')),
    storage_bucket varchar(120) NOT NULL,
    storage_key varchar(400) NOT NULL,
    sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    size_bytes bigint NOT NULL CHECK (size_bytes > 0),
    filled_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
    ai_run_id uuid NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    approved_by_identity_id uuid NULL,
    approved_at timestamptz NULL,
    status_changed_by_identity_id uuid NULL,
    status_changed_at timestamptz NULL,
    pdf_status varchar(16) NULL CHECK (pdf_status IN ('pending', 'done', 'failed')),
    pdf_requested_at timestamptz NULL,
    pdf_attempts integer NOT NULL DEFAULT 0 CHECK (pdf_attempts >= 0),
    pdf_lease_until timestamptz NULL,
    pdf_error_code varchar(64) NULL,
    pdf_storage_key varchar(400) NULL,
    pdf_sha256 char(64) NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
    pdf_size_bytes bigint NULL CHECK (pdf_size_bytes > 0),
    pdf_completed_at timestamptz NULL,
    CONSTRAINT kanban_card_generated_documents_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_card_generated_documents_version_key UNIQUE (client_id, lead_case_id, version),
    CONSTRAINT kanban_card_generated_documents_storage_key_key UNIQUE (storage_key),
    CONSTRAINT kanban_card_generated_documents_submission_fkey
        FOREIGN KEY (client_id, submission_id) REFERENCES kanban_lead_submissions (client_id, id),
    CONSTRAINT kanban_card_generated_documents_case_fkey
        FOREIGN KEY (client_id, lead_case_id) REFERENCES kanban_lead_cases (client_id, id),
    CONSTRAINT kanban_card_generated_documents_template_fkey
        FOREIGN KEY (client_id, template_id) REFERENCES kanban_document_templates (client_id, id),
    CONSTRAINT kanban_card_generated_documents_template_version_fkey
        FOREIGN KEY (client_id, template_version_id) REFERENCES kanban_document_template_versions (client_id, id),
    CONSTRAINT kanban_card_generated_documents_based_on_fkey
        FOREIGN KEY (client_id, based_on_document_id) REFERENCES kanban_card_generated_documents (client_id, id),
    -- Chave sempre no prefixo do tenant e do card, terminando no id do documento (sem nome de arquivo).
    CONSTRAINT kanban_card_generated_documents_storage_key_check
        CHECK (storage_key = client_id::text || '/' || card_id::text || '/generated/' || id::text || '.docx'),
    CONSTRAINT kanban_card_generated_documents_pdf_key_check
        CHECK (pdf_storage_key IS NULL
               OR pdf_storage_key = client_id::text || '/' || card_id::text || '/generated/' || id::text || '.pdf'),
    -- Versao editada sempre parte de um documento anterior do mesmo caso.
    CONSTRAINT kanban_card_generated_documents_edit_base_check
        CHECK ((origin = 'generated' AND based_on_document_id IS NULL)
               OR (origin = 'uploaded_edit' AND based_on_document_id IS NOT NULL)),
    -- Aprovacao: autor e data juntos; documento ja aprovado guarda o aprovador mesmo depois de substituido.
    CONSTRAINT kanban_card_generated_documents_approval_check
        CHECK ((approved_at IS NULL AND approved_by_identity_id IS NULL)
               OR (approved_at IS NOT NULL AND approved_by_identity_id IS NOT NULL)),
    CONSTRAINT kanban_card_generated_documents_approved_status_check
        CHECK (status <> 'aprovado' OR approved_at IS NOT NULL),
    -- Rascunho nunca tem PDF (o PDF e so do aprovado, ADR 014).
    CONSTRAINT kanban_card_generated_documents_pdf_state_check
        CHECK ((approved_at IS NULL AND pdf_status IS NULL) OR (approved_at IS NOT NULL AND pdf_status IS NOT NULL)),
    CONSTRAINT kanban_card_generated_documents_pdf_done_check
        CHECK (pdf_status IS DISTINCT FROM 'done'
               OR (pdf_storage_key IS NOT NULL AND pdf_sha256 IS NOT NULL AND pdf_completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS kanban_card_generated_documents_case_idx
    ON kanban_card_generated_documents (client_id, card_id, lead_case_id, version DESC);

-- Varredura do relay do PDF (aprovados ainda pendentes).
CREATE INDEX IF NOT EXISTS kanban_card_generated_documents_pdf_pending_idx
    ON kanban_card_generated_documents (client_id, pdf_requested_at)
    WHERE pdf_status = 'pending';

-- Arquivo do documento e versao do modelo nunca mudam depois de gravados; o
-- documento nunca e apagado (substituir = linha nova).
CREATE OR REPLACE FUNCTION kanban_generated_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'kanban_card_generated_documents rows cannot be deleted'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.card_id IS DISTINCT FROM OLD.card_id
       OR NEW.submission_id IS DISTINCT FROM OLD.submission_id
       OR NEW.lead_case_id IS DISTINCT FROM OLD.lead_case_id
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.origin IS DISTINCT FROM OLD.origin
       OR NEW.based_on_document_id IS DISTINCT FROM OLD.based_on_document_id
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.template_version_id IS DISTINCT FROM OLD.template_version_id
       OR NEW.template_sha256 IS DISTINCT FROM OLD.template_sha256
       OR NEW.catalog_version IS DISTINCT FROM OLD.catalog_version
       OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
       OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
       OR NEW.sha256 IS DISTINCT FROM OLD.sha256
       OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
       OR NEW.filled_variables IS DISTINCT FROM OLD.filled_variables
       OR NEW.created_by_identity_id IS DISTINCT FROM OLD.created_by_identity_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (OLD.pdf_storage_key IS NOT NULL AND NEW.pdf_storage_key IS DISTINCT FROM OLD.pdf_storage_key)
       OR (OLD.pdf_sha256 IS NOT NULL AND NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256) THEN
        RAISE EXCEPTION 'generated document file and origin are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'kanban_generated_documents_guard_trg'
    ) THEN
        CREATE TRIGGER kanban_generated_documents_guard_trg
            BEFORE UPDATE OR DELETE ON kanban_card_generated_documents
            FOR EACH ROW EXECUTE FUNCTION kanban_generated_documents_guard();
    END IF;
END $$;
