-- =============================================================
-- 031_pdv_fiscal_config.sql — Configuração fiscal do emitente PDV
-- Uma linha por client_id (tenant). Gerenciada via PUT /pdv/fiscal-config.
-- =============================================================

\connect jboot_pdv

CREATE TABLE pdv_fiscal_config (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id             UUID NOT NULL UNIQUE,
    cnpj_emitente         VARCHAR(14) NOT NULL,
    razao_social          VARCHAR(60) NOT NULL,
    uf                    VARCHAR(2)  NOT NULL,
    crt                   SMALLINT    NOT NULL DEFAULT 1 CHECK (crt IN (1, 2, 3)),
    address_logradouro    VARCHAR(60) NOT NULL,
    address_numero        VARCHAR(60) NOT NULL,
    address_bairro        VARCHAR(60) NOT NULL,
    address_municipio     VARCHAR(60) NOT NULL,
    address_uf            VARCHAR(2)  NOT NULL,
    address_cep           VARCHAR(8)  NOT NULL,
    address_codigo_municipio VARCHAR(7) NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
