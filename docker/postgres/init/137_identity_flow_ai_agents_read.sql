\set ON_ERROR_STOP on
\connect jboot_identity

-- `ai:agents:read`: ver os agentes de IA e a configuracao do escritorio (docs/product/flow-offices-sprints.md,
-- Sprint 4). Alterar continua sendo `ai:agents:manage`. As duas entram no pacote de admin e sao
-- concedidas ao usuario marcado responsavel de escritorio (pela plataforma, ao marcar). Quem ja tem
-- `ai:agents:manage` ganha a leitura.
--
-- Idempotente. So roda sozinho em volume novo; em base existente aplicar a mao.
BEGIN;

INSERT INTO application_permission_catalog (application_id, permission_type, permission_key, label, client_admin_default)
SELECT id, 'scope', 'ai:agents:read', 'Ver agentes de IA', true
FROM applications WHERE slug = 'flow'
ON CONFLICT (application_id, permission_type, permission_key)
DO UPDATE SET label = EXCLUDED.label, status = 'active', client_admin_default = true;

UPDATE entitlements e
   SET scopes = array_append(e.scopes, 'ai:agents:read')
  FROM applications a
 WHERE a.id = e.application_id AND a.slug = 'flow'
   AND 'ai:agents:manage' = ANY(e.scopes)
   AND NOT ('ai:agents:read' = ANY(e.scopes));

COMMIT;
