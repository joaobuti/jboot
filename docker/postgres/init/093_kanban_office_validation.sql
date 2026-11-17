\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Validacao por conta do escritorio (ADR 018; docs/product/flow-customer-documents-sprints.md, S4).
--
-- - `kanban_user_offices.is_responsible`: responsavel do escritorio. E quem
--   conecta o conector do Flow na conta Claude do escritorio; o parecer de uma
--   validacao do escritorio so e aceito de um responsavel dele.
-- - `kanban_customer_validation_office_settings`: agente de rotina da conta
--   Claude de cada escritorio, configurado pelo `flow:admin` (dono do agente no
--   gateway). Sem linha para o escritorio, vale a configuracao central
--   (`kanban_customer_validation_settings`).
-- - `kanban_customer_validation_runs.office_id`: escritorio que recebeu o
--   pedido; NULO = conta principal.
--
-- Migration aditiva e idempotente.

ALTER TABLE kanban_user_offices
    ADD COLUMN IF NOT EXISTS is_responsible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS kanban_user_offices_responsible_idx
    ON kanban_user_offices (client_id, office_id)
    WHERE is_responsible;

CREATE TABLE IF NOT EXISTS kanban_customer_validation_office_settings (
    client_id uuid NOT NULL,
    office_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    agent_owner_identity_id uuid NOT NULL,
    updated_by_identity_id uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, office_id),
    CONSTRAINT kanban_customer_validation_office_settings_office_fk
        FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id)
);

ALTER TABLE kanban_customer_validation_runs
    ADD COLUMN IF NOT EXISTS office_id uuid NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kanban_customer_validation_runs_office_fk') THEN
        ALTER TABLE kanban_customer_validation_runs
            ADD CONSTRAINT kanban_customer_validation_runs_office_fk
            FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id);
    END IF;
END $$;
