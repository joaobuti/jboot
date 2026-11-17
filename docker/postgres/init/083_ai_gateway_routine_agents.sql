\set ON_ERROR_STOP on
\connect jboot_ai_gateway

-- Sprint 12 (docs/product/kanban-sprints.md): agent com modo de execucao.
-- `api`: credencial BYOK + modelo + prompt no JBoot (comportamento anterior).
-- `claude_routine`: prompt e modelo ficam na rotina do Claude Code do dono;
-- o JBoot guarda so a URL de disparo e o token da rotina, cifrado.
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS routine_fire_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS routine_token_ciphertext BYTEA NULL,
  ADD COLUMN IF NOT EXISTS routine_token_nonce BYTEA NULL,
  ADD COLUMN IF NOT EXISTS routine_token_auth_tag BYTEA NULL,
  ADD COLUMN IF NOT EXISTS routine_token_key_version INTEGER NULL,
  ADD COLUMN IF NOT EXISTS routine_token_last4 VARCHAR(4) NULL,
  ALTER COLUMN credential_id DROP NOT NULL,
  ALTER COLUMN model DROP NOT NULL;

ALTER TABLE ai_agents DROP CONSTRAINT IF EXISTS ai_agents_execution_mode_fields;
ALTER TABLE ai_agents ADD CONSTRAINT ai_agents_execution_mode_fields CHECK (
  (execution_mode = 'api'
    AND credential_id IS NOT NULL AND model IS NOT NULL
    AND routine_fire_url IS NULL AND routine_token_ciphertext IS NULL)
  OR
  (execution_mode = 'claude_routine'
    AND credential_id IS NULL
    -- COALESCE: CHECK com resultado NULL passaria (URL ausente).
    AND COALESCE(routine_fire_url, '') ~ '^https://api\.anthropic\.com/v1/claude_code/routines/trig_[A-Za-z0-9]+/fire$'
    AND routine_token_ciphertext IS NOT NULL AND routine_token_nonce IS NOT NULL
    AND routine_token_auth_tag IS NOT NULL AND routine_token_key_version IS NOT NULL
    AND routine_token_last4 IS NOT NULL)
);

-- Execucao por rotina e assincrona: o gateway so registra o disparo.
ALTER TABLE ai_executions
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'api',
  ADD COLUMN IF NOT EXISTS external_session_url TEXT NULL;
ALTER TABLE ai_executions DROP CONSTRAINT IF EXISTS ai_executions_status_check;
ALTER TABLE ai_executions ADD CONSTRAINT ai_executions_status_check
  CHECK (status IN ('pending','running','succeeded','failed','cancelled','dispatched'));
