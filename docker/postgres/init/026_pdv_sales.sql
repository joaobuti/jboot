-- =============================================================
-- 026_pdv_sales.sql — Sprint A: tabelas de venda PDV
-- pdv_sales, pdv_sale_items, pdv_sale_payments
-- =============================================================

\connect jboot_pdv

-- ============
-- pdv_sales
-- ============
CREATE TABLE pdv_sales (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL,
    operator_id         UUID NOT NULL,
    cashier_id          UUID,
    status              TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'completed', 'cancelled', 'fiscal_pending', 'fiscal_error')),
    subtotal            NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount            NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total               NUMERIC(12, 2) NOT NULL DEFAULT 0,
    fiscal_document_id  UUID,
    fiscal_status       TEXT CHECK (fiscal_status IN ('pending', 'authorized', 'contingency', 'failed')),
    fiscal_request_id   UUID,
    caller_module       TEXT NOT NULL DEFAULT 'pdv',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdv_sales_client ON pdv_sales(client_id, status);
CREATE INDEX idx_pdv_sales_fiscal ON pdv_sales(fiscal_request_id) WHERE fiscal_request_id IS NOT NULL;

-- ================
-- pdv_sale_items
-- ================
CREATE TABLE pdv_sale_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id        UUID NOT NULL REFERENCES pdv_sales(id),
    client_id      UUID NOT NULL,
    product_id     UUID NOT NULL,
    quantity       NUMERIC(10, 4) NOT NULL,
    unit_price     NUMERIC(12, 2) NOT NULL,
    discount       NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total          NUMERIC(12, 2) NOT NULL,
    -- dados fiscais pré-calculados (fiscal não calcula impostos)
    cfop           TEXT,
    ncm            TEXT,
    cst_icms       TEXT,
    cst_pis        TEXT,
    cst_cofins     TEXT,
    aliq_icms      NUMERIC(5, 2),
    aliq_pis       NUMERIC(5, 2),
    aliq_cofins    NUMERIC(5, 2),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdv_sale_items_sale ON pdv_sale_items(sale_id);

-- ====================
-- pdv_sale_payments
-- ====================
CREATE TABLE pdv_sale_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id         UUID NOT NULL REFERENCES pdv_sales(id),
    client_id       UUID NOT NULL,
    payment_method  TEXT NOT NULL
                      CHECK (payment_method IN ('dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'outro')),
    amount          NUMERIC(12, 2) NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
    external_ref    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pdv_sale_payments_sale ON pdv_sale_payments(sale_id);
