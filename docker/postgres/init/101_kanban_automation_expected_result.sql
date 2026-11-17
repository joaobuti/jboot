\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Resultado esperado na regra "Executar agente" (ADR 020; docs/product/flow-initial-petitions-sprints.md, S1):
--
-- - `kanban_ai_automation_outbox.dispatched_at`: hora do disparo da rotina; base do teto total de
--   3 h das execucoes de Peticoes iniciais (`routine_time_limit`).
-- - `action_config.expectedResult` nas regras existentes (Q8, criterio confirmado pelo usuario):
--   - `action_analysis`: regra que ja gravou Analise de Acoes, ou rotina Claude que libera so o
--     HISCON (`extrato_beneficio`), configuracao documentada da Analise de Acoes
--     (flow-action-analysis-routine-prompt.md);
--   - `comment`: as demais.
--   Regra que ja tem `expectedResult` nao e alterada.
--
-- Migration aditiva e idempotente.
BEGIN;

ALTER TABLE kanban_ai_automation_outbox ADD COLUMN IF NOT EXISTS dispatched_at timestamptz NULL;

UPDATE kanban_column_automation_rules r
SET action_config = r.action_config || jsonb_build_object(
      'expectedResult',
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM kanban_card_action_analyses a
          JOIN kanban_ai_automation_outbox o ON o.client_id = a.client_id AND o.id = a.automation_run_id
          WHERE o.automation_rule_id = r.id
        ) THEN 'action_analysis'
        WHEN r.action_config->>'connectionMode' = 'claude_routine'
             AND r.action_config->'customerDocumentTypes' = '["extrato_beneficio"]'::jsonb THEN 'action_analysis'
        ELSE 'comment'
      END
    ),
    updated_at = NOW()
WHERE r.action_type = 'execute_ai_agent'
  AND NOT (r.action_config ? 'expectedResult');

COMMIT;
