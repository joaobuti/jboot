\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Escritorio principal (docs/product/flow-offices-sprints.md, Sprint 1). No maximo um por cliente
-- (indice unico parcial), sempre ativo. A "conta principal" da validacao de dados do cliente passa a
-- ser o agente do escritorio principal: a configuracao geral (`kanban_customer_validation_settings`)
-- e copiada para ele e deixa de ser lida. Ordem da validacao: escritorio do cliente -> escritorio
-- principal -> recusa.
--
-- Idempotente. So roda sozinho em volume novo; em base existente aplicar a mao.
BEGIN;

ALTER TABLE kanban_offices
  ADD COLUMN IF NOT EXISTS is_principal boolean NOT NULL DEFAULT false;

ALTER TABLE kanban_offices DROP CONSTRAINT IF EXISTS kanban_offices_principal_active_check;
ALTER TABLE kanban_offices
  ADD CONSTRAINT kanban_offices_principal_active_check CHECK (NOT is_principal OR active);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_offices_one_principal_idx
  ON kanban_offices (client_id) WHERE is_principal;

-- Cliente com escritorio ativo e sem principal: o mais antigo vira principal.
UPDATE kanban_offices o
   SET is_principal = true, updated_at = now()
 WHERE o.id IN (
   SELECT DISTINCT ON (client_id) id
   FROM kanban_offices
   WHERE active
   ORDER BY client_id, created_at, id
 )
   AND NOT EXISTS (SELECT 1 FROM kanban_offices p WHERE p.client_id = o.client_id AND p.is_principal);

-- Conta principal da validacao -> agente do escritorio principal (so se ele nao tem agente proprio).
INSERT INTO kanban_customer_validation_office_settings
  (client_id, office_id, agent_id, agent_owner_identity_id, updated_by_identity_id)
SELECT s.client_id, o.id, s.agent_id, s.executor_identity_id, s.updated_by_identity_id
FROM kanban_customer_validation_settings s
JOIN kanban_offices o ON o.client_id = s.client_id AND o.is_principal
ON CONFLICT (client_id, office_id) DO NOTHING;

COMMIT;
