\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Validacao da ficha do cliente por agente Claude (ADR 017, S2).
-- Destino central: o agente de validacao da empresa executa em nome da identidade
-- central (dona do agente), qualquer que seja o funcionario que clicou.
CREATE TABLE IF NOT EXISTS kanban_customer_validation_settings (
  client_id uuid PRIMARY KEY,
  agent_id uuid NOT NULL,
  executor_identity_id uuid NOT NULL,
  updated_by_identity_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Cada clique em "Validar dados" e um run. O parecer do agente e dado nao
-- confiavel: so a confirmacao humana (confirmed_*) valida o cliente.
CREATE TABLE IF NOT EXISTS kanban_customer_validation_runs (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  executor_identity_id uuid NOT NULL,
  requested_by_identity_id uuid NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('dispatching', 'dispatched', 'answered', 'failed', 'expired')),
  -- Versoes exatas enviadas ao agente: [{type, documentId, version}].
  documents_snapshot jsonb NOT NULL,
  residence_proof_third_party boolean NOT NULL,
  verdict varchar(16) NULL CHECK (verdict IN ('aprovado', 'pendencias')),
  findings jsonb NULL,
  summary text NULL CHECK (summary IS NULL OR length(summary) <= 4000),
  external_session_url text NULL,
  gateway_execution_id uuid NULL,
  error_code varchar(80) NULL,
  answered_at timestamptz NULL,
  confirmed_by_identity_id uuid NULL,
  confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status = 'answered') = (verdict IS NOT NULL AND answered_at IS NOT NULL)),
  CHECK (confirmed_at IS NULL OR status = 'answered'),
  CHECK ((confirmed_at IS NULL) = (confirmed_by_identity_id IS NULL))
);

-- Um run em andamento por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS kanban_customer_validation_runs_active_uidx
  ON kanban_customer_validation_runs (client_id, customer_id)
  WHERE status IN ('dispatching', 'dispatched');

CREATE INDEX IF NOT EXISTS kanban_customer_validation_runs_customer_idx
  ON kanban_customer_validation_runs (client_id, customer_id, created_at DESC);

-- Leitura de documentos pessoais pelo Claude exige aceite especifico do gestor,
-- separado do aceite geral do conector (ADR 017, decisao 7).
ALTER TABLE kanban_claude_connector_settings
  ADD COLUMN IF NOT EXISTS allow_customer_documents boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_documents_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS customer_documents_accepted_by_identity_id uuid NULL;

ALTER TABLE kanban_claude_connector_settings
  DROP CONSTRAINT IF EXISTS kanban_claude_connector_settings_customer_documents_accept;
ALTER TABLE kanban_claude_connector_settings
  ADD CONSTRAINT kanban_claude_connector_settings_customer_documents_accept
  CHECK (NOT allow_customer_documents OR customer_documents_accepted_at IS NOT NULL);
