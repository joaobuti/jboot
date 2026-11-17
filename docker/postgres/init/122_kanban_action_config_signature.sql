\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Validar assinatura como acao da coluna (docs/product/flow-signed-kit-sprints.md, S5).
--
-- - `kanban_column_actions.config`: configuracao da acao na coluna. Hoje so `validar-assinatura` usa,
--   com `{"agentId": "<agente de rotina de quem configurou>"}`; as outras acoes ficam com `{}`.
-- - O Validador de assinatura deixa de ter configuracao propria (conta principal e por escritorio): o agente
--   vem da acao. A tabela sai sem migrar dados (decisao do usuario em 2026-11-07; so havia linha de dev).

ALTER TABLE kanban_column_actions
    ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kanban_column_actions_config_object') THEN
        ALTER TABLE kanban_column_actions
            ADD CONSTRAINT kanban_column_actions_config_object CHECK (jsonb_typeof(config) = 'object');
    END IF;
END $$;

DROP TABLE IF EXISTS kanban_signed_kit_validation_settings;
