ALTER TABLE charges ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS external_order_reference TEXT;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS external_transaction_nsu TEXT;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS external_slug TEXT;

CREATE TABLE IF NOT EXISTS provider_connection_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    provider_connection_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('configured', 'replaced', 'verified', 'disabled')),
    evidence TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (client_id, provider_connection_id)
        REFERENCES provider_connections(client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_provider_connection_audit_tenant
    ON provider_connection_audit (client_id, occurred_at DESC);
