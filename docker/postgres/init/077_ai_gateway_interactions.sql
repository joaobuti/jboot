\connect jboot_ai_gateway
BEGIN;

ALTER TABLE ai_agent_versions
  ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'json_schema';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_agent_versions_response_mode_check'
      AND conrelid = 'ai_agent_versions'::regclass
  ) THEN
    ALTER TABLE ai_agent_versions
      ADD CONSTRAINT ai_agent_versions_response_mode_check
      CHECK (response_mode IN ('text', 'json_schema'));
  END IF;
END $$;

UPDATE ai_provider_catalog
SET status = CASE provider WHEN 'openai' THEN 'active' ELSE 'disabled' END,
    updated_at = NOW()
WHERE provider IN ('openai', 'anthropic');

COMMIT;

\connect jboot_identity
UPDATE entitlements e
SET scopes = (
  SELECT ARRAY(
    SELECT DISTINCT value
    FROM unnest(e.scopes || ARRAY['ai:execute']) value
  )
)
FROM applications a
WHERE a.id = e.application_id
  AND a.slug = 'flow'
  AND e.status = 'active';
