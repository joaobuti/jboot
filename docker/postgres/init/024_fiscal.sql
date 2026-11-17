-- =============================================================
-- 024_fiscal.sql — svc-jboot-fiscal dev seed
-- Cria banco, tabelas e dados iniciais para ambiente local/demo.
-- =============================================================

\connect postgres

SELECT 'CREATE DATABASE jboot_fiscal'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jboot_fiscal')\gexec

\connect jboot_fiscal

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================
-- fiscal_certificates
-- =====================
CREATE TABLE IF NOT EXISTS fiscal_certificates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     UUID NOT NULL,
    cnpj_emitente TEXT NOT NULL,
    ambiente      TEXT NOT NULL CHECK (ambiente IN ('homologacao', 'producao')),
    pfx_encrypted BYTEA NOT NULL,
    encryption_iv BYTEA NOT NULL,
    encryption_tag BYTEA NOT NULL,
    razao_social  TEXT NOT NULL,
    valid_from    TIMESTAMPTZ NOT NULL,
    valid_until   TIMESTAMPTZ NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    alerted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, cnpj_emitente, ambiente)
);

-- ==============================
-- fiscal_document_sequences
-- ==============================
CREATE TABLE IF NOT EXISTS fiscal_document_sequences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL,
    cnpj_emitente   TEXT NOT NULL,
    tipo_documento  TEXT NOT NULL CHECK (tipo_documento IN ('nfe', 'nfce', 'nfse')),
    serie           SMALLINT NOT NULL,
    ambiente        TEXT NOT NULL CHECK (ambiente IN ('homologacao', 'producao')),
    ultimo_numero   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, cnpj_emitente, tipo_documento, serie, ambiente)
);

-- =====================
-- fiscal_documents
-- =====================
CREATE TABLE IF NOT EXISTS fiscal_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      TEXT NOT NULL,
    client_id       UUID NOT NULL,
    cnpj_emitente   TEXT NOT NULL,
    tipo_documento  TEXT NOT NULL CHECK (tipo_documento IN ('nfe', 'nfce', 'nfse')),
    serie           SMALLINT NOT NULL,
    numero          INTEGER NOT NULL,
    chave_acesso    TEXT,
    protocolo       TEXT,
    ambiente        TEXT NOT NULL CHECK (ambiente IN ('homologacao', 'producao')),
    status          TEXT NOT NULL CHECK (status IN ('pending', 'authorized', 'rejected', 'cancelled', 'contingency', 'denegada')),
    data_emissao    TIMESTAMPTZ NOT NULL,
    data_autorizacao TIMESTAMPTZ,
    xml_envio       TEXT NOT NULL,
    xml_retorno     TEXT,
    danfe_pdf       BYTEA,
    contingencia_tipo TEXT,
    contingencia_data TIMESTAMPTZ,
    uf_emitente     CHAR(2) NOT NULL,
    retry_count     SMALLINT NOT NULL DEFAULT 0,
    ip_origem       TEXT,
    caller_service  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_client ON fiscal_documents(client_id, status);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_contingency ON fiscal_documents(status, retry_count) WHERE status = 'contingency';

-- ===========================
-- fiscal_document_events
-- ===========================
CREATE TABLE IF NOT EXISTS fiscal_document_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_document_id  TEXT NOT NULL,
    client_id           UUID NOT NULL,
    event_type          TEXT NOT NULL,
    status_anterior     TEXT,
    status_novo         TEXT NOT NULL,
    sefaz_codigo        TEXT,
    sefaz_motivo        TEXT,
    payload_resumo      JSONB,
    ip_origem           TEXT,
    caller_service      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_events_document ON fiscal_document_events(fiscal_document_id);

-- ======================
-- fiscal_cancellations
-- ======================
CREATE TABLE IF NOT EXISTS fiscal_cancellations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_document_id  UUID NOT NULL REFERENCES fiscal_documents(id),
    client_id           UUID NOT NULL,
    justificativa       TEXT NOT NULL,
    protocolo           TEXT,
    data_cancelamento   TIMESTAMPTZ,
    xml_retorno         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ======================
-- fiscal_inutilizations
-- ======================
CREATE TABLE IF NOT EXISTS fiscal_inutilizations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id         UUID NOT NULL,
    cnpj_emitente     TEXT NOT NULL,
    tipo_documento    TEXT NOT NULL,
    serie             SMALLINT NOT NULL,
    numero_inicial    INTEGER NOT NULL,
    numero_final      INTEGER NOT NULL,
    justificativa     TEXT NOT NULL,
    ambiente          TEXT NOT NULL,
    protocolo         TEXT,
    data_inutilizacao TIMESTAMPTZ,
    xml_retorno       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============
-- fiscal_cce
-- ============
CREATE TABLE IF NOT EXISTS fiscal_cce (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_document_id  UUID NOT NULL REFERENCES fiscal_documents(id),
    client_id           UUID NOT NULL,
    sequencia           SMALLINT NOT NULL,
    correcao            TEXT NOT NULL,
    protocolo           TEXT,
    data_registro       TIMESTAMPTZ,
    xml_retorno         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (fiscal_document_id, sequencia)
);

