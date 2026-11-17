\connect jboot_ai_gateway

CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL, owner_identity_id UUID NOT NULL,
  application_slug VARCHAR(80) NOT NULL, credential_id UUID NOT NULL REFERENCES ai_credentials(id),
  provider VARCHAR(64) NOT NULL, name VARCHAR(120) NOT NULL, description VARCHAR(500), model VARCHAR(120) NOT NULL,
  external_reference VARCHAR(255), active_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','inactive','deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id,owner_identity_id,application_slug,name)
);
CREATE INDEX IF NOT EXISTS idx_ai_agents_scope ON ai_agents(client_id,owner_identity_id,application_slug,status);

CREATE TABLE IF NOT EXISTS ai_agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), agent_id UUID NOT NULL REFERENCES ai_agents(id), version INTEGER NOT NULL,
  system_prompt_ciphertext BYTEA NOT NULL, nonce BYTEA NOT NULL, auth_tag BYTEA NOT NULL,
  encryption_key_version INTEGER NOT NULL, output_schema_json JSONB NOT NULL, content_sha256 CHAR(64) NOT NULL,
  created_by_identity_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(agent_id,version)
);

\connect jboot_identity
UPDATE entitlements e SET scopes=(SELECT ARRAY(SELECT DISTINCT value FROM unnest(e.scopes || ARRAY['ai:credentials:manage','ai:agents:manage']) value))
FROM applications a WHERE a.id=e.application_id AND a.slug='flow' AND e.status='active';
