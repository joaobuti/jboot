\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

ALTER TABLE kanban_column_automation_rules
  DROP CONSTRAINT IF EXISTS kanban_column_automation_rules_action_type_check;

ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_column_automation_rules_action_type_check
  CHECK (action_type IN ('send_email_notification', 'execute_ai_agent'));

ALTER TABLE kanban_column_automation_rules
  ALTER COLUMN recipient_role DROP NOT NULL;

ALTER TABLE kanban_column_automation_rules
  DROP CONSTRAINT IF EXISTS kanban_automation_action_shape_check;

ALTER TABLE kanban_column_automation_rules
  ADD CONSTRAINT kanban_automation_action_shape_check
  CHECK (
    (action_type = 'send_email_notification' AND recipient_role IS NOT NULL)
    OR
    (action_type = 'execute_ai_agent' AND recipient_role IS NULL)
  );

CREATE TABLE IF NOT EXISTS kanban_ai_automation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  automation_rule_id UUID NOT NULL REFERENCES kanban_column_automation_rules(id),
  board_id UUID NOT NULL REFERENCES kanban_boards(id),
  board_column_id UUID NOT NULL REFERENCES kanban_board_columns(id),
  card_id UUID NOT NULL REFERENCES kanban_cards(id),
  source_activity_id UUID NOT NULL REFERENCES kanban_card_activities(id),
  requester_identity_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('column_entered', 'column_left')),
  action_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'review_required', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  ai_execution_id UUID,
  last_error VARCHAR(120),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (automation_rule_id, card_id, source_activity_id)
);

CREATE INDEX IF NOT EXISTS kanban_ai_automation_outbox_due_idx
  ON kanban_ai_automation_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE kanban_card_activities
  ADD COLUMN IF NOT EXISTS source_ai_execution_id UUID,
  ADD COLUMN IF NOT EXISTS source_ai_tool_call_id VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_card_activities_ai_effect_uq
  ON kanban_card_activities (client_id, card_id, source_ai_execution_id, source_ai_tool_call_id)
  WHERE source_ai_execution_id IS NOT NULL AND source_ai_tool_call_id IS NOT NULL;
