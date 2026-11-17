\connect jboot_pdv

ALTER TABLE pdv_cashiers
    ADD COLUMN IF NOT EXISTS expected_closing_balance numeric(12,2),
    ADD COLUMN IF NOT EXISTS counted_balance numeric(12,2),
    ADD COLUMN IF NOT EXISTS closing_difference numeric(12,2);

CREATE TABLE IF NOT EXISTS pdv_cashier_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    cashier_id uuid NOT NULL REFERENCES pdv_cashiers(id),
    operator_id uuid NOT NULL,
    type text NOT NULL CHECK (type IN ('sangria', 'suprimento')),
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    reason text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdv_cashier_movements_cashier_idx
    ON pdv_cashier_movements(client_id, cashier_id, occurred_at DESC);

ALTER TABLE pdv_sales
    ADD COLUMN IF NOT EXISTS cancellation_reason text,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
    ADD COLUMN IF NOT EXISTS cancelled_by_identity_id uuid,
    ADD COLUMN IF NOT EXISTS fiscal_cancel_status text,
    ADD COLUMN IF NOT EXISTS fiscal_cancel_error text;
