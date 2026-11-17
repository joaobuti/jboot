-- svc-jboot-ai-gateway: encrypted BYOK credential vault and internal capability.

\connect postgres
SELECT 'CREATE DATABASE jboot_ai_gateway'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jboot_ai_gateway')\gexec

\connect jboot_ai_gateway
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ai_provider_catalog (
  provider TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  credential_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_schema_version > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_provider_catalog (provider, label, capabilities, status)
VALUES ('anthropic', 'Claude (Anthropic)', '["credential-test","model-catalog"]'::jsonb, 'active')
ON CONFLICT (provider) DO UPDATE SET label=EXCLUDED.label, capabilities=EXCLUDED.capabilities, status=EXCLUDED.status, updated_at=NOW();

CREATE TABLE IF NOT EXISTS ai_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  owner_identity_id UUID NOT NULL,
  provider TEXT NOT NULL REFERENCES ai_provider_catalog(provider),
  ciphertext BYTEA,
  nonce BYTEA,
  auth_tag BYTEA,
  encryption_key_version INTEGER NOT NULL CHECK (encryption_key_version > 0),
  last4 VARCHAR(4) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_validation', 'active', 'invalid', 'revoked')),
  validated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, owner_identity_id, provider),
  CHECK ((status = 'revoked') OR (ciphertext IS NOT NULL AND nonce IS NOT NULL AND auth_tag IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_ai_credentials_owner ON ai_credentials (client_id, owner_identity_id);

CREATE TABLE IF NOT EXISTS ai_credential_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL,
  client_id UUID NOT NULL,
  owner_identity_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'tested', 'revoked')),
  outcome TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_credential_audit_scope ON ai_credential_audit (client_id, owner_identity_id, occurred_at DESC);

\connect jboot_identity
INSERT INTO capability_registry (slug, label, description, service_name)
VALUES ('ai-gateway', 'Gateway de IA', 'Credenciais BYOK, agentes e execucoes de IA provider-neutral', 'svc-jboot-ai-gateway')
ON CONFLICT (slug) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description, service_name=EXCLUDED.service_name, active=true;
