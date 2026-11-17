\connect jboot_ai_gateway

ALTER TABLE ai_agent_versions
  ADD COLUMN IF NOT EXISTS allowed_tools_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tool_policy_version VARCHAR(40) NOT NULL DEFAULT '2026-10-15.v1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_agent_versions_allowed_tools_array'
      AND conrelid = 'ai_agent_versions'::regclass
  ) THEN
    ALTER TABLE ai_agent_versions
      ADD CONSTRAINT ai_agent_versions_allowed_tools_array
      CHECK (jsonb_typeof(allowed_tools_json) = 'array');
  END IF;
END $$;
