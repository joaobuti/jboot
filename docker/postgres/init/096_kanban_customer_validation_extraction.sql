\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- S6 (documentos do fluxo do cliente):
-- 1. CPF dispensavel quando o RG novo ou a CNH ja trazem o numero (perfil da ficha,
--    gravado tambem no run para a validacao valer so para o perfil lido).
-- 2. Dados extraidos pela IA no parecer e os campos da ficha que estavam vazios e
--    foram preenchidos com eles (a ficha sempre prevalece).
BEGIN;
ALTER TABLE kanban_customer_document_profiles
  ADD COLUMN IF NOT EXISTS cpf_on_identity boolean NOT NULL DEFAULT false;

ALTER TABLE kanban_customer_validation_runs
  ADD COLUMN IF NOT EXISTS cpf_on_identity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extracted_data jsonb,
  ADD COLUMN IF NOT EXISTS applied_fields text[] NOT NULL DEFAULT '{}';

ALTER TABLE kanban_customer_validation_runs
  DROP CONSTRAINT IF EXISTS kanban_customer_validation_runs_extracted_data_check;
ALTER TABLE kanban_customer_validation_runs
  ADD CONSTRAINT kanban_customer_validation_runs_extracted_data_check
  CHECK (extracted_data IS NULL OR (jsonb_typeof(extracted_data) = 'object' AND pg_column_size(extracted_data) <= 8192));
COMMIT;
