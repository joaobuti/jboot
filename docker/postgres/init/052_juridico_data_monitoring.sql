\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

CREATE TABLE IF NOT EXISTS juridico_data_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  created_by_identity_id uuid NOT NULL,
  tribunal varchar(32),
  process_number_ciphertext bytea NOT NULL,
  encryption_key_version smallint NOT NULL CHECK (encryption_key_version > 0),
  process_number_hmac char(64) NOT NULL,
  hmac_key_version smallint NOT NULL CHECK (hmac_key_version > 0),
  cadence varchar(16) NOT NULL CHECK (cadence IN ('daily', 'weekly', 'biweekly', 'monthly')),
  state varchar(16) NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'paused', 'deleted')),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  paused_at timestamptz,
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_juridico_data_monitors_client_state_next
  ON juridico_data_monitors (client_id, state, next_check_at);
CREATE INDEX IF NOT EXISTS idx_juridico_data_monitors_purge
  ON juridico_data_monitors (purge_after) WHERE purge_after IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_juridico_data_monitors_active_process
  ON juridico_data_monitors (client_id, process_number_hmac) WHERE state <> 'deleted';

CREATE TABLE IF NOT EXISTS juridico_data_monitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  monitor_id uuid NOT NULL REFERENCES juridico_data_monitors(id) ON DELETE CASCADE,
  idempotency_key varchar(128) NOT NULL,
  workflow_run_id varchar(128) NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('running', 'success', 'not_found', 'restricted', 'rate_limited', 'timeout', 'provider_unavailable', 'failed')),
  provider_latency_ms integer CHECK (provider_latency_ms >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (client_id, monitor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS juridico_data_process_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  monitor_id uuid NOT NULL REFERENCES juridico_data_monitors(id) ON DELETE CASCADE,
  monitor_run_id uuid NOT NULL REFERENCES juridico_data_monitor_runs(id),
  tribunal varchar(32) NOT NULL,
  provider_updated_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  process_fingerprint char(64) NOT NULL,
  UNIQUE (client_id, monitor_id, process_fingerprint)
);

CREATE TABLE IF NOT EXISTS juridico_data_snapshot_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES juridico_data_process_snapshots(id) ON DELETE CASCADE,
  movement_fingerprint char(64) NOT NULL,
  occurred_at timestamptz,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, snapshot_id, movement_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_juridico_data_movements_client_snapshot
  ON juridico_data_snapshot_movements (client_id, snapshot_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS juridico_data_monitor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  monitor_id uuid NOT NULL REFERENCES juridico_data_monitors(id) ON DELETE CASCADE,
  snapshot_movement_id uuid REFERENCES juridico_data_snapshot_movements(id) ON DELETE CASCADE,
  event_type varchar(32) NOT NULL CHECK (event_type IN ('movement_detected', 'monitor_paused', 'monitor_deleted', 'purged')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_juridico_data_monitor_events_client_monitor_created
  ON juridico_data_monitor_events (client_id, monitor_id, created_at DESC);

-- O IF NOT EXISTS não altera FKs de um banco já inicializado. Garante que a
-- purga de retenção consiga remover todo o agregado sem dados órfãos.
ALTER TABLE juridico_data_monitor_runs DROP CONSTRAINT IF EXISTS juridico_data_monitor_runs_monitor_id_fkey;
ALTER TABLE juridico_data_monitor_runs ADD CONSTRAINT juridico_data_monitor_runs_monitor_id_fkey FOREIGN KEY (monitor_id) REFERENCES juridico_data_monitors(id) ON DELETE CASCADE;
ALTER TABLE juridico_data_process_snapshots DROP CONSTRAINT IF EXISTS juridico_data_process_snapshots_monitor_id_fkey;
ALTER TABLE juridico_data_process_snapshots ADD CONSTRAINT juridico_data_process_snapshots_monitor_id_fkey FOREIGN KEY (monitor_id) REFERENCES juridico_data_monitors(id) ON DELETE CASCADE;
ALTER TABLE juridico_data_monitor_events DROP CONSTRAINT IF EXISTS juridico_data_monitor_events_monitor_id_fkey;
ALTER TABLE juridico_data_monitor_events ADD CONSTRAINT juridico_data_monitor_events_monitor_id_fkey FOREIGN KEY (monitor_id) REFERENCES juridico_data_monitors(id) ON DELETE CASCADE;
ALTER TABLE juridico_data_monitors DROP CONSTRAINT IF EXISTS juridico_data_monitors_client_id_process_number_hmac_key;
