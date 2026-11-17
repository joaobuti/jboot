\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Documentos da ficha do cliente no Flow (ADR 017; docs/product/flow-customer-documents-sprints.md, S1).
-- Catalogo fixo; uploads opcionais para salvar o cliente e obrigatorios para validar.
-- Cada envio e uma versao imutavel; a versao corrente e a unica sem superseded_at/removed_at.
-- O cliente vive em establishment-customers (outro banco): aqui so o ID, sem FK cruzada (ADR 015).
CREATE TABLE IF NOT EXISTS kanban_customer_documents (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  document_type varchar(40) NOT NULL CHECK (document_type IN (
    'identidade', 'cpf', 'comprovante_residencia', 'declaracao_residencia_terceiro', 'extrato_beneficio'
  )),
  version integer NOT NULL CHECK (version > 0),
  file_name varchar(255) NOT NULL,
  content_type varchar(120) NOT NULL CHECK (content_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  sha256 char(64) NOT NULL,
  storage_bucket varchar(120) NOT NULL,
  storage_key varchar(700) NOT NULL,
  uploaded_by_identity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  superseded_at timestamptz NULL,
  removed_at timestamptz NULL,
  removed_by_identity_id uuid NULL,
  UNIQUE (client_id, customer_id, document_type, version),
  UNIQUE (client_id, storage_bucket, storage_key),
  CHECK ((removed_at IS NULL) = (removed_by_identity_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_customer_documents_current_uidx
  ON kanban_customer_documents (client_id, customer_id, document_type)
  WHERE superseded_at IS NULL AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS kanban_customer_documents_customer_idx
  ON kanban_customer_documents (client_id, customer_id);

-- Marcacao feita pelo atendente: comprovante em nome de terceiro torna a
-- declaracao de residencia de terceiros obrigatoria para validar.
CREATE TABLE IF NOT EXISTS kanban_customer_document_profiles (
  client_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  residence_proof_third_party boolean NOT NULL DEFAULT false,
  updated_by_identity_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (client_id, customer_id)
);
