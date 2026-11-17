\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 13 (docs/product/kanban-sprints.md): o log de disparo das automacoes
-- de e-mail vira outbox duravel. A intencao nasce no banco (derivada do evento
-- do card + regras ativas); o Valkey so entrega o id. Retentativa e DLQ ficam
-- no banco: pending -> processing -> sent | skipped | pending (nova tentativa)
-- | failed (terminal, reprocessavel pela tela).

ALTER TABLE kanban_automation_dispatch_log
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE kanban_automation_dispatch_log
  DROP CONSTRAINT IF EXISTS kanban_automation_dispatch_log_status_check;

ALTER TABLE kanban_automation_dispatch_log
  ADD CONSTRAINT kanban_automation_dispatch_log_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed'));

-- Linhas presas em processing antes desta sprint nunca seriam retomadas pelo
-- fluxo antigo; viram falha visivel (reprocessavel) em vez de reenvio surpresa.
UPDATE kanban_automation_dispatch_log
SET status = 'failed', last_error = 'stuck_before_outbox', updated_at = now()
WHERE status = 'processing' AND updated_at < now() - interval '1 hour';

CREATE INDEX IF NOT EXISTS kanban_automation_dispatch_log_due_idx
  ON kanban_automation_dispatch_log (client_id, status, next_attempt_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS kanban_automation_dispatch_log_failed_idx
  ON kanban_automation_dispatch_log (client_id, updated_at DESC)
  WHERE status = 'failed';

-- Varredura de recuperacao: eventos de sistema recentes do tenant.
CREATE INDEX IF NOT EXISTS kanban_card_activities_system_recent_idx
  ON kanban_card_activities (client_id, created_at)
  WHERE type = 'system_event';

-- Envio por destinatario: retentativa nao reenvia a quem ja recebeu.
CREATE TABLE IF NOT EXISTS kanban_automation_dispatch_recipients (
  dispatch_id uuid NOT NULL REFERENCES kanban_automation_dispatch_log(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dispatch_id, identity_id)
);
