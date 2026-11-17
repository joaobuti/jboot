-- =============================================================
-- 027_pdv_customers_nfe_fields.sql
-- Adiciona campos obrigatórios para emissão de NFe ao
-- cadastro de clientes do PDV (destinatário fiscal).
-- Todos os campos são nullable — NFC-e não exige destinatário.
-- =============================================================

\set ON_ERROR_STOP on

\connect jboot_pdv

ALTER TABLE pdv_establishment_customers
    ADD COLUMN IF NOT EXISTS address_zip          varchar(9),
    ADD COLUMN IF NOT EXISTS address_street       varchar(60),
    ADD COLUMN IF NOT EXISTS address_number       varchar(60),
    ADD COLUMN IF NOT EXISTS address_complement   varchar(60),
    ADD COLUMN IF NOT EXISTS address_neighborhood varchar(60),
    ADD COLUMN IF NOT EXISTS address_city         varchar(60),
    ADD COLUMN IF NOT EXISTS address_state        varchar(2),
    ADD COLUMN IF NOT EXISTS address_ibge_code    varchar(7),
    ADD COLUMN IF NOT EXISTS ie                   varchar(20),
    ADD COLUMN IF NOT EXISTS ind_ie_dest          smallint NOT NULL DEFAULT 9
                                                    CHECK (ind_ie_dest IN (1, 2, 9));
