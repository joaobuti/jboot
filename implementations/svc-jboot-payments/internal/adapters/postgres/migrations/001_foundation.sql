CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS provider_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    provider TEXT NOT NULL,
    public_identifier TEXT NOT NULL,
    secret_ref TEXT,
    status TEXT NOT NULL CHECK (status IN ('unverified', 'verified', 'disabled')),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, provider, public_identifier),
    UNIQUE (client_id, id)
);

CREATE TABLE IF NOT EXISTS charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    consumer_application TEXT NOT NULL,
    merchant_order_reference TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CHECK (currency = 'BRL'),
    status TEXT NOT NULL CHECK (status IN (
        'created', 'provider_pending', 'awaiting_payment',
        'verification_pending', 'received', 'pending_reconciliation',
        'creation_outcome_unknown', 'cancelled', 'failed'
    )),
    idempotency_key TEXT NOT NULL,
    request_hash BYTEA NOT NULL,
    provider_connection_id UUID REFERENCES provider_connections(id),
    commercial_terms_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, consumer_application, idempotency_key),
    UNIQUE (client_id, id),
    FOREIGN KEY (client_id, provider_connection_id)
        REFERENCES provider_connections(client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_charges_tenant_status
    ON charges (client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charges_tenant_order
    ON charges (client_id, consumer_application, merchant_order_reference);

CREATE TABLE IF NOT EXISTS payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    charge_id UUID NOT NULL,
    provider_connection_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'pending', 'awaiting_payment', 'verification_pending',
        'received', 'pending_reconciliation', 'creation_outcome_unknown', 'failed'
    )),
    external_order_reference TEXT,
    external_transaction_id TEXT,
    external_transaction_nsu TEXT,
    request_fingerprint BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, provider_connection_id, external_transaction_id),
    UNIQUE (client_id, provider_connection_id, external_transaction_nsu),
    FOREIGN KEY (client_id, charge_id) REFERENCES charges(client_id, id),
    FOREIGN KEY (client_id, provider_connection_id)
        REFERENCES provider_connections(client_id, id)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_charge
    ON payment_attempts (client_id, charge_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provider_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    provider_connection_id UUID NOT NULL,
    external_event_id TEXT NOT NULL,
    payload_hash BYTEA NOT NULL,
    payload_redacted JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'processing', 'processed', 'rejected')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    UNIQUE (provider_connection_id, external_event_id),
    FOREIGN KEY (client_id, provider_connection_id)
        REFERENCES provider_connections(client_id, id)
);

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    charge_id UUID NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    status TEXT NOT NULL CHECK (status IN ('requested', 'pending', 'succeeded', 'failed')),
    idempotency_key TEXT NOT NULL,
    correction_of UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, charge_id, idempotency_key),
    FOREIGN KEY (client_id, charge_id) REFERENCES charges(client_id, id)
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    sequence BIGINT NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    published_at TIMESTAMPTZ,
    UNIQUE (aggregate_type, aggregate_id, event_type, sequence)
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON outbox_events (occurred_at)
    WHERE published_at IS NULL;
