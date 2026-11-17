\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Liberacao automatica do botao Validar quando a rotina falha (2026-10-26):
-- `picked_up_at` marca quando a rotina leu o pedido pelo conector. Sem leitura em poucos minutos,
-- a rotina nao alcancou o Flow (tunel, conector ou autorizacao) e o pedido expira sozinho.
BEGIN;
ALTER TABLE kanban_customer_validation_runs ADD COLUMN IF NOT EXISTS picked_up_at timestamptz NULL;
COMMIT;
