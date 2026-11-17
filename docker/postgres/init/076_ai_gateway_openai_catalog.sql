\connect jboot_ai_gateway
INSERT INTO ai_provider_catalog (provider,label,capabilities,status)
VALUES ('openai','OpenAI (GPT)','["credential-test","model-catalog"]'::jsonb,'active')
ON CONFLICT (provider) DO UPDATE SET label=EXCLUDED.label,capabilities=EXCLUDED.capabilities,status=EXCLUDED.status,updated_at=NOW();
