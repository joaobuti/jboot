\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- "Cliente nao tem acoes anteriores" marcado por padrao (decisao do usuario de 2026-10-29; ADR 020,
-- revisao da decisao 7):
--
-- - `origin`: `manual` (a pessoa confirmou no passo Acoes ajuizadas) ou `default` (marcada pelo Flow
--   ao cadastrar ou vincular o cliente). A marcacao padrao vale como confirmacao para as Peticoes
--   iniciais e sai como a manual: ao incluir uma acao (`lawsuit_added`) ou ao desfazer (`withdrawn`).
-- - Backfill: cliente do Flow (escritorio ou card vinculado) sem nenhuma acao e sem nenhuma confirmacao,
--   vigente ou revogada, recebe a marcacao padrao em nome de quem o vinculou primeiro. Cliente em que
--   alguem ja mexeu na lista ou na confirmacao fica como esta.
--
-- Migration aditiva e idempotente.
BEGIN;

ALTER TABLE kanban_customer_prior_lawsuit_declarations
    ADD COLUMN IF NOT EXISTS origin varchar(10) NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kanban_customer_prior_lawsuit_declarations_origin_check'
  ) THEN
    ALTER TABLE kanban_customer_prior_lawsuit_declarations
      ADD CONSTRAINT kanban_customer_prior_lawsuit_declarations_origin_check CHECK (origin IN ('manual', 'default'));
  END IF;
END $$;

INSERT INTO kanban_customer_prior_lawsuit_declarations (client_id, customer_id, declared_by_identity_id, declared_at, origin)
SELECT DISTINCT ON (f.client_id, f.customer_id) f.client_id, f.customer_id, f.identity_id, f.at, 'default'
FROM (
  SELECT client_id, customer_id, linked_by_identity_id AS identity_id, linked_at AS at FROM kanban_customer_offices
  UNION ALL
  SELECT client_id, customer_id, created_by_identity_id, created_at FROM kanban_card_customers
) f
WHERE NOT EXISTS (
        SELECT 1 FROM kanban_customer_prior_lawsuits l WHERE l.client_id = f.client_id AND l.customer_id = f.customer_id)
  AND NOT EXISTS (
        SELECT 1 FROM kanban_customer_prior_lawsuit_declarations d WHERE d.client_id = f.client_id AND d.customer_id = f.customer_id)
ORDER BY f.client_id, f.customer_id, f.at;

COMMIT;
