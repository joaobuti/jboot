\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_column_automation_rules_trigger_type_check;
ALTER TABLE kanban_column_automation_rules ADD CONSTRAINT kanban_column_automation_rules_trigger_type_check
  CHECK (trigger_type IN ('column_entered','column_left','due_date_approaching','card_stale','juridico_process_moved','ai_completed'));
ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_column_automation_rules_action_type_check;
ALTER TABLE kanban_column_automation_rules ADD CONSTRAINT kanban_column_automation_rules_action_type_check
  CHECK (action_type IN ('send_email_notification','execute_ai_agent','move_card'));
ALTER TABLE kanban_column_automation_rules DROP CONSTRAINT IF EXISTS kanban_automation_action_shape_check;
ALTER TABLE kanban_column_automation_rules ADD CONSTRAINT kanban_automation_action_shape_check
  CHECK ((action_type = 'send_email_notification' AND recipient_role IS NOT NULL)
      OR (action_type IN ('execute_ai_agent','move_card') AND recipient_role IS NULL));
ALTER TABLE kanban_ai_automation_outbox DROP CONSTRAINT IF EXISTS kanban_ai_automation_outbox_status_check;
ALTER TABLE kanban_ai_automation_outbox ADD CONSTRAINT kanban_ai_automation_outbox_status_check
  CHECK (status IN ('pending','processing','dispatched','completed','review_required','awaiting_confirmation','failed'));

CREATE TABLE IF NOT EXISTS kanban_movement_automation_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  automation_rule_id uuid NOT NULL REFERENCES kanban_column_automation_rules(id),
  board_id uuid NOT NULL REFERENCES kanban_boards(id),
  board_column_id uuid NOT NULL REFERENCES kanban_board_columns(id),
  card_id uuid NOT NULL REFERENCES kanban_cards(id),
  source_key text NOT NULL,
  source_activity_id uuid REFERENCES kanban_card_activities(id),
  destination_column_id uuid NOT NULL REFERENCES kanban_board_columns(id),
  owner_identity_id uuid NOT NULL,
  automation_depth integer NOT NULL DEFAULT 0 CHECK (automation_depth BETWEEN 0 AND 11),
  root_activity_id uuid,
  claim_token uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','skipped','failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, automation_rule_id, card_id, source_key)
);
CREATE INDEX IF NOT EXISTS kanban_movement_outbox_due ON kanban_movement_automation_outbox(client_id,next_attempt_at)
  WHERE status IN ('pending','processing');
