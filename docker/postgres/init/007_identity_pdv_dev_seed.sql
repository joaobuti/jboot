\set ON_ERROR_STOP on
\connect jboot_identity

DO $$
DECLARE
    v_identity_id uuid;
    v_test_identity_id uuid;
    v_client_id uuid;
    v_demo_client_id uuid;
    v_application_id uuid;
    v_database_id uuid;
    v_database_ref_id uuid;
BEGIN
    SELECT id INTO v_identity_id
    FROM identities
    WHERE document_type = 'cpf' AND document_number = '00000000191';

    IF v_identity_id IS NULL THEN
        INSERT INTO identities (document_type, document_number, display_name, email)
        VALUES ('cpf', '00000000191', 'Operador Senior', 'operador@example.local')
        RETURNING id INTO v_identity_id;
    ELSE
        UPDATE identities
        SET display_name = 'Operador Senior',
            email = 'operador@example.local',
            status = 'active'
        WHERE id = v_identity_id;
    END IF;

    INSERT INTO credentials (identity_id, credential_type, credential_ref, secret_hash)
    VALUES (
        v_identity_id,
        'password',
        'local',
        '$2b$12$KVChOcBWq8O2HtcdsrZgnuQj1kGhsduoOjwEZ/1Vwuk121cquuP2W'
    )
    ON CONFLICT (identity_id, credential_type, credential_ref)
    DO UPDATE SET secret_hash = EXCLUDED.secret_hash, status = 'active';

    SELECT id INTO v_client_id
    FROM clients
    WHERE document_type = 'cnpj' AND document_number = '63784101000110';

    IF v_client_id IS NULL THEN
        INSERT INTO clients (client_type, document_type, document_number, legal_name, trade_name)
        VALUES ('company', 'cnpj', '63784101000110', 'JBOOT LTDA', 'JBoot')
        RETURNING id INTO v_client_id;
    ELSE
        UPDATE clients
        SET client_type = 'company',
            legal_name = 'JBOOT LTDA',
            trade_name = 'JBoot',
            status = 'active'
        WHERE id = v_client_id;
    END IF;

    INSERT INTO applications (slug, name, token_audience)
    VALUES ('pdv', 'PDV', 'app:pdv')
    ON CONFLICT (slug)
    DO UPDATE SET name = EXCLUDED.name,
                  token_audience = EXCLUDED.token_audience,
                  status = 'active'
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
        v_client_id,
        v_application_id,
        'active',
        'pdv-dev',
        'local-dev',
        '{"environment":"local","launchUrl":"http://localhost:3002/pdv","webUrl":"http://localhost:3002"}'::jsonb
    )
    ON CONFLICT (client_id, application_id)
    DO UPDATE SET status = 'active',
                  plan_code = EXCLUDED.plan_code,
                  billing_ref = EXCLUDED.billing_ref,
                  config = EXCLUDED.config,
                  updated_at = now();

    INSERT INTO memberships (identity_id, client_id, roles)
    VALUES (v_identity_id, v_client_id, ARRAY['client_admin', 'global_master'])
    ON CONFLICT (identity_id, client_id)
    DO UPDATE SET roles = EXCLUDED.roles, status = 'active';

    INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles)
    VALUES (
        v_identity_id,
        v_client_id,
        v_application_id,
        ARRAY[
            'pdv:admin:read',
            'pdv:admin:write',
            'pdv:inventory:read',
            'pdv:inventory:write',
            'pdv:operators:manage',
            'pdv:sales:read',
            'pdv:sales:write',
            'pdv:cashier:read',
            'pdv:cashier:write',
            'pdv:comanda:cozinha',
            'pdv:comanda:bar',
            'pdv:comanda:balcao',
            'users:manage'
        ],
        ARRAY['client_admin', 'pdv_admin', 'global_master']
    )
    ON CONFLICT (identity_id, client_id, application_id)
    DO UPDATE SET scopes = EXCLUDED.scopes, roles = EXCLUDED.roles, status = 'active';

    SELECT id INTO v_test_identity_id
    FROM identities
    WHERE document_type = 'cpf' AND document_number = '00011122233';

    SELECT id INTO v_demo_client_id
    FROM clients
    WHERE document_type = 'cnpj' AND document_number = '22345678000199';

    IF v_test_identity_id IS NOT NULL AND v_demo_client_id IS NOT NULL THEN
        INSERT INTO client_applications (
            client_id,
            application_id,
            status,
            plan_code,
            billing_ref,
            config
        )
        VALUES (
            v_demo_client_id,
            v_application_id,
            'active',
            'pdv-demo',
            'public-demo',
            '{"environment":"local","launchUrl":"http://localhost:3002/pdv","webUrl":"http://localhost:3002","demo":true}'::jsonb
        )
        ON CONFLICT (client_id, application_id)
        DO UPDATE SET status = 'active',
                      plan_code = EXCLUDED.plan_code,
                      billing_ref = EXCLUDED.billing_ref,
                      config = EXCLUDED.config,
                      updated_at = now();

        INSERT INTO memberships (identity_id, client_id, roles)
        VALUES (v_test_identity_id, v_demo_client_id, ARRAY['client_admin'])
        ON CONFLICT (identity_id, client_id)
        DO UPDATE SET roles = EXCLUDED.roles, status = 'active';

        INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles)
        VALUES (
            v_test_identity_id,
            v_demo_client_id,
            v_application_id,
            ARRAY[
                'pdv:admin:read',
                'pdv:admin:write',
                'pdv:inventory:read',
                'pdv:inventory:write',
                'pdv:operators:manage',
                'pdv:sales:read',
                'pdv:sales:write',
                'pdv:cashier:read',
                'pdv:cashier:write',
                'pdv:comanda:cozinha',
                'pdv:comanda:bar',
                'pdv:comanda:balcao',
                'users:manage'
            ],
            ARRAY['client_admin', 'pdv_admin']
        )
        ON CONFLICT (identity_id, client_id, application_id)
        DO UPDATE SET scopes = EXCLUDED.scopes, roles = EXCLUDED.roles, status = 'active';
    END IF;

    UPDATE entitlements
    SET status = 'revoked'
    WHERE identity_id = v_identity_id
      AND application_id = v_application_id
      AND client_id <> v_client_id;

    INSERT INTO databases (slug, name, engine, connection_name, default_database_name, metadata)
    VALUES ('pdv-postgres', 'PDV PostgreSQL', 'postgres', 'postgres.pdv', 'jboot_pdv', '{"managed_by":"jboot"}'::jsonb)
    ON CONFLICT (slug)
    DO UPDATE SET name = EXCLUDED.name,
                  connection_name = EXCLUDED.connection_name,
                  default_database_name = EXCLUDED.default_database_name,
                  status = 'active',
                  updated_at = now()
    RETURNING id INTO v_database_id;

    INSERT INTO application_databases (application_id, database_id, role, isolation_strategy, required, metadata)
    VALUES (v_application_id, v_database_id, 'primary', 'shared_db', true, '{"seed":"pdv"}'::jsonb)
    ON CONFLICT (application_id, role)
    DO UPDATE SET database_id = EXCLUDED.database_id,
                  isolation_strategy = EXCLUDED.isolation_strategy,
                  required = EXCLUDED.required,
                  status = 'active',
                  updated_at = now();

    SELECT id INTO v_database_ref_id
    FROM database_refs
    WHERE application_id = v_application_id
      AND client_id IS NULL
      AND strategy = 'shared_db'
      AND database_name = 'jboot_pdv'
      AND schema_name IS NULL
    LIMIT 1;

    IF v_database_ref_id IS NULL THEN
        INSERT INTO database_refs (
            application_id,
            client_id,
            database_id,
            strategy,
            connection_name,
            database_name,
            schema_name,
            status,
            metadata
        )
        VALUES (
            v_application_id,
            NULL,
            v_database_id,
            'shared_db',
            'postgres.pdv',
            'jboot_pdv',
            NULL,
            'active',
            '{"purpose":"local-dev","tenant_column":"client_id"}'::jsonb
        );
    ELSE
        UPDATE database_refs
        SET database_id = v_database_id,
            connection_name = 'postgres.pdv',
            status = 'active',
            metadata = '{"purpose":"local-dev","tenant_column":"client_id"}'::jsonb,
            updated_at = now()
        WHERE id = v_database_ref_id;
    END IF;
END $$;
