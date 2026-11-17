\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 8: motor de automacao por coluna (trigger_type/action_type genericos).
-- Fundacao: trigger_type=column_entered -> action_type=send_email_notification.
-- Ver docs/product/kanban-sprint-8-gate.md e MODULE_CONTRACT.md secao
-- "Motor De Automacao Por Coluna (Sprint 8+)".

CREATE TABLE IF NOT EXISTS kanban_column_automation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    board_column_id uuid NOT NULL REFERENCES kanban_board_columns(id),
    trigger_type text NOT NULL CHECK (trigger_type IN ('column_entered')),
    action_type text NOT NULL CHECK (action_type IN ('send_email_notification')),
    recipient_role text NOT NULL CHECK (recipient_role IN ('assignee', 'creator', 'board_member')),
    action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kanban_column_automation_rules_client_idx
    ON kanban_column_automation_rules (client_id);

-- Lookup usado pelo hook de cards.service.ts::move() ao entrar numa coluna:
-- regras ativas de column_entered para a coluna de destino.
CREATE INDEX IF NOT EXISTS kanban_column_automation_rules_trigger_idx
    ON kanban_column_automation_rules (client_id, board_column_id, trigger_type, is_active);

CREATE TABLE IF NOT EXISTS kanban_automation_dispatch_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    automation_rule_id uuid NOT NULL REFERENCES kanban_column_automation_rules(id),
    card_id uuid NOT NULL REFERENCES kanban_cards(id),
    board_column_id uuid NOT NULL REFERENCES kanban_board_columns(id),
    source_activity_id uuid NOT NULL REFERENCES kanban_card_activities(id),
    status text NOT NULL CHECK (status IN ('processing', 'sent', 'failed')),
    attempt_count int NOT NULL DEFAULT 0,
    last_error text NULL,
    sent_at timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (card_id, board_column_id, automation_rule_id, source_activity_id)
);

CREATE INDEX IF NOT EXISTS kanban_automation_dispatch_log_client_idx
    ON kanban_automation_dispatch_log (client_id);
