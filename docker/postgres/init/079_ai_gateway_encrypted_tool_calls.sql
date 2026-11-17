\connect jboot_ai_gateway

ALTER TABLE ai_executions
  ADD COLUMN IF NOT EXISTS tool_calls_ciphertext BYTEA,
  ADD COLUMN IF NOT EXISTS tool_calls_nonce BYTEA,
  ADD COLUMN IF NOT EXISTS tool_calls_auth_tag BYTEA,
  ADD COLUMN IF NOT EXISTS tool_calls_key_version INTEGER;

ALTER TABLE ai_executions
  DROP CONSTRAINT IF EXISTS ai_executions_tool_calls_envelope_check;

ALTER TABLE ai_executions
  ADD CONSTRAINT ai_executions_tool_calls_envelope_check
  CHECK (
    (tool_calls_ciphertext IS NULL AND tool_calls_nonce IS NULL AND tool_calls_auth_tag IS NULL AND tool_calls_key_version IS NULL)
    OR
    (tool_calls_ciphertext IS NOT NULL AND tool_calls_nonce IS NOT NULL AND tool_calls_auth_tag IS NOT NULL AND tool_calls_key_version IS NOT NULL)
  );
