\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE jboot_identity'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'jboot_identity'
)\gexec

\connect jboot_identity

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type text NOT NULL CHECK (document_type IN ('cpf', 'cnpj')),
    document_number text NOT NULL CHECK (document_number ~ '^[0-9]{11}$|^[0-9]{14}$'),
    display_name text NOT NULL,
    email citext,
    phone text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'pending', 'deleted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_type, document_number)
);

CREATE TABLE IF NOT EXISTS credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id uuid NOT NULL REFERENCES identities(id),
    credential_type text NOT NULL CHECK (credential_type IN ('password', 'magic_link', 'external_oidc', 'mfa_totp', 'mfa_webauthn')),
    credential_ref text NOT NULL,
    secret_hash text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'pending')),
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (identity_id, credential_type, credential_ref)
);

CREATE TABLE IF NOT EXISTS clients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_type text NOT NULL CHECK (client_type IN ('person', 'company', 'public_agency')),
    document_type text CHECK (document_type IN ('cpf', 'cnpj')),
    document_number text CHECK (document_number IS NULL OR document_number ~ '^[0-9]{11}$|^[0-9]{14}$'),
    legal_name text NOT NULL,
    trade_name text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_document_unique
    ON clients(document_type, document_number)
    WHERE document_type IS NOT NULL AND document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    token_audience text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deprecated')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES clients(id),
    application_id uuid NOT NULL REFERENCES applications(id),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'suspended', 'cancelled')),
    plan_code text,
    billing_ref text,
    config jsonb NOT NULL DEFAULT '{}',
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, application_id)
);

CREATE TABLE IF NOT EXISTS memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id uuid NOT NULL REFERENCES identities(id),
    client_id uuid NOT NULL REFERENCES clients(id),
    roles text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (identity_id, client_id)
);

CREATE TABLE IF NOT EXISTS entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id uuid NOT NULL REFERENCES identities(id),
    client_id uuid NOT NULL REFERENCES clients(id),
    application_id uuid NOT NULL REFERENCES applications(id),
    scopes text[] NOT NULL DEFAULT '{}',
    roles text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (identity_id, client_id, application_id),
    FOREIGN KEY (client_id, application_id) REFERENCES client_applications(client_id, application_id)
);

CREATE TABLE IF NOT EXISTS database_refs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id uuid NOT NULL REFERENCES applications(id),
    client_id uuid REFERENCES clients(id),
    strategy text NOT NULL CHECK (strategy IN ('shared_db', 'schema_per_client', 'dedicated_db')),
    connection_name text NOT NULL,
    database_name text NOT NULL,
    schema_name text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'migrating')),
    metadata jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    -- Coluna tambem garantida por 005 (ADD COLUMN IF NOT EXISTS). Precisa
    -- existir aqui porque 003_identity_dev_seed.sql, que roda antes de 005,
    -- grava updated_at; sem ela um banco criado do zero falha no 003.
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (application_id, client_id, strategy, database_name, schema_name)
);

-- Definicao canonica em 021_identity_permission_versions.sql (que tambem faz o
-- backfill). Criada aqui porque 014_identity_flow_dev_seed.sql, que roda antes
-- de 021, ja grava nesta tabela; sem ela um banco criado do zero falha no 014.
CREATE TABLE IF NOT EXISTS identity_permission_versions (
  identity_id UUID PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_contexts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id uuid NOT NULL REFERENCES identities(id),
    client_id uuid NOT NULL REFERENCES clients(id),
    application_id uuid NOT NULL REFERENCES applications(id),
    database_ref_id uuid NOT NULL REFERENCES database_refs(id),
    jwt_id uuid NOT NULL DEFAULT gen_random_uuid(),
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    ip inet,
    user_agent text,
    device_ref text
);

CREATE TABLE IF NOT EXISTS audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at timestamptz NOT NULL DEFAULT now(),
    event_type text NOT NULL,
    identity_id uuid REFERENCES identities(id),
    client_id uuid REFERENCES clients(id),
    application_id uuid REFERENCES applications(id),
    session_context_id uuid REFERENCES session_contexts(id),
    ip inet,
    user_agent text,
    metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS identities_document_idx ON identities(document_type, document_number);
CREATE INDEX IF NOT EXISTS memberships_identity_idx ON memberships(identity_id);
CREATE INDEX IF NOT EXISTS entitlements_identity_client_idx ON entitlements(identity_id, client_id);
CREATE INDEX IF NOT EXISTS client_applications_client_idx ON client_applications(client_id, status);
CREATE INDEX IF NOT EXISTS client_applications_application_idx ON client_applications(application_id, status);
CREATE INDEX IF NOT EXISTS database_refs_lookup_idx ON database_refs(application_id, client_id, status);
CREATE INDEX IF NOT EXISTS session_contexts_identity_idx ON session_contexts(identity_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_lookup_idx ON audit_events(occurred_at DESC, event_type);