-- ========================
-- fiscal_tenant_config
-- ========================
CREATE TABLE IF NOT EXISTS fiscal_tenant_config (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id         UUID NOT NULL,
    cnpj_emitente     TEXT NOT NULL,
    ambiente          TEXT NOT NULL DEFAULT 'homologacao' CHECK (ambiente IN ('homologacao', 'producao')),
    razao_social      TEXT,
    nome_fantasia     TEXT,
    inscricao_estadual TEXT,
    telefone          TEXT,
    email             TEXT,
    address_logradouro TEXT,
    address_numero     TEXT,
    address_complemento TEXT,
    address_bairro     TEXT,
    address_municipio  TEXT,
    address_uf         CHAR(2),
    address_cep        CHAR(8),
    address_codigo_municipio CHAR(7),
    serie_nfce        SMALLINT NOT NULL DEFAULT 1,
    serie_nfe         SMALLINT NOT NULL DEFAULT 1,
    csc               TEXT,
    csc_id            TEXT,
    regime_fiscal     TEXT NOT NULL DEFAULT 'simples' CHECK (regime_fiscal IN ('simples', 'lucro_presumido', 'lucro_real')),
    cfop_padrao_nfce  TEXT,
    cfop_padrao_nfe   TEXT,
    icms_origem_padrao SMALLINT,
    icms_cst_padrao   TEXT,
    icms_aliquota_padrao NUMERIC(7,4),
    pis_cst_padrao    TEXT,
    pis_aliquota_padrao NUMERIC(7,4),
    cofins_cst_padrao TEXT,
    cofins_aliquota_padrao NUMERIC(7,4),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (client_id, cnpj_emitente)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_tenant_config_client ON fiscal_tenant_config(client_id);

ALTER TABLE fiscal_tenant_config ADD COLUMN IF NOT EXISTS icms_origem_padrao SMALLINT;
ALTER TABLE fiscal_tenant_config ADD COLUMN IF NOT EXISTS icms_aliquota_padrao NUMERIC(7,4);
ALTER TABLE fiscal_tenant_config ADD COLUMN IF NOT EXISTS pis_aliquota_padrao NUMERIC(7,4);
ALTER TABLE fiscal_tenant_config ADD COLUMN IF NOT EXISTS cofins_aliquota_padrao NUMERIC(7,4);

-- ===========================
-- Seed: Operador Senior demo
-- Empresa: JBOOT LTDA — CNPJ: 63784101000110
-- client_id corresponde ao client canonico do Operador Senior no Identity.
-- ===========================
CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
DECLARE
    v_senior_client_id UUID;
BEGIN
    SELECT client_id INTO v_senior_client_id
    FROM dblink(
        'dbname=jboot_identity user=jboot',
        $sql$
            SELECT c.id
            FROM clients c
            JOIN memberships m ON m.client_id = c.id AND m.status = 'active'
            JOIN identities i ON i.id = m.identity_id
            WHERE i.document_type = 'cpf'
              AND i.document_number = '00000000191'
              AND c.document_type = 'cnpj'
              AND c.document_number = '63784101000110'
            LIMIT 1
        $sql$
    ) AS senior_client(client_id UUID);

    IF v_senior_client_id IS NULL THEN
        RAISE EXCEPTION 'Operador Senior client 63784101000110 not found in jboot_identity';
    END IF;

INSERT INTO fiscal_document_sequences (client_id, cnpj_emitente, tipo_documento, serie, ambiente)
VALUES
    (v_senior_client_id, '63784101000110', 'nfce', 1, 'homologacao'),
    (v_senior_client_id, '63784101000110', 'nfe',  1, 'homologacao')
ON CONFLICT (client_id, cnpj_emitente, tipo_documento, serie, ambiente)
DO UPDATE SET updated_at = NOW();

INSERT INTO fiscal_tenant_config (
    client_id, cnpj_emitente, ambiente, serie_nfce, serie_nfe,
    csc, csc_id, regime_fiscal, cfop_padrao_nfce, cfop_padrao_nfe,
    icms_origem_padrao, icms_cst_padrao, icms_aliquota_padrao,
    pis_cst_padrao, pis_aliquota_padrao, cofins_cst_padrao, cofins_aliquota_padrao
)
VALUES (
    v_senior_client_id,
    '63784101000110',
    'homologacao',
    1, 1,
    'DEV-CSC-PLACEHOLDER', '000001',
    'simples',
    '5102', '5102',
    0, '400', 0,
    '07', 0, '07', 0
)
ON CONFLICT (client_id, cnpj_emitente)
DO UPDATE SET ambiente = EXCLUDED.ambiente,
              serie_nfce = EXCLUDED.serie_nfce,
              serie_nfe = EXCLUDED.serie_nfe,
              csc = EXCLUDED.csc,
              csc_id = EXCLUDED.csc_id,
              regime_fiscal = EXCLUDED.regime_fiscal,
              cfop_padrao_nfce = EXCLUDED.cfop_padrao_nfce,
              cfop_padrao_nfe = EXCLUDED.cfop_padrao_nfe,
              icms_origem_padrao = EXCLUDED.icms_origem_padrao,
              icms_cst_padrao = EXCLUDED.icms_cst_padrao,
              icms_aliquota_padrao = EXCLUDED.icms_aliquota_padrao,
              pis_cst_padrao = EXCLUDED.pis_cst_padrao,
              pis_aliquota_padrao = EXCLUDED.pis_aliquota_padrao,
              cofins_cst_padrao = EXCLUDED.cofins_cst_padrao,
              cofins_aliquota_padrao = EXCLUDED.cofins_aliquota_padrao,
              updated_at = NOW();
END $$;
