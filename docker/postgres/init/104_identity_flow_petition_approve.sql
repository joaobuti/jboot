\set ON_ERROR_STOP on
\connect jboot_identity

-- Permissao "Aprovar peticao inicial" do Flow (ADR 020, Q7): so quem a tem (ou flow:admin)
-- aprova a peticao gerada pela rotina e libera a replica no Drive. Atribuida pela tela
-- de Permissoes; o administrador do Flow (`flow:admin`) recebe por padrao.
-- Idempotente.

INSERT INTO application_permission_catalog (application_id, permission_type, permission_key, label)
SELECT a.id, 'scope', 'flow:petition:approve', 'Aprovar petição inicial'
FROM applications a
WHERE a.slug = 'flow'
ON CONFLICT (application_id, permission_type, permission_key)
DO UPDATE SET label = EXCLUDED.label, status = 'active';

WITH granted AS (
    UPDATE entitlements e
    SET scopes = array_append(e.scopes, 'flow:petition:approve')
    FROM applications a
    WHERE a.id = e.application_id
      AND a.slug = 'flow'
      AND e.status = 'active'
      AND 'flow:admin' = ANY(e.scopes)
      AND NOT ('flow:petition:approve' = ANY(e.scopes))
    RETURNING e.identity_id
)
INSERT INTO identity_permission_versions (identity_id, version)
SELECT DISTINCT identity_id, 2 FROM granted
ON CONFLICT (identity_id)
DO UPDATE SET version = identity_permission_versions.version + 1, updated_at = now();
