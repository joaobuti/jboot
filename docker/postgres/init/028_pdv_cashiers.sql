-- =============================================================
-- 028_pdv_cashiers.sql — Sprint 2: sessões de caixa PDV
-- =============================================================

\connect jboot_pdv

CREATE TABLE pdv_cashiers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id         UUID NOT NULL,
    operator_id       UUID NOT NULL,
    status            TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'closed')),
    opening_balance   NUMERIC(12, 2) NOT NULL DEFAULT 0,
    closing_balance   NUMERIC(12, 2),
    opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at         TIMESTAMPTZ,
    notes             TEXT
);

-- sem UNIQUE por operador — múltiplos caixas simultâneos permitidos (decisão PO Sprint 2)
CREATE INDEX idx_pdv_cashiers_client_operator ON pdv_cashiers(client_id, operator_id, status);
