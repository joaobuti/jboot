\set ON_ERROR_STOP on
\connect jboot_identity

-- Servidor OAuth 2.1 do conector Claude do Flow
-- (docs/product/kanban-claude-connector-sprints.md, Sprint C1).
-- Codigos e tokens sao opacos e so o hash SHA-256 e gravado; nada aqui
-- permite reconstruir um token emitido.

-- Pedido de autorizacao aguardando login/consentimento do usuario.
CREATE TABLE IF NOT EXISTS oauth_authorization_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    oauth_client_id text NOT NULL,
    client_name text NOT NULL,
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    scopes text[] NOT NULL,
    state text NULL,
    resource text NOT NULL,
    expires_at timestamptz NOT NULL,
    decided_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Conexao autorizada: um usuario, um tenant, um modulo, um cliente OAuth.
CREATE TABLE IF NOT EXISTS oauth_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id uuid NOT NULL REFERENCES identities(id),
    client_id uuid NOT NULL REFERENCES clients(id),
    application_id uuid NOT NULL REFERENCES applications(id),
    oauth_client_id text NOT NULL,
    client_name text NOT NULL,
    scopes text[] NOT NULL,
    resource text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NULL,
    revoked_at timestamptz NULL,
    revoked_reason text NULL CHECK (revoked_reason IS NULL OR revoked_reason IN ('user', 'refresh_reuse', 'code_reuse', 'entitlement'))
);

CREATE INDEX IF NOT EXISTS oauth_grants_owner_idx
    ON oauth_grants (identity_id, client_id, application_id)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
    code_hash bytea PRIMARY KEY,
    grant_id uuid NOT NULL REFERENCES oauth_grants(id),
    redirect_uri text NOT NULL,
    code_challenge text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
    token_hash bytea PRIMARY KEY,
    grant_id uuid NOT NULL REFERENCES oauth_grants(id),
    token_type text NOT NULL CHECK (token_type IN ('access', 'refresh')),
    expires_at timestamptz NOT NULL,
    -- refresh rotacionado: reapresentar um token consumido revoga a conexao.
    consumed_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (token_type = 'refresh' OR consumed_at IS NULL)
);

CREATE INDEX IF NOT EXISTS oauth_tokens_grant_idx ON oauth_tokens (grant_id);
