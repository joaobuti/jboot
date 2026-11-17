\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Monitorar peticao protocolada (docs/product/flow-card-actions-sprints.md, Sprint 2).
--
-- - `protocol_number`/`protocoled_at` ja existiam (ADR 020, item 21) para a futura automacao de
--   protocolo. Ate ela existir, o usuario registra o numero CNJ manualmente na peticao aprovada.
--   O numero e gravado so com digitos (20) e e unico por tenant: um processo, uma peticao.
-- - `monitoring_*`: a peticao enviada ao board de monitoramento guarda o card criado. E a
--   idempotencia por peticao entre boards (o indice de origem do card e por board).

ALTER TABLE kanban_card_initial_petitions ADD COLUMN IF NOT EXISTS protocol_registered_by_identity_id uuid NULL;
ALTER TABLE kanban_card_initial_petitions ADD COLUMN IF NOT EXISTS monitoring_board_id uuid NULL;
ALTER TABLE kanban_card_initial_petitions ADD COLUMN IF NOT EXISTS monitoring_card_id uuid NULL REFERENCES kanban_cards (id);
ALTER TABLE kanban_card_initial_petitions ADD COLUMN IF NOT EXISTS monitoring_sent_at timestamptz NULL;
ALTER TABLE kanban_card_initial_petitions ADD COLUMN IF NOT EXISTS monitoring_sent_by_identity_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kanban_card_initial_petitions_protocol_cnj_check') THEN
    -- NOT VALID: linhas anteriores (nenhuma em uso real) nao bloqueiam a migration; novas gravacoes conferem.
    ALTER TABLE kanban_card_initial_petitions
      ADD CONSTRAINT kanban_card_initial_petitions_protocol_cnj_check
      CHECK (protocol_number IS NULL OR protocol_number ~ '^[0-9]{20}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kanban_card_initial_petitions_monitoring_check') THEN
    ALTER TABLE kanban_card_initial_petitions
      ADD CONSTRAINT kanban_card_initial_petitions_monitoring_check
      CHECK (
        (monitoring_card_id IS NULL AND monitoring_board_id IS NULL AND monitoring_sent_at IS NULL)
        OR (monitoring_card_id IS NOT NULL AND monitoring_board_id IS NOT NULL AND monitoring_sent_at IS NOT NULL
            AND protocol_number IS NOT NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS kanban_card_initial_petitions_protocol_number_uidx
  ON kanban_card_initial_petitions (client_id, protocol_number)
  WHERE protocol_number IS NOT NULL;
