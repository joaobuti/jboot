\set ON_ERROR_STOP on
\connect jboot_identity

-- Links de uso unico para criar ou trocar a senha (docs/product/account-access-email-sprints.md,
-- Sprints 2 e 3): convite do admin do cliente (72 h) e "esqueci minha senha" (1 h). O banco guarda
-- so o hash SHA-256 do token; o token em claro existe apenas no e-mail. Gerar um novo invalida os
-- anteriores do mesmo tipo; criar a senha invalida todos os da identidade.
--
-- Idempotente. So roda sozinho em volume novo; em base existente aplicar a mao.
BEGIN;

CREATE TABLE IF NOT EXISTS identity_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('invite', 'password_reset')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  requested_ip text,
  created_by_identity_id uuid REFERENCES identities(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS identity_access_tokens_identity_idx
  ON identity_access_tokens (identity_id, purpose, created_at DESC);

-- Trocar a senha encerra os acessos do conector OAuth (refresh tokens) da identidade.
ALTER TABLE oauth_grants DROP CONSTRAINT IF EXISTS oauth_grants_revoked_reason_check;
ALTER TABLE oauth_grants
  ADD CONSTRAINT oauth_grants_revoked_reason_check
  CHECK (revoked_reason IS NULL OR revoked_reason IN ('user', 'refresh_reuse', 'code_reuse', 'entitlement', 'password_reset'));

COMMIT;
