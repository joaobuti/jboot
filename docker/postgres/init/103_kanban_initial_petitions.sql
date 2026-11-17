\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Peticoes iniciais da rotina, modo Flow (ADR 020; docs/product/flow-initial-petitions-sprints.md, S5):
--
-- - `kanban_petition_figures`: print do HISCON recortado pelo Flow durante a execucao (PNG), usado pelo
--   bloco `figure` da peticao. Vale so para a execucao.
-- - `kanban_petition_drafts`: peticao enviada pela rotina, ainda provisoria (uma por chave por execucao;
--   reenvio substitui). Some no fechamento ou quando a execucao expira.
-- - `kanban_card_petition_runs`: uma por execucao fechada, vinculada ao card, ao cliente e a analise
--   usada; relatorio estruturado (`report`) e se gravou a conclusao sem erro (`completed`), de onde as
--   regras `ai_completed -> move_card` movem o card.
-- - `kanban_card_initial_petitions`: cada peticao registrada (JEC/JEF, banco, nome do arquivo, gerador,
--   conteudo do modo Flow).
-- - `kanban_card_initial_petition_actions`: acoes da Analise de Acoes que cada peticao cobre; uma acao
--   em no maximo uma peticao por execucao.
-- - `kanban_petition_precedents`: julgados usados (numero e link), base do banco de precedentes futuro.
-- - `kanban_card_generated_documents`: origem `routine_petition` (sem lead nem modelo; versao por
--   peticao) para herdar aprovacao, PDF e o gatilho do Drive.
--
-- Migration aditiva e idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS kanban_petition_figures (
    client_id uuid NOT NULL,
    automation_run_id uuid NOT NULL,
    figure_id varchar(60) NOT NULL CHECK (figure_id ~ '^[a-z0-9_-]{1,60}$'),
    png bytea NOT NULL CHECK (octet_length(png) BETWEEN 1 AND 8388608),
    width integer NOT NULL CHECK (width > 0),
    height integer NOT NULL CHECK (height > 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (client_id, automation_run_id, figure_id)
);

CREATE TABLE IF NOT EXISTS kanban_petition_drafts (
    client_id uuid NOT NULL,
    automation_run_id uuid NOT NULL,
    petition_key varchar(60) NOT NULL CHECK (petition_key ~ '^[a-z0-9_-]{1,60}$'),
    court varchar(3) NOT NULL CHECK (court IN ('jec', 'jef')),
    bank varchar(200) NOT NULL,
    file_name varchar(200) NOT NULL,
    action_ids uuid[] NOT NULL DEFAULT '{}',
    content jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (client_id, automation_run_id, petition_key)
);

CREATE TABLE IF NOT EXISTS kanban_card_petition_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards (id),
    customer_id uuid NOT NULL,
    automation_run_id uuid NOT NULL,
    generator varchar(4) NOT NULL CHECK (generator IN ('flow', 'ai')),
    status varchar(16) NOT NULL CHECK (status IN ('concluida', 'nao_concluida')),
    failure_reason varchar(1000) NULL,
    triage_source varchar(10) NOT NULL CHECK (triage_source IN ('analysis', 'hiscon')),
    action_analysis_id uuid NULL,
    petition_count integer NOT NULL CHECK (petition_count >= 0),
    report jsonb NOT NULL DEFAULT '{}'::jsonb,
    completed boolean NOT NULL DEFAULT false,
    submitted_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT kanban_card_petition_runs_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_card_petition_runs_run_key UNIQUE (client_id, automation_run_id),
    CONSTRAINT kanban_card_petition_runs_failure_check CHECK ((status = 'nao_concluida') = (failure_reason IS NOT NULL)),
    CONSTRAINT kanban_card_petition_runs_analysis_check CHECK ((triage_source = 'analysis') = (action_analysis_id IS NOT NULL)),
    CONSTRAINT kanban_card_petition_runs_analysis_fkey
      FOREIGN KEY (client_id, action_analysis_id) REFERENCES kanban_card_action_analyses (client_id, id)
);

-- Unificacao com a conclusao explicita da IA (flow-branch-unification.md): o movimento saiu daqui.
ALTER TABLE kanban_card_petition_runs ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
ALTER TABLE kanban_card_petition_runs DROP COLUMN IF EXISTS move_outcome;
ALTER TABLE kanban_card_petition_runs DROP COLUMN IF EXISTS move_detail;
ALTER TABLE kanban_card_petition_runs DROP COLUMN IF EXISTS target_column_id;

