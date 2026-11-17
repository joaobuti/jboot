\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

-- Sprint 6 de docs/product/juridico-datajud-flow-sprints.md
--
-- Vinculo entre um processo DataJud consultado e os cards do Flow criados a
-- partir dele. O card e copia autossuficiente e vive no banco do Flow; esta
-- tabela existe para o caminho inverso, que o exportador PJe nunca precisou:
-- ao detectar mudanca no processo, saber em quais cards registrar o evento.

CREATE TABLE IF NOT EXISTS juridico_data_flow_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  snapshot_id uuid REFERENCES juridico_data_process_snapshots(id) ON DELETE SET NULL,
  -- Numero e tribunal replicados porque o snapshot pode ser purgado (180 dias)
  -- sem que o card deixe de existir. O HMAC mantem o numero fora de claro.
  process_number_hmac char(64) NOT NULL,
  hmac_key_version smallint NOT NULL CHECK (hmac_key_version > 0),
  tribunal varchar(32) NOT NULL,
  board_id uuid NOT NULL,
  card_id uuid NOT NULL,
  flow_database_ref varchar(128) NOT NULL,
  exported_by_identity_id uuid NOT NULL,
  monitor_id uuid REFERENCES juridico_data_monitors(id) ON DELETE SET NULL,
  last_notified_fingerprint char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Um card por processo por board, espelhando a idempotencia do Kanban.
  UNIQUE (client_id, board_id, process_number_hmac)
);

CREATE INDEX IF NOT EXISTS idx_juridico_data_flow_exports_process
  ON juridico_data_flow_exports (client_id, process_number_hmac);
CREATE INDEX IF NOT EXISTS idx_juridico_data_flow_exports_monitor
  ON juridico_data_flow_exports (monitor_id) WHERE monitor_id IS NOT NULL;
