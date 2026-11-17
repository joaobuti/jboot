\set ON_ERROR_STOP on
\connect jboot_identity

-- Adiciona users:manage aos entitlements dos admins de PDV e Flow
-- para habilitar o cadastro de usuarios dentro de cada modulo.
DO $$
DECLARE
    v_pdv_app_id  uuid;
    v_flow_app_id uuid;
BEGIN
    SELECT id INTO v_pdv_app_id  FROM applications WHERE slug = 'pdv';
    SELECT id INTO v_flow_app_id FROM applications WHERE slug = 'flow';

    IF v_pdv_app_id IS NOT NULL THEN
        UPDATE entitlements
        SET scopes = array_append(scopes, 'users:manage')
        WHERE application_id = v_pdv_app_id
          AND NOT ('users:manage' = ANY(scopes));
    END IF;

    IF v_flow_app_id IS NOT NULL THEN
        UPDATE entitlements
        SET scopes = array_append(scopes, 'users:manage')
        WHERE application_id = v_flow_app_id
          AND NOT ('users:manage' = ANY(scopes));
    END IF;
END $$;
