\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Responsavel automatico do card de entrada (ADR 019, decisao 16, complemento de 2026-10-29): o card
-- criado na confirmacao da validacao recebe como responsaveis todos os responsaveis do escritorio
-- (`kanban_user_offices.is_responsible`). Quem nao e membro ativo do board ou nao ve o card fica de fora.
-- `intake_assignees` guarda o resultado para a tela: {"assigned": [identity_id...],
-- "skipped": [{"identityId", "reason"}], "error"?}. Sem nome nem dado pessoal.
--
-- Migration aditiva e idempotente.

ALTER TABLE kanban_customer_validation_runs
    ADD COLUMN IF NOT EXISTS intake_assignees jsonb;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kanban_customer_validation_runs_intake_assignees_check'
                   AND conrelid = 'kanban_customer_validation_runs'::regclass) THEN
        ALTER TABLE kanban_customer_validation_runs
            ADD CONSTRAINT kanban_customer_validation_runs_intake_assignees_check CHECK (
                intake_assignees IS NULL
                OR (jsonb_typeof(intake_assignees) = 'object' AND pg_column_size(intake_assignees) <= 8192)
            );
    END IF;
END $$;
