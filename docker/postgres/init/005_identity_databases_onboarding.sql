\set ON_ERROR_STOP on
\connect jboot_identity

CREATE TABLE IF NOT EXISTS databases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    engine text NOT NULL CHECK (engine IN ('postgres', 'mongodb', 'mysql', 'mssql', 'clickhouse', 'qdrant')),
    connection_name text NOT NULL,
    default_database_name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'migrating')),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS application_databases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES applications(id),
    database_id uuid REFERENCES databases(id),
    role text NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'read_replica', 'analytics', 'audit', 'vector')),
    isolation_strategy text NOT NULL CHECK (isolation_strategy IN ('none', 'shared_db', 'schema_per_client', 'dedicated_database')),
    required boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (application_id, role)
);

ALTER TABLE database_refs
    ADD COLUMN IF NOT EXISTS database_id uuid REFERENCES databases(id),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE database_refs
    DROP CONSTRAINT IF EXISTS database_refs_status_check;

ALTER TABLE database_refs
    ADD CONSTRAINT database_refs_status_check
    CHECK (status IN ('provisioning', 'active', 'disabled', 'migrating', 'failed'));

CREATE INDEX IF NOT EXISTS databases_status_idx ON databases(status);
CREATE INDEX IF NOT EXISTS application_databases_application_idx ON application_databases(application_id, status);
CREATE INDEX IF NOT EXISTS database_refs_database_idx ON database_refs(database_id, status);

WITH upsert_database AS (
    INSERT INTO databases (slug, name, engine, connection_name, default_database_name, metadata)
    VALUES ('identity-postgres', 'Identity PostgreSQL', 'postgres', 'postgres.identity', 'jboot_identity', '{"managed_by":"jboot"}'::jsonb)
    ON CONFLICT (slug)
    DO UPDATE SET name = EXCLUDED.name,
                  connection_name = EXCLUDED.connection_name,
                  default_database_name = EXCLUDED.default_database_name,
                  status = 'active',
                  updated_at = now()
    RETURNING id
),
identity_app AS (
    SELECT id FROM applications WHERE slug = 'identity-admin'
)
INSERT INTO application_databases (application_id, database_id, role, isolation_strategy, required, metadata)
SELECT identity_app.id, upsert_database.id, 'primary', 'schema_per_client', true, '{"seed":"identity-admin"}'::jsonb
FROM identity_app, upsert_database
ON CONFLICT (application_id, role)
DO UPDATE SET database_id = EXCLUDED.database_id,
              isolation_strategy = EXCLUDED.isolation_strategy,
              required = EXCLUDED.required,
              status = 'active',
              updated_at = now();

UPDATE database_refs dr
SET database_id = d.id,
    updated_at = now()
FROM databases d
WHERE d.slug = 'identity-postgres'
  AND dr.connection_name = 'postgres.identity'
  AND dr.database_name = 'jboot_identity'
  AND dr.database_id IS NULL;
