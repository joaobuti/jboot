\set ON_ERROR_STOP on
\connect jboot_pdv

-- Sprint 9 do modulo `comanda` (pagamento dividido). Ver
-- docs/product/comanda-sprints.md.
--
-- Modelo escolhido pelo usuario: cada recebimento vira uma venda no PDV,
-- derivada de uma venda-pai que representa a comanda. Motivo decisivo: a
-- conferencia de caixa soma `pdv_sale_payments` de vendas concluidas, entao
-- pagamento que nao vira venda deixa dinheiro invisivel para o caixa.
--
-- Divisao de papeis:
--   `comanda_parent`  — carrega os itens (documento de consumo, origem da NF)
--                       e NAO carrega pagamento proprio.
--   `comanda_payment` — carrega o pagamento e NAO carrega item.
-- O dinheiro vive somente nas filhas; duplicar o pagamento no pai faria o
-- caixa contar duas vezes.

ALTER TABLE pdv_sales
  ADD COLUMN IF NOT EXISTS parent_sale_id uuid REFERENCES pdv_sales(id),
  ADD COLUMN IF NOT EXISTS sale_role varchar(24) NOT NULL DEFAULT 'standalone';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdv_sales_sale_role_check') THEN
    ALTER TABLE pdv_sales
      ADD CONSTRAINT pdv_sales_sale_role_check
      CHECK (sale_role IN ('standalone', 'comanda_parent', 'comanda_payment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pdv_sales_parent
  ON pdv_sales(parent_sale_id) WHERE parent_sale_id IS NOT NULL;

-- Venda-pai da comanda enquanto ela ainda esta aberta. `closed_sale_id`
-- continua sendo preenchido so no fechamento (e aponta para a mesma venda),
-- preservando a busca inversa da Sprint 6 (CPF na nota).
ALTER TABLE comandas
  ADD COLUMN IF NOT EXISTS parent_sale_id uuid REFERENCES pdv_sales(id);
