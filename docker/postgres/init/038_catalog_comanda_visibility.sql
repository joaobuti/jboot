\set ON_ERROR_STOP on
\connect jboot_pdv

-- Visibilidade de categoria no cardapio publico da comanda (Sprint 1 da feature
-- de autoatendimento). Categoria e o primeiro nivel de cascata: categoria com
-- visible_in_comanda=false esconde todos os produtos dela no endpoint publico,
-- mesmo que o produto individualmente esteja visible_in_comanda=true.
ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS visible_in_comanda BOOLEAN NOT NULL DEFAULT false;

-- Fila de producao do produto (cozinha ou bar). Nao e derivado de categoria;
-- e atributo direto do produto, snapshot em comanda_itens quando pedido.
-- Nullable no banco: obrigatoriedade condicional (quando visible_in_comanda=true)
-- e validada na aplicacao, nao no banco.
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS queue_type VARCHAR(16) CHECK (queue_type IN ('cozinha', 'bar'));

-- Index para a query de cardapio publico (filtra por client_id + cascata de
-- visibilidade + status ativo).
CREATE INDEX IF NOT EXISTS idx_catalog_categories_client_comanda
  ON catalog_categories(client_id, visible_in_comanda, status);
