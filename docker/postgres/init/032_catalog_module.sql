\set ON_ERROR_STOP on
\connect jboot_pdv

-- Rename tables: pdv_categories -> catalog_categories
ALTER TABLE pdv_categories RENAME TO catalog_categories;

-- Rename table: pdv_products -> catalog_products
ALTER TABLE pdv_products RENAME TO catalog_products;

-- Rename indexes
ALTER INDEX IF EXISTS pdv_products_client_sku_unique     RENAME TO catalog_products_client_sku_unique;
ALTER INDEX IF EXISTS pdv_products_client_barcode_unique RENAME TO catalog_products_client_barcode_unique;

-- Add visibility flags to catalog_products
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS visible_in_pdv       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible_in_cardapio  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visible_in_comanda   BOOLEAN NOT NULL DEFAULT false;

-- Update existing products: mark all visible in PDV (retroactive)
UPDATE catalog_products SET visible_in_pdv = true;

-- Index for fast catalog queries per module
CREATE INDEX IF NOT EXISTS idx_catalog_products_client_pdv
  ON catalog_products(client_id, visible_in_pdv, status);

CREATE INDEX IF NOT EXISTS idx_catalog_products_client_cardapio
  ON catalog_products(client_id, visible_in_cardapio, status);

CREATE INDEX IF NOT EXISTS idx_catalog_products_client_comanda
  ON catalog_products(client_id, visible_in_comanda, status);
