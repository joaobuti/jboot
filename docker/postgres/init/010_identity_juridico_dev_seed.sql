\set ON_ERROR_STOP on
\connect jboot_identity

DO $$
DECLARE
    v_senior_identity_id uuid;
    v_test_identity_id uuid;
    v_client_id      uuid;
    v_demo_client_id uuid;
    v_application_id uuid;
    v_database_id    uuid;
    v_database_ref_id uuid;
BEGIN
    -- Client canonico do Operador Senior/JBOOT LTDA.
    SELECT id INTO v_client_id
    FROM clients
    WHERE document_type = 'cnpj' AND document_number = '63784101000110';

    IF v_client_id IS NULL THEN
        INSERT INTO clients (client_type, document_type, document_number, legal_name, trade_name)
        VALUES ('company', 'cnpj', '63784101000110', 'JBOOT LTDA', 'JBoot')
        RETURNING id INTO v_client_id;
    ELSE
        UPDATE clients
        SET legal_name  = 'JBOOT LTDA',
            trade_name  = 'JBoot',
            status      = 'active'
        WHERE id = v_client_id;
    END IF;

    SELECT id INTO v_demo_client_id
    FROM clients
    WHERE document_type = 'cnpj' AND document_number = '22345678000199';

    -- Application
    INSERT INTO applications (slug, name, token_audience)
    VALUES ('juridico', 'Jurídico', 'app:juridico')
    ON CONFLICT (slug)
    DO UPDATE SET name           = EXCLUDED.name,
                  token_audience = EXCLUDED.token_audience,
                  status         = 'active'
    RETURNING id INTO v_application_id;

    -- Client <-> Application contract
    INSERT INTO client_applications (client_id, application_id, status, plan_code, billing_ref, config)
    VALUES (
        v_client_id,
        v_application_id,
        'active',
        'juridico-dev',
        'local-dev',
        '{"environment":"local","launchUrl":"http://localhost:3002/juridico","webUrl":"http://localhost:3002"}'::jsonb
    )
    ON CONFLICT (client_id, application_id)
    DO UPDATE SET status      = 'active',
                  plan_code   = EXCLUDED.plan_code,
                  billing_ref = EXCLUDED.billing_ref,
                  config      = EXCLUDED.config,
                  updated_at  = now();

    SELECT id INTO v_senior_identity_id
    FROM identities
    WHERE document_type = 'cpf' AND document_number = '00000000191';

    IF v_senior_identity_id IS NOT NULL THEN
        INSERT INTO memberships (identity_id, client_id, roles)
        VALUES (v_senior_identity_id, v_client_id, ARRAY['client_admin', 'global_master'])
        ON CONFLICT (identity_id, client_id)
        DO UPDATE SET roles = EXCLUDED.roles, status = 'active';

        INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles)
        VALUES (
            v_senior_identity_id,
            v_client_id,
            v_application_id,
            ARRAY['juridico:read', 'juridico:write', 'juridico:admin', 'users:manage'],
            ARRAY['client_admin', 'juridico_admin', 'global_master']
        )
        ON CONFLICT (identity_id, client_id, application_id)
        DO UPDATE SET scopes = EXCLUDED.scopes, roles = EXCLUDED.roles, status = 'active';

        UPDATE entitlements
        SET status = 'revoked'
        WHERE identity_id = v_senior_identity_id
          AND application_id = v_application_id
          AND client_id <> v_client_id;
    END IF;

    SELECT id INTO v_test_identity_id
    FROM identities
    WHERE document_type = 'cpf' AND document_number = '00011122233';

    IF v_test_identity_id IS NOT NULL AND v_demo_client_id IS NOT NULL THEN
        INSERT INTO client_applications (client_id, application_id, status, plan_code, billing_ref, config)
        VALUES (
            v_demo_client_id,
            v_application_id,
            'active',
            'juridico-demo',
            'public-demo',
            '{"environment":"local","launchUrl":"http://localhost:3002/juridico","webUrl":"http://localhost:3002","demo":true}'::jsonb
        )
        ON CONFLICT (client_id, application_id)
        DO UPDATE SET status      = 'active',
                      plan_code   = EXCLUDED.plan_code,
                      billing_ref = EXCLUDED.billing_ref,
                      config      = EXCLUDED.config,
                      updated_at  = now();

        INSERT INTO memberships (identity_id, client_id, roles)
        VALUES (v_test_identity_id, v_demo_client_id, ARRAY['client_admin'])
        ON CONFLICT (identity_id, client_id)
        DO UPDATE SET roles = EXCLUDED.roles, status = 'active';

        INSERT INTO entitlements (identity_id, client_id, application_id, scopes, roles)
        VALUES (
            v_test_identity_id,
            v_demo_client_id,
            v_application_id,
            ARRAY['juridico:read', 'juridico:write', 'juridico:admin', 'users:manage'],
            ARRAY['client_admin', 'juridico_admin']
        )
        ON CONFLICT (identity_id, client_id, application_id)
        DO UPDATE SET scopes = EXCLUDED.scopes, roles = EXCLUDED.roles, status = 'active';
    END IF;

    -- Database catalog entry
    INSERT INTO databases (slug, name, engine, connection_name, default_database_name, metadata)
    VALUES (
        'juridico-postgres',
        'Jurídico PostgreSQL',
        'postgres',
        'postgres.juridico',
        'jboot_juridico_advocacia_dev',
        '{"managed_by":"jboot","isolation":"dedicated_database","tenant_column":"client_id"}'::jsonb
    )
    ON CONFLICT (slug)
    DO UPDATE SET name                 = EXCLUDED.name,
                  connection_name      = EXCLUDED.connection_name,
                  default_database_name = EXCLUDED.default_database_name,
                  status               = 'active',
                  updated_at           = now()
    RETURNING id INTO v_database_id;

    -- Application <-> Database
    INSERT INTO application_databases (application_id, database_id, role, isolation_strategy, required, metadata)
    VALUES (v_application_id, v_database_id, 'primary', 'dedicated_database', true, '{"seed":"juridico","tenant_column":"client_id"}'::jsonb)
    ON CONFLICT (application_id, role)
    DO UPDATE SET database_id        = EXCLUDED.database_id,
                  isolation_strategy = EXCLUDED.isolation_strategy,
                  required           = EXCLUDED.required,
                  status             = 'active',
                  updated_at         = now();

    UPDATE database_refs
    SET status = 'disabled',
        metadata = metadata || '{"disabled_reason":"juridico now requires dedicated database per client"}'::jsonb,
        updated_at = now()
    WHERE application_id = v_application_id
      AND strategy = 'shared_db';

    -- Database ref dedicado por cliente. client_id continua obrigatório nas tabelas para defesa e auditoria.
    SELECT id INTO v_database_ref_id
    FROM database_refs
    WHERE application_id = v_application_id
      AND client_id = v_client_id
      AND strategy = 'dedicated_db'
      AND database_name = 'jboot_juridico_advocacia_dev'
    LIMIT 1;

    IF v_database_ref_id IS NULL THEN
        INSERT INTO database_refs (
            application_id, client_id, database_id,
            strategy, connection_name, database_name, schema_name,
            status, metadata
        )
        VALUES (
            v_application_id, v_client_id, v_database_id,
            'dedicated_db', 'postgres.juridico', 'jboot_juridico_advocacia_dev', NULL,
            'active', '{"purpose":"local-dev","scope":"juridico-shell","tenant_column":"client_id"}'::jsonb
        );
    ELSE
        UPDATE database_refs
        SET database_id     = v_database_id,
            connection_name = 'postgres.juridico',
            database_name   = 'jboot_juridico_advocacia_dev',
            status          = 'active',
            metadata        = '{"purpose":"local-dev","scope":"juridico-shell","tenant_column":"client_id"}'::jsonb,
            updated_at      = now()
        WHERE id = v_database_ref_id;
    END IF;

    IF v_demo_client_id IS NOT NULL THEN
        SELECT id INTO v_database_ref_id
        FROM database_refs
        WHERE application_id = v_application_id
          AND client_id = v_demo_client_id
          AND strategy = 'dedicated_db'
          AND database_name = 'jboot_juridico_advocacia_dev'
        LIMIT 1;

        IF v_database_ref_id IS NULL THEN
            INSERT INTO database_refs (
                application_id, client_id, database_id,
                strategy, connection_name, database_name, schema_name,
                status, metadata
            )
            VALUES (
                v_application_id, v_demo_client_id, v_database_id,
                'dedicated_db', 'postgres.juridico', 'jboot_juridico_advocacia_dev', NULL,
                'active', '{"purpose":"local-dev","scope":"juridico-shell","tenant_column":"client_id","demo":true}'::jsonb
            );
        ELSE
            UPDATE database_refs
            SET database_id     = v_database_id,
                connection_name = 'postgres.juridico',
                database_name   = 'jboot_juridico_advocacia_dev',
                status          = 'active',
                metadata        = '{"purpose":"local-dev","scope":"juridico-shell","tenant_column":"client_id","demo":true}'::jsonb,
                updated_at      = now()
            WHERE id = v_database_ref_id;
        END IF;
    END IF;

END $$;
