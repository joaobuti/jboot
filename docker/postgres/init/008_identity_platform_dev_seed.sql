\set ON_ERROR_STOP on
\connect jboot_identity

DO $$
DECLARE
    v_senior_identity_id uuid;
    v_client_id uuid;
    v_application_id uuid;
    v_database_id uuid;
    v_database_ref_id uuid;
BEGIN
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
    VALUES ('platform', 'Platform', 'app:platform')
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
        'platform-dev',
        'local-dev',
        '{"environment":"local","launchUrl":"http://127.0.0.1:3002/dashboard","webUrl":"http://127.0.0.1:3002"}'::jsonb
    )
    ON CONFLICT (client_id, application_id)
    DO UPDATE SET status = 'active',
                  plan_code = EXCLUDED.plan_code,
                  billing_ref = EXCLUDED.billing_ref,
                  config = EXCLUDED.config,
                  updated_at = now();

    SELECT id INTO v_senior_identity_id
    FROM identities
    WHERE document_type = 'cpf' AND document_number = '00000000191';

    IF v_senior_identity_id IS NOT NULL THEN
        UPDATE entitlements
        SET status = 'revoked'
        WHERE identity_id = v_senior_identity_id
          AND client_id <> v_client_id
          AND application_id = v_application_id;
    END IF;

    INSERT INTO databases (slug, name, engine, connection_name, default_database_name, metadata)
    VALUES ('platform-postgres', 'Platform PostgreSQL', 'postgres', 'postgres.platform', 'jboot_identity', '{"managed_by":"jboot"}'::jsonb)
    ON CONFLICT (slug)
    DO UPDATE SET name = EXCLUDED.name,
                  connection_name = EXCLUDED.connection_name,
                  default_database_name = EXCLUDED.default_database_name,
                  status = 'active',
                  updated_at = now()
    RETURNING id INTO v_database_id;

    INSERT INTO application_databases (application_id, database_id, role, isolation_strategy, required, metadata)
    VALUES (v_application_id, v_database_id, 'primary', 'shared_db', true, '{"seed":"platform"}'::jsonb)
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
      AND database_name = 'jboot_identity'
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
            'postgres.platform',
            'jboot_identity',
            NULL,
            'active',
            '{"purpose":"local-dev","scope":"platform-shell"}'::jsonb
        );
    ELSE
        UPDATE database_refs
        SET database_id = v_database_id,
            connection_name = 'postgres.platform',
            status = 'active',
            metadata = '{"purpose":"local-dev","scope":"platform-shell"}'::jsonb,
            updated_at = now()
        WHERE id = v_database_ref_id;
    END IF;
END $$;
