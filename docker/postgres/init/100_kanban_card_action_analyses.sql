\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Analise de Acoes com retorno estruturado (docs/product/flow-action-analysis-sprints.md, Sprint A1;
-- ADR 019, decisao 18):
--
-- - `kanban_card_action_analyses`: um registro por execucao da rotina (`automation_run_id`, unico),
--   vinculado ao card e ao cliente. `status` concluida | nao_concluida (motivo em `failure_reason`).
--   O card anda pelas regras `ai_completed -> move_card` (092), nao por esta tabela.
-- - `kanban_card_action_analysis_actions`: cada linha "Acao" de um bloco do cliente e uma peticao
--   inicial possivel. `contracts` guarda os contratos da acao como vieram do extrato.
-- - `kanban_ai_automation_outbox.picked_up_at`: primeira chamada da rotina pelo conector; sem ela em
--   poucos minutos a execucao expira (mesmo criterio do botao Validar, migration 099).
--
-- Migration aditiva e idempotente.
BEGIN;

ALTER TABLE kanban_ai_automation_outbox ADD COLUMN IF NOT EXISTS picked_up_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS kanban_card_action_analyses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards (id),
    customer_id uuid NOT NULL,
    automation_run_id uuid NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('concluida', 'nao_concluida')),
    failure_reason varchar(1000) NULL,
    holder_name varchar(200) NULL,
    benefit_number varchar(60) NULL,
    statement_date varchar(60) NULL,
    action_count integer NOT NULL CHECK (action_count >= 0),
    submitted_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT kanban_card_action_analyses_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_card_action_analyses_run_key UNIQUE (client_id, automation_run_id),
    CONSTRAINT kanban_card_action_analyses_failure_reason_check
      CHECK ((status = 'nao_concluida') = (failure_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS kanban_card_action_analyses_card_idx
    ON kanban_card_action_analyses (client_id, card_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kanban_card_action_analysis_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    analysis_id uuid NOT NULL,
    block varchar(8) NOT NULL CHECK (block IN ('caixa', 'e', 'a', 'b', 'c', 'd')),
    position integer NOT NULL CHECK (position >= 1),
    bank varchar(200) NOT NULL,
    year varchar(20) NULL,
    root_contract varchar(120) NULL,
    observations varchar(2000) NULL,
    contracts jsonb NOT NULL,
    CONSTRAINT kanban_card_action_analysis_actions_analysis_fkey
        FOREIGN KEY (client_id, analysis_id) REFERENCES kanban_card_action_analyses (client_id, id),
    CONSTRAINT kanban_card_action_analysis_actions_position_key UNIQUE (client_id, analysis_id, block, position)
);

-- Unificacao com a conclusao explicita da IA (flow-branch-unification.md): o movimento saiu daqui.
ALTER TABLE kanban_card_action_analyses DROP COLUMN IF EXISTS move_outcome;
ALTER TABLE kanban_card_action_analyses DROP COLUMN IF EXISTS move_detail;
ALTER TABLE kanban_card_action_analyses DROP COLUMN IF EXISTS target_column_id;

COMMIT;
