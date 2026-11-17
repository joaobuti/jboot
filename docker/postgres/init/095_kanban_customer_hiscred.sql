\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- HISCON conserva o tipo extrato_beneficio e suas versoes existentes.
-- HISCRED usa o mesmo fluxo de upload, validacao e sincronismo dos demais tipos.
BEGIN;
ALTER TABLE kanban_customer_documents
  DROP CONSTRAINT IF EXISTS kanban_customer_documents_document_type_check;
ALTER TABLE kanban_customer_documents
  ADD CONSTRAINT kanban_customer_documents_document_type_check CHECK (document_type IN (
    'identidade', 'cpf', 'comprovante_residencia', 'declaracao_residencia_terceiro',
    'extrato_beneficio', 'hiscred'
  ));
COMMIT;
