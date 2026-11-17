\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Unificacao com a conclusao explicita da IA (docs/product/flow-branch-unification.md, item C;
-- docs/product/flow-ai-completion-sprints.md): o "Ao concluir sem erro, mover o card para"
-- (`action_config.onSuccessMoveToColumnId` da regra "Executar agente") vira uma regra propria
-- `ai_completed -> move_card` na mesma coluna, com o mesmo dono e o mesmo destino.
--
-- - Regra equivalente ja existente (mesmo board, coluna e destino) e reaproveitada: fica ativa quando a
--   regra de origem esta ativa. Senao, cria uma nova com o estado da regra de origem.
-- - Depois, `onSuccessMoveToColumnId` sai de todas as regras.
--
-- Migration idempotente.
BEGIN;

WITH sources AS (
  SELECT r.client_id, r.board_id, r.board_column_id, r.created_by_identity_id, r.is_active,
         r.action_config->>'onSuccessMoveToColumnId' AS target
  FROM kanban_column_automation_rules r
  WHERE r.action_type = 'execute_ai_agent' AND r.action_config ? 'onSuccessMoveToColumnId'
)
UPDATE kanban_column_automation_rules m
SET is_active = true, updated_at = NOW()
FROM sources s
WHERE s.is_active
  AND m.client_id = s.client_id AND m.board_id = s.board_id AND m.board_column_id = s.board_column_id
  AND m.trigger_type = 'ai_completed' AND m.action_type = 'move_card'
  AND m.action_config->>'toBoardColumnId' = s.target
  AND NOT m.is_active;

INSERT INTO kanban_column_automation_rules
  (client_id, board_id, board_column_id, trigger_type, action_type, recipient_role, action_config, trigger_config,
   created_by_identity_id, is_active)
SELECT DISTINCT ON (r.client_id, r.board_id, r.board_column_id, r.action_config->>'onSuccessMoveToColumnId')
  r.client_id, r.board_id, r.board_column_id, 'ai_completed', 'move_card', NULL,
  jsonb_build_object('toBoardColumnId', r.action_config->>'onSuccessMoveToColumnId'), '{}'::jsonb,
  r.created_by_identity_id, r.is_active
FROM kanban_column_automation_rules r
WHERE r.action_type = 'execute_ai_agent' AND r.action_config ? 'onSuccessMoveToColumnId'
  AND NOT EXISTS (
    SELECT 1 FROM kanban_column_automation_rules m
    WHERE m.client_id = r.client_id AND m.board_id = r.board_id AND m.board_column_id = r.board_column_id
      AND m.trigger_type = 'ai_completed' AND m.action_type = 'move_card'
      AND m.action_config->>'toBoardColumnId' = r.action_config->>'onSuccessMoveToColumnId'
  )
ORDER BY r.client_id, r.board_id, r.board_column_id, r.action_config->>'onSuccessMoveToColumnId', r.is_active DESC;

UPDATE kanban_column_automation_rules
SET action_config = action_config - 'onSuccessMoveToColumnId', updated_at = NOW()
WHERE action_config ? 'onSuccessMoveToColumnId';

COMMIT;
