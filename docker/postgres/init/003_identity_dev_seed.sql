\set ON_ERROR_STOP on
\connect jboot_identity

DO $$
DECLARE
    v_senior_identity_id uuid;
    v_test_identity_id uuid;
    v_jboot_client_id uuid;
    v_demo_client_id uuid;
    v_application_id uuid;
    v_database_ref_id uuid;
BEGIN
    SELECT id INTO v_senior_identity_id
    FROM identities
    WHERE document_type = 'cpf' AND document_number = '00000000191';

    IF v_senior_identity_id IS NULL THEN
        INSERT INTO identities (document_type, document_number, display_name, email)
        VALUES ('cpf', '00000000191', 'Operador Senior', 'operador@example.local')
        RETURNING id INTO v_senior_identity_id;
    ELSE
        UPDATE identities
        SET display_name = 'Operador Senior',
            email = 'operador@example.local',
            status = 'active'
        WHERE id = v_senior_identity_id;
    END IF;

    INSERT INTO credentials (identity_id, credential_type, credential_ref, secret_hash)
    VALUES (
        v_senior_identity_id,
        'password',
        'local',
        '$2b$12$KVChOcBWq8O2HtcdsrZgnuQj1kGhsduoOjwEZ/1Vwuk121cquuP2W'
    )
    ON CONFLICT (identity_id, credential_type, credential_ref)
    DO UPDATE SET secret_hash = EXCLUDED.secret_hash, status = 'active';

    SELECT id INTO v_test_identity_id
    FROM identities
    WHERE document_type = 'cpf' AND document_number = '00011122233';

    IF v_test_identity_id IS NULL THEN
        INSERT INTO identities (document_type, document_number, display_name, email)
        VALUES ('cpf', '00011122233', 'Usuario Teste', 'usuario.teste@example.local')
        RETURNING id INTO v_test_identity_id;
    ELSE
        UPDATE identities
        SET display_name = 'Usuario Teste',
            email = 'usuario.teste@example.local',
            status = 'active'
        WHERE id = v_test_identity_id;
    END IF;

    INSERT INTO credentials (identity_id, credential_type, credential_ref, secret_hash)
    VALUES (
        v_test_identity_id,
        'password',
        'local',
        '$2b$12$KVChOcBWq8O2HtcdsrZgnuQj1kGhsduoOjwEZ/1Vwuk121cquuP2W'
    )
    ON CONFLICT (identity_id, credential_type, credential_ref)
    DO UPDATE SET secret_hash = EXCLUDED.secret_hash, status = 'active';

    UPDATE identities
    SET status = 'deleted'
    WHERE document_type = 'cpf'
      AND document_number IN ('12345678909')
      AND document_number NOT IN ('00000000191', '00011122233');

    SELECT id INTO v_jboot_client_id
    FROM clients
    WHERE document_type = 'cnpj' AND document_number = '63784101000110';

    IF v_jboot_client_id IS NULL THEN
        INSERT INTO clients (client_type, document_type, document_number, legal_name, trade_name)
        VALUES ('company', 'cnpj', '63784101000110', 'JBOOT LTDA', 'JBoot')
        RETURNING id INTO v_jboot_client_id;
    ELSE
        UPDATE clients
        SET client_type = 'company',
            legal_name = 'JBOOT LTDA',
            trade_name = 'JBoot',
            status = 'active'
        WHERE id = v_jboot_client_id;
    END IF;

    SELECT id INTO v_demo_client_id
    FROM clients
    WHERE document_type = 'cnpj' AND document_number = '22345678000199';

    IF v_demo_client_id IS NULL THEN
        INSERT INTO clients (client_type, document_type, document_number, legal_name, trade_name)
        VALUES ('company', 'cnpj', '22345678000199', 'DEMO JBOOT LTDA', 'Demo JBoot')
        RETURNING id INTO v_demo_client_id;
    ELSE
        UPDATE clients
        SET client_type = 'company',
            legal_name = 'DEMO JBOOT LTDA',
            trade_name = 'Demo JBoot',
            status = 'active'
        WHERE id = v_demo_client_id;
    END IF;

    UPDATE clients
    SET status = 'deleted'
    WHERE document_type = 'cnpj'
      AND document_number IN ('11122233000144')
      AND document_number NOT IN ('63784101000110', '22345678000199');

    INSERT INTO applications (slug, name, token_audience)
    VALUES ('identity-admin', 'Identity Admin', 'app:identity-admin')
    ON CONFLICT (slug)
    DO UPDATE SET name = EXCLUDED.name, token_audience = EXCLUDED.token_audience, status = 'active'
    RETURNING id INTO v_application_id;

    INSERT INTO client_applications (
        client_id,
        application_id,
        status,
        plan_code,
        billing_ref,
        config
    )
    VALUES (
        v_jboot_client_id,
        v_application_id,
        'active',
        'identity-admin-dev',
        'local-dev',
        '{"environment":"local","launchUrl":"http://localhost:3000/identity","webUrl":"http://localhost:3000"}'::jsonb
    )
    ON CONFLICT (client_id, application_id)
    DO UPDATE SET status = 'active',
                  plan_code = EXCLUDED.plan_code,
                  billing_ref = EXCLUDED.billing_ref,
                  config = EXCLUDED.config,
                  updated_at = now();

    INSERT INTO memberships (identity_id, client_id, roles)
    VALUES (v_senior_identity_id, v_jboot_client_id, ARRAY['client_admin', 'global_master'])
    ON CONFLICT (identity_id, client_id)
    DO UPDATE SET roles = EXCLUDED.roles, status = 'active';

    INSERT INTO memberships (identity_id, client_id, roles)
    VALUES (v_test_identity_id, v_demo_client_id, ARRAY['client_admin'])
    ON CONFLICT (identity_id, client_id)
    DO UPDATE SET roles = EXCLUDED.roles, status = 'active';

    UPDATE memberships
    SET status = 'revoked'
    WHERE (identity_id = v_senior_identity_id AND client_id <> v_jboot_client_id)
       OR (identity_id = v_test_identity_id AND client_id <> v_demo_client_id);

    UPDATE memberships
    SET status = 'revoked'
    WHERE identity_id NOT IN (v_senior_identity_id, v_test_identity_id)
       OR client_id NOT IN (v_jboot_client_id, v_demo_client_id);

    UPDATE entitlements
    SET status = 'revoked'
    WHERE identity_id NOT IN (v_senior_identity_id, v_test_identity_id)
       OR client_id NOT IN (v_jboot_client_id, v_demo_client_id)
       OR (identity_id = v_senior_identity_id AND client_id <> v_jboot_client_id)
       OR (identity_id = v_test_identity_id AND client_id <> v_demo_client_id);

    UPDATE client_applications
    SET status = 'cancelled',
        updated_at = now()
    WHERE client_id NOT IN (v_jboot_client_id, v_demo_client_id);

    UPDATE database_refs
    SET status = 'disabled',
        metadata = metadata || '{"disabled_reason":"non_canonical_dev_client"}'::jsonb,
        updated_at = now()
    WHERE client_id IS NOT NULL
      AND client_id NOT IN (v_jboot_client_id, v_demo_client_id);

    UPDATE identities
    SET status = 'deleted'
    WHERE id NOT IN (v_senior_identity_id, v_test_identity_id);

    UPDATE clients
    SET status = 'deleted',
        updated_at = now()
    WHERE id NOT IN (v_jboot_client_id, v_demo_client_id);

    INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles)
    VALUES (
        v_senior_identity_id,
        v_jboot_client_id,
        v_application_id,
        ARRAY['identity:read', 'identity:write', 'identity:admin'],
        ARRAY['identity_admin', 'global_admin', 'global_master']
    )
    ON CONFLICT (identity_id, client_id, application_id)
    DO UPDATE SET scopes = EXCLUDED.scopes, roles = EXCLUDED.roles, status = 'active';

    UPDATE entitlements
    SET status = 'revoked'
    WHERE application_id = v_application_id
      AND (
          identity_id <> v_senior_identity_id
          OR client_id <> v_jboot_client_id
      );

    SELECT id INTO v_database_ref_id
    FROM database_refs
    WHERE application_id = v_application_id
      AND client_id = v_jboot_client_id
      AND strategy = 'schema_per_client'
      AND database_name = 'jboot_identity'
      AND schema_name = 'client_jboot';

    UPDATE database_refs
    SET status = 'disabled',
        metadata = metadata || '{"disabled_reason":"superseded_by_client_jboot"}'::jsonb,
        updated_at = now()
    WHERE application_id = v_application_id
      AND client_id = v_jboot_client_id
      AND strategy = 'schema_per_client'
      AND database_name = 'jboot_identity'
      AND COALESCE(schema_name, '') <> 'client_jboot';

    IF v_database_ref_id IS NULL THEN
        INSERT INTO database_refs (
            application_id,
            client_id,
            strategy,
            connection_name,
            database_name,
            schema_name,
            metadata
        )
        VALUES (
            v_application_id,
            v_jboot_client_id,
            'schema_per_client',
            'postgres.identity',
            'jboot_identity',
            'client_jboot',
            '{"purpose":"local-dev"}'::jsonb
        );
    ELSE
        UPDATE database_refs
        SET connection_name = 'postgres.identity',
            status = 'active',
            metadata = '{"purpose":"local-dev"}'::jsonb
        WHERE id = v_database_ref_id;
    END IF;
END $$;
