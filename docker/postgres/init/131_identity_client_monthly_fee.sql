\set ON_ERROR_STOP on
\connect jboot_identity

-- Mensalidade do contratante no cadastro do cliente (decisao humana de 2026-11-09): um valor por
-- cliente, em reais, informativo. Nao emite cobranca nem bloqueia o cliente; a cobranca comercial
-- fica para o escopo de pagamentos (docs/product/payments-sprints.md). Substitui, na tela, o campo
-- "Plano" (`client_applications.plan_code`), que nunca teve consumidor; a coluna antiga fica.
--
-- Idempotente. So roda sozinho em volume novo; em base existente aplicar a mao.
BEGIN;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(12, 2);

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_monthly_fee_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_monthly_fee_check CHECK (monthly_fee IS NULL OR monthly_fee >= 0);

COMMIT;