CREATE INDEX IF NOT EXISTS kanban_card_petition_runs_card_idx
    ON kanban_card_petition_runs (client_id, card_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kanban_card_initial_petitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards (id),
    petition_run_id uuid NOT NULL,
    petition_key varchar(60) NOT NULL,
    position integer NOT NULL CHECK (position >= 1),
    court varchar(3) NOT NULL CHECK (court IN ('jec', 'jef')),
    bank varchar(200) NOT NULL,
    file_name varchar(200) NOT NULL,
    generator varchar(4) NOT NULL CHECK (generator IN ('flow', 'ai')),
    content jsonb NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT kanban_card_initial_petitions_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_card_initial_petitions_key UNIQUE (client_id, petition_run_id, petition_key),
    CONSTRAINT kanban_card_initial_petitions_run_fkey
      FOREIGN KEY (client_id, petition_run_id) REFERENCES kanban_card_petition_runs (client_id, id),
    CONSTRAINT kanban_card_initial_petitions_content_check CHECK ((generator = 'flow') = (content IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS kanban_card_initial_petition_actions (
    client_id uuid NOT NULL,
    petition_run_id uuid NOT NULL,
    petition_id uuid NOT NULL,
    action_id uuid NOT NULL REFERENCES kanban_card_action_analysis_actions (id),
    PRIMARY KEY (client_id, petition_id, action_id),
    CONSTRAINT kanban_card_initial_petition_actions_once UNIQUE (client_id, petition_run_id, action_id),
    CONSTRAINT kanban_card_initial_petition_actions_petition_fkey
      FOREIGN KEY (client_id, petition_id) REFERENCES kanban_card_initial_petitions (client_id, id)
);

CREATE TABLE IF NOT EXISTS kanban_petition_precedents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    petition_run_id uuid NOT NULL,
    uf char(2) NOT NULL,
    process_number varchar(40) NOT NULL,
    url varchar(2000) NOT NULL,
    court varchar(200) NULL,
    theme varchar(300) NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT kanban_petition_precedents_run_fkey
      FOREIGN KEY (client_id, petition_run_id) REFERENCES kanban_card_petition_runs (client_id, id)
);

CREATE INDEX IF NOT EXISTS kanban_petition_precedents_uf_idx ON kanban_petition_precedents (client_id, uf, created_at DESC);

-- Documento gerado vindo da rotina: sem lead e sem modelo do escritorio.
ALTER TABLE kanban_card_generated_documents ADD COLUMN IF NOT EXISTS petition_id uuid NULL;
ALTER TABLE kanban_card_generated_documents ALTER COLUMN submission_id DROP NOT NULL;
ALTER TABLE kanban_card_generated_documents ALTER COLUMN lead_case_id DROP NOT NULL;
ALTER TABLE kanban_card_generated_documents ALTER COLUMN template_id DROP NOT NULL;
ALTER TABLE kanban_card_generated_documents ALTER COLUMN template_version_id DROP NOT NULL;
ALTER TABLE kanban_card_generated_documents ALTER COLUMN template_sha256 DROP NOT NULL;
ALTER TABLE kanban_card_generated_documents ALTER COLUMN catalog_version DROP NOT NULL;

ALTER TABLE kanban_card_generated_documents DROP CONSTRAINT IF EXISTS kanban_card_generated_documents_origin_check;
ALTER TABLE kanban_card_generated_documents
  ADD CONSTRAINT kanban_card_generated_documents_origin_check
  CHECK (origin IN ('generated', 'uploaded_edit', 'routine_petition'));

ALTER TABLE kanban_card_generated_documents DROP CONSTRAINT IF EXISTS kanban_card_generated_documents_edit_base_check;
ALTER TABLE kanban_card_generated_documents
  ADD CONSTRAINT kanban_card_generated_documents_edit_base_check
  CHECK ((origin IN ('generated', 'routine_petition') AND based_on_document_id IS NULL)
         OR (origin = 'uploaded_edit' AND based_on_document_id IS NOT NULL));

-- Ou e documento de lead (submissao, caso e modelo), ou e peticao da rotina (so `petition_id`).
ALTER TABLE kanban_card_generated_documents DROP CONSTRAINT IF EXISTS kanban_card_generated_documents_source_check;
ALTER TABLE kanban_card_generated_documents
  ADD CONSTRAINT kanban_card_generated_documents_source_check
  CHECK (
    (petition_id IS NULL AND submission_id IS NOT NULL AND lead_case_id IS NOT NULL AND template_id IS NOT NULL
      AND template_version_id IS NOT NULL AND template_sha256 IS NOT NULL AND catalog_version IS NOT NULL
      AND origin <> 'routine_petition')
    OR (petition_id IS NOT NULL AND submission_id IS NULL AND lead_case_id IS NULL AND template_id IS NULL
      AND template_version_id IS NULL AND template_sha256 IS NULL AND catalog_version IS NULL)
  );

ALTER TABLE kanban_card_generated_documents DROP CONSTRAINT IF EXISTS kanban_card_generated_documents_petition_fkey;
ALTER TABLE kanban_card_generated_documents
  ADD CONSTRAINT kanban_card_generated_documents_petition_fkey
  FOREIGN KEY (client_id, petition_id) REFERENCES kanban_card_initial_petitions (client_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_card_generated_documents_petition_version_idx
    ON kanban_card_generated_documents (client_id, petition_id, version)
    WHERE petition_id IS NOT NULL;

COMMIT;
