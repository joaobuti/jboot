-- =============================================================
-- 030_pdv_sale_number.sql — Sprint 2: número sequencial de venda
-- =============================================================

\connect jboot_pdv

CREATE SEQUENCE IF NOT EXISTS pdv_sale_number_seq;

ALTER TABLE pdv_sales
  ADD COLUMN IF NOT EXISTS sale_number BIGINT NOT NULL DEFAULT nextval('pdv_sale_number_seq');

ALTER SEQUENCE pdv_sale_number_seq OWNED BY pdv_sales.sale_number;

CREATE INDEX IF NOT EXISTS idx_pdv_sales_sale_number ON pdv_sales(client_id, sale_number);
