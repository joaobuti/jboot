\connect jboot_ai_gateway

CREATE TABLE IF NOT EXISTS ai_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID NOT NULL,
  requester_identity_id UUID NOT NULL, agent_id UUID NOT NULL REFERENCES ai_agents(id),
  agent_version INTEGER NOT NULL, application_slug VARCHAR(80) NOT NULL,
  source_type VARCHAR(80) NOT NULL, source_id UUID NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL, provider VARCHAR(64) NOT NULL,
  model VARCHAR(120) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','succeeded','failed','cancelled')),
  input_sha256 CHAR(64) NOT NULL, output_sha256 CHAR(64),
  input_tokens INTEGER, output_tokens INTEGER, estimated_cost NUMERIC(16,8),
  latency_ms INTEGER, error_code VARCHAR(80), started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, application_slug, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_executions_scope ON ai_executions(client_id, application_slug, created_at DESC);
