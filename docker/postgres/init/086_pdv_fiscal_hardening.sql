-- Fiscal hardening: product fiscal master data and immutable sale-item snapshot.
\connect jboot_pdv

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS ncm VARCHAR(8),
  ADD COLUMN IF NOT EXISTS cfop VARCHAR(4),
  ADD COLUMN IF NOT EXISTS cest VARCHAR(7),
  ADD COLUMN IF NOT EXISTS gtin VARCHAR(14);

ALTER TABLE pdv_sale_items
  ADD COLUMN IF NOT EXISTS sku VARCHAR(80),
  ADD COLUMN IF NOT EXISTS description VARCHAR(200),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(16),
  ADD COLUMN IF NOT EXISTS gtin VARCHAR(14),
  ADD COLUMN IF NOT EXISTS cest VARCHAR(7);

UPDATE pdv_sale_items i
SET sku = COALESCE(i.sku, p.sku),
    description = COALESCE(i.description, p.name),
    unit = COALESCE(i.unit, p.unit),
    gtin = COALESCE(i.gtin, p.gtin),
    cest = COALESCE(i.cest, p.cest),
    ncm = COALESCE(i.ncm, p.ncm),
    cfop = COALESCE(i.cfop, p.cfop)
FROM catalog_products p
WHERE p.id = i.product_id AND p.client_id = i.client_id;

ALTER TABLE pdv_sales DROP CONSTRAINT IF EXISTS pdv_sales_fiscal_status_check;
ALTER TABLE pdv_sales ADD CONSTRAINT pdv_sales_fiscal_status_check
  CHECK (fiscal_status IN ('pending', 'authorized', 'contingency', 'failed', 'uncertain'));

