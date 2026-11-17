\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 2 do contrato de servicos por escritorio (ADR 019):
-- 1. Documentos que a rotina de validacao pode ler, por empresa (null = todos).
-- 2. Na validacao: documentos liberados no pedido, escritorio/versao do modelo do kit,
--    valores das tags devolvidos pela IA, genero, termo de renuncia, pendencias gerais,
--    alertas e a revisao humana dos valores.
BEGIN;
CREATE TABLE IF NOT EXISTS kanban_customer_validation_policies (
  client_id uuid PRIMARY KEY,
  readable_document_types text[] NOT NULL,
  updated_by_identity_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT kanban_customer_validation_policies_types_check CHECK (
    readable_document_types <@ ARRAY[
      'identidade', 'cpf', 'comprovante_residencia', 'declaracao_residencia_terceiro',
      'extrato_beneficio', 'hiscred'
    ]::text[]
  )
);

ALTER TABLE kanban_customer_validation_runs
  ADD COLUMN IF NOT EXISTS readable_document_types text[],
  ADD COLUMN IF NOT EXISTS contract_office_id uuid,
  ADD COLUMN IF NOT EXISTS contract_version integer,
  ADD COLUMN IF NOT EXISTS tag_values jsonb,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS waiver_court text,
  ADD COLUMN IF NOT EXISTS general_findings jsonb,
  ADD COLUMN IF NOT EXISTS alerts jsonb,
  ADD COLUMN IF NOT EXISTS review jsonb,
  ADD COLUMN IF NOT EXISTS reviewed_by_identity_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE kanban_customer_validation_runs
  DROP CONSTRAINT IF EXISTS kanban_customer_validation_runs_kit_check;
ALTER TABLE kanban_customer_validation_runs
  ADD CONSTRAINT kanban_customer_validation_runs_kit_check CHECK (
    (gender IS NULL OR gender IN ('masculino', 'feminino'))
    AND (waiver_court IS NULL OR waiver_court IN ('jec', 'jef'))
    AND (tag_values IS NULL OR (jsonb_typeof(tag_values) = 'object' AND pg_column_size(tag_values) <= 262144))
    AND (review IS NULL OR (jsonb_typeof(review) = 'object' AND pg_column_size(review) <= 262144))
    AND (general_findings IS NULL OR jsonb_typeof(general_findings) = 'array')
    AND (alerts IS NULL OR jsonb_typeof(alerts) = 'array')
    AND ((contract_office_id IS NULL) = (contract_version IS NULL))
  );
COMMIT;
