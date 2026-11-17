-- 035: location_id on pdv_sales and pdv_cashiers
-- Allows per-store revenue, cashier sessions, and dashboard metrics.

\c jboot_pdv

ALTER TABLE pdv_sales
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES pdv_stock_locations(id);

ALTER TABLE pdv_cashiers
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES pdv_stock_locations(id);

CREATE INDEX IF NOT EXISTS idx_pdv_sales_location ON pdv_sales(client_id, location_id);
CREATE INDEX IF NOT EXISTS idx_pdv_cashiers_location ON pdv_cashiers(client_id, location_id);
