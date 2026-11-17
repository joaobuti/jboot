\set ON_ERROR_STOP on
\connect jboot_identity

INSERT INTO application_permission_catalog (application_id, permission_type, permission_key, label)
SELECT id, 'scope', 'flow:actions:execute', 'Executar ações'
FROM applications WHERE slug = 'flow'
ON CONFLICT (application_id, permission_type, permission_key)
DO UPDATE SET label = EXCLUDED.label, status = 'active';

-- Existing administrators retain full access; ordinary users need explicit grant.
UPDATE entitlements e
SET scopes = array_append(e.scopes, 'flow:actions:execute')
FROM applications a
WHERE e.application_id = a.id AND a.slug = 'flow'
  AND e.status = 'active'
  AND (e.roles && ARRAY['global_master', 'client_admin']::text[])
  AND NOT ('flow:actions:execute' = ANY(e.scopes));
