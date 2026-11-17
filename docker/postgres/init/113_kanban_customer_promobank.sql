\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Promobank na ficha do cliente (docs/product/flow-customer-promobank-sprints.md, P1): tipo de documento
-- `promobank`, aceito na validacao no lugar do HISCON. Amplia os CHECK do tipo do documento da ficha e da
-- politica de leitura da validacao.
--
-- Migration aditiva e idempotente.
BEGIN;

ALTER TABLE kanban_customer_documents
  DROP CONSTRAINT IF EXISTS kanban_customer_documents_document_type_check;
ALTER TABLE kanban_customer_documents
  ADD CONSTRAINT kanban_customer_documents_document_type_check CHECK (document_type IN (
    'identidade', 'cpf', 'comprovante_residencia', 'declaracao_residencia_terceiro',
    'extrato_beneficio', 'promobank', 'hiscred'
  ));

ALTER TABLE kanban_customer_validation_policies
  DROP CONSTRAINT IF EXISTS kanban_customer_validation_policies_types_check;
ALTER TABLE kanban_customer_validation_policies
  ADD CONSTRAINT kanban_customer_validation_policies_types_check CHECK (
    readable_document_types <@ ARRAY[
      'identidade', 'cpf', 'comprovante_residencia', 'declaracao_residencia_terceiro',
      'extrato_beneficio', 'promobank', 'hiscred'
    ]::text[]
  );

COMMIT;
