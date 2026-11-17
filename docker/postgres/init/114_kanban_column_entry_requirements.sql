\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Requisitos de entrada da coluna (docs/product/flow-signed-kit-sprints.md, S1): regra com acao
-- `require_to_enter` (gatilho `column_entered`, sem destinatario) e `action_config.requirements`. Nao dispara
-- nada; o Flow a consulta ao mover o card. Substitui o bloqueio do HISCON deduzido das regras de agente
-- (flow-customer-promobank-sprints.md, P1): cada coluna que aquele bloqueio barrava ganha a regra explicita
-- `customer_hiscon`, criada em nome de quem criou a regra de agente.
--
-- Migration aditiva e idempotente.
BEGIN;

ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_column_automation_rules_action_type_check;
ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_column_automation_rules_action_type_check
  CHECK (action_type IN ('send_email_notification', 'execute_ai_agent', 'move_card', 'require_to_enter'));

ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_automation_action_shape_check;
ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_automation_action_shape_check CHECK (
    (action_type = 'send_email_notification' AND recipient_role IS NOT NULL)
    OR (action_type IN ('execute_ai_agent', 'move_card', 'require_to_enter') AND recipient_role IS NULL)
  );

ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_automation_require_to_enter_check;
ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_automation_require_to_enter_check CHECK (
    action_type <> 'require_to_enter'
    OR (trigger_type = 'column_entered'
        AND jsonb_typeof(action_config->'requirements') = 'array'
        AND jsonb_array_length(action_config->'requirements') > 0)
  );

INSERT INTO kanban_column_automation_rules
  (client_id, board_id, board_column_id, trigger_type, action_type, action_config, is_active, created_by_identity_id)
SELECT DISTINCT ON (r.client_id, r.board_column_id)
       r.client_id, r.board_id, r.board_column_id, 'column_entered', 'require_to_enter',
       '{"requirements": ["customer_hiscon"]}'::jsonb, true, r.created_by_identity_id
FROM kanban_column_automation_rules r
WHERE r.is_active
  AND r.action_type = 'execute_ai_agent'
  AND r.action_config->>'connectionMode' = 'claude_routine'
  AND (r.action_config->>'expectedResult' IN ('action_analysis', 'initial_petitions')
       OR COALESCE(r.action_config->'customerDocumentTypes', '[]'::jsonb) ? 'extrato_beneficio')
  AND NOT EXISTS (
    SELECT 1 FROM kanban_column_automation_rules x
    WHERE x.client_id = r.client_id AND x.board_column_id = r.board_column_id AND x.action_type = 'require_to_enter'
  )
ORDER BY r.client_id, r.board_column_id, r.created_at;

COMMIT;
