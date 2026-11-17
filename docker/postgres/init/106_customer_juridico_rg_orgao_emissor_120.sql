-- =============================================================
-- 106_customer_juridico_rg_orgao_emissor_120.sql
-- Orgao emissor do RG ate 120 caracteres: o RG modelo novo traz o nome
-- do instituto (ex.: "Instituto de Identificacao Aderson Conceicao de
-- Melo/AM"), que nao cabia em varchar(30). A validacao de cadastro
-- descarta valor maior que a coluna, nunca trunca.
--
-- So alarga a coluna (sem perda de dado). Idempotente.
-- =============================================================

\set ON_ERROR_STOP on

\connect jboot_pdv

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'customer_juridico'
          AND column_name = 'rg_orgao_emissor'
          AND (character_maximum_length IS NULL OR character_maximum_length < 120)
    ) THEN
        ALTER TABLE customer_juridico ALTER COLUMN rg_orgao_emissor TYPE varchar(120);
    END IF;
END $$;
