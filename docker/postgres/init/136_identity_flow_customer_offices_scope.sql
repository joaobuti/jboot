\set ON_ERROR_STOP on
\connect jboot_identity

-- `flow:customers:offices`: escolher o escritorio da ficha do cliente (docs/product/flow-offices-sprints.md,
-- Sprint 2). Sem ela (e sem `flow:admin`), o cliente vai para o escritorio ativo de quem cadastra.
-- Entra no pacote de admin do cliente e e concedida a quem ja tem `flow:admin`.
--
-- Idempotente. So roda sozinho em volume novo; em base existente aplicar a mao.
BEGIN;

INSERT INTO application_permission_catalog (application_id, permission_type, permission_key, label, client_admin_default)
SELECT id, 'scope', 'flow:customers:offices', 'Escolher o escritório da ficha do cliente', true
FROM applications WHERE slug = 'flow'
ON CONFLICT (application_id, permission_type, permission_key)
DO UPDATE SET label = EXCLUDED.label, status = 'active', client_admin_default = true;

UPDATE entitlements e
   SET scopes = array_append(e.scopes, 'flow:customers:offices')
  FROM applications a
 WHERE a.id = e.application_id AND a.slug = 'flow'
   AND 'flow:admin' = ANY(e.scopes)
   AND NOT ('flow:customers:offices' = ANY(e.scopes));

COMMIT;
