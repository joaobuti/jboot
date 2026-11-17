\connect jboot_pdv

CREATE UNIQUE INDEX IF NOT EXISTS uq_pdv_sale_payments_external_ref
    ON pdv_sale_payments (client_id, external_ref)
    WHERE external_ref IS NOT NULL;
