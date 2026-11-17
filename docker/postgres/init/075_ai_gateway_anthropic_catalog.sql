\connect jboot_ai_gateway
BEGIN;
INSERT INTO ai_provider_catalog (provider, label, capabilities, status)
VALUES ('anthropic', 'Claude (Anthropic)', '["credential-test","model-catalog"]'::jsonb, 'active')
ON CONFLICT (provider) DO UPDATE SET label=EXCLUDED.label, capabilities=EXCLUDED.capabilities, status=EXCLUDED.status, updated_at=NOW();

-- Keep historical references; erase only obsolete simulator credential material.
WITH revoked AS (
  UPDATE ai_credentials SET status='revoked',ciphertext=NULL,nonce=NULL,auth_tag=NULL,
    revoked_at=NOW(),updated_at=NOW()
  WHERE provider='fake' AND status <> 'revoked'
  RETURNING id,client_id,owner_identity_id
)
INSERT INTO ai_credential_audit (credential_id,client_id,owner_identity_id,event_type,outcome)
SELECT id,client_id,owner_identity_id,'revoked','simulator_retired' FROM revoked;
UPDATE ai_agents SET status='inactive',updated_at=NOW() WHERE provider='fake' AND status <> 'inactive';
UPDATE ai_provider_catalog SET status='disabled',capabilities='[]'::jsonb,updated_at=NOW() WHERE provider='fake';
COMMIT;
