\set ON_ERROR_STOP on
\connect jboot_pdv

-- Evolve pdv_stock_locations into full store/branch entity
ALTER TABLE pdv_stock_locations
  ADD COLUMN IF NOT EXISTS is_matriz            BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cnpj                 VARCHAR(14),
  ADD COLUMN IF NOT EXISTS ie                   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address_zip          VARCHAR(8),
  ADD COLUMN IF NOT EXISTS address_street       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_number       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address_complement   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_neighborhood VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_city         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_state        CHAR(2),
  ADD COLUMN IF NOT EXISTS address_ibge_code    VARCHAR(7);

-- At most one matriz per client
CREATE UNIQUE INDEX IF NOT EXISTS uidx_pdv_stock_locations_matriz
  ON pdv_stock_locations(client_id) WHERE is_matriz = true;

-- Stock transfers between locations
CREATE TABLE IF NOT EXISTS pdv_stock_transfers (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   UUID          NOT NULL,
  from_location_id            UUID          NOT NULL REFERENCES pdv_stock_locations(id),
  to_location_id              UUID          NOT NULL REFERENCES pdv_stock_locations(id),
  product_id                  UUID          NOT NULL REFERENCES catalog_products(id),
  quantity                    NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  notes                       TEXT,
  transferred_by_identity_id  UUID          NOT NULL,
  transferred_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT chk_transfer_diff_locations CHECK (from_location_id <> to_location_id)
);

CREATE INDEX IF NOT EXISTS idx_pdv_stock_transfers_client
  ON pdv_stock_transfers(client_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdv_stock_transfers_product
  ON pdv_stock_transfers(client_id, product_id);

-- Seed: loja matriz for JBOOT LTDA demo client
\connect jboot_identity
SELECT id AS "mat_client_id"
FROM clients
WHERE document_type = 'cnpj' AND document_number = '63784101000110'
LIMIT 1 \gset

\connect jboot_pdv
INSERT INTO pdv_stock_locations (client_id, name, type, is_matriz, status)
VALUES (:'mat_client_id'::uuid, 'Loja Matriz', 'store', true, 'active')
ON CONFLICT (client_id, name) DO UPDATE
  SET is_matriz = true, type = 'store', status = 'active', updated_at = now();
