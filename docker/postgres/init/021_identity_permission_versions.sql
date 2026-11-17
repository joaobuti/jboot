-- Sem esta conexao o arquivo rodava no banco padrao (jboot), onde nao existe
-- identities; num banco criado do zero isso quebrava 021, 014, 094 e 104.
\c jboot_identity

CREATE TABLE IF NOT EXISTS identity_permission_versions (
  identity_id UUID PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO identity_permission_versions (identity_id, version)
SELECT id, 1
FROM identities
ON CONFLICT (identity_id) DO NOTHING;

