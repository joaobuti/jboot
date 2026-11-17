-- =============================================================
-- 060_customer_auxiliary_tables.sql
-- ADR 013 (fase de EXPANSAO, aditiva e idempotente).
-- Cria as tabelas auxiliares 1:1 do nucleo de cliente final
-- (pdv_establishment_customers):
--   customer_pdv       dado de PDV/NF-e (ie, ind_ie_dest, address_ibge_code)
--   customer_juridico  dado juridico do cliente atendido pelo Flow
-- e copia os campos fiscais atuais do nucleo para customer_pdv.
--
-- NAO remove colunas do nucleo. A remocao de ie, ind_ie_dest e
-- address_ibge_code e a fase de CONTRACAO, migration posterior ao
-- merge e a aplicacao desta expansao em producao.
-- =============================================================

\set ON_ERROR_STOP on

\connect jboot_pdv

CREATE TABLE IF NOT EXISTS customer_pdv (
    customer_id       uuid PRIMARY KEY REFERENCES pdv_establishment_customers(id) ON DELETE CASCADE,
    client_id         uuid NOT NULL,
    ie                varchar(20),
    ind_ie_dest       smallint NOT NULL DEFAULT 9 CHECK (ind_ie_dest IN (1, 2, 9)),
    address_ibge_code varchar(7),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_pdv_client_idx ON customer_pdv(client_id);

CREATE TABLE IF NOT EXISTS customer_juridico (
    customer_id                uuid PRIMARY KEY REFERENCES pdv_establishment_customers(id) ON DELETE CASCADE,
    client_id                  uuid NOT NULL,
    data_nascimento            date,
    nacionalidade              varchar(60),
    estado_civil               varchar(40),
    profissao                  varchar(120),
    rg_numero                  varchar(30),
    rg_orgao_emissor           varchar(30),
    rg_uf                      varchar(2),
    nome_mae                   varchar(200),
    numero_beneficio           varchar(30),
    especie_beneficio          varchar(120),
    banco_pagamento            varchar(120),
    hipossuficiencia_declarada boolean NOT NULL DEFAULT false,
    observacoes                text,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_juridico_client_idx ON customer_juridico(client_id);

-- Isolamento de tenant no banco: a linha auxiliar so pode apontar para um
-- cliente do MESMO client_id. UNIQUE (id, client_id) no nucleo (trivial, id e
-- PK) permite FK composta (customer_id, client_id) nas auxiliares. Guardado por
-- pg_constraint para manter a migration idempotente; a FK simples permanece.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdv_establishment_customers_id_client_uq'
                   AND conrelid = 'pdv_establishment_customers'::regclass) THEN
        ALTER TABLE pdv_establishment_customers
            ADD CONSTRAINT pdv_establishment_customers_id_client_uq UNIQUE (id, client_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_pdv_customer_client_fk'
                   AND conrelid = 'customer_pdv'::regclass) THEN
        ALTER TABLE customer_pdv
            ADD CONSTRAINT customer_pdv_customer_client_fk
            FOREIGN KEY (customer_id, client_id)
            REFERENCES pdv_establishment_customers(id, client_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_juridico_customer_client_fk'
                   AND conrelid = 'customer_juridico'::regclass) THEN
        ALTER TABLE customer_juridico
            ADD CONSTRAINT customer_juridico_customer_client_fk
            FOREIGN KEY (customer_id, client_id)
            REFERENCES pdv_establishment_customers(id, client_id) ON DELETE CASCADE;
    END IF;
END $$;

-- Copia dos campos fiscais. Criterio: so linhas com algum dado fiscal real:
-- ie preenchida (nao vazia), OU address_ibge_code preenchido (nao vazio),
-- OU ind_ie_dest diferente do default 9 (nao contribuinte). Linhas sem dado
-- fiscal ficam sem linha auxiliar (a leitura usa LEFT JOIN e assume 9).
-- ON CONFLICT DO NOTHING: reexecucao nao sobrescreve o que o codigo novo ja
-- gravou em customer_pdv.
INSERT INTO customer_pdv (customer_id, client_id, ie, ind_ie_dest, address_ibge_code)
SELECT c.id, c.client_id, NULLIF(btrim(c.ie), ''), c.ind_ie_dest, NULLIF(btrim(c.address_ibge_code), '')
FROM pdv_establishment_customers c
WHERE NULLIF(btrim(c.ie), '') IS NOT NULL
   OR NULLIF(btrim(c.address_ibge_code), '') IS NOT NULL
   OR c.ind_ie_dest <> 9
ON CONFLICT (customer_id) DO NOTHING;
