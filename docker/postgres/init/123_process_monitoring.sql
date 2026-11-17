\set ON_ERROR_STOP on

-- Acompanhamento de processos como capacidade independente (ADR 021,
-- docs/product/process-monitoring-sprints.md, Sprint 1).
--
-- Banco exclusivo e unico para todos os clientes, separado por `client_id`.
-- Um acompanhamento fora de `deleted` por cliente e processo; `origin_product`
-- diz quem criou e `destination_product`/`destination_ref` para onde vao as
-- movimentacoes novas. O numero do processo so existe cifrado; a comparacao e
-- por HMAC, com as mesmas chaves do Juridico para a migracao da Sprint 2.

SELECT 'CREATE DATABASE jboot_process_monitoring'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jboot_process_monitoring')\gexec

\connect jboot_process_monitoring

CREATE TABLE IF NOT EXISTS process_monitors (
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
  origin_product varchar(16) NOT NULL CHECK (origin_product IN ('juridico', 'flow')),
  destination_product varchar(16) NOT NULL CHECK (destination_product IN ('juridico', 'flow')),
  destination_ref jsonb NOT NULL CHECK (jsonb_typeof(destination_ref) = 'object'),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  paused_at timestamptz,
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Destino Flow aponta para o card que recebe as movimentacoes.
  CONSTRAINT process_monitors_flow_destination_ref CHECK (
    destination_product <> 'flow'
    OR (destination_ref ? 'databaseRef' AND destination_ref ? 'boardId' AND destination_ref ? 'cardId')
  ),
  CONSTRAINT process_monitors_juridico_destination_ref CHECK (
    destination_product <> 'juridico' OR destination_ref ? 'databaseRef'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_process_monitors_live_process
  ON process_monitors (client_id, process_number_hmac) WHERE state <> 'deleted';
CREATE INDEX IF NOT EXISTS idx_process_monitors_client_destination
  ON process_monitors (client_id, destination_product, state);
CREATE INDEX IF NOT EXISTS idx_process_monitors_purge
  ON process_monitors (purge_after) WHERE purge_after IS NOT NULL;

CREATE TABLE IF NOT EXISTS process_monitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  monitor_id uuid NOT NULL REFERENCES process_monitors(id) ON DELETE CASCADE,
  idempotency_key varchar(128) NOT NULL,
  workflow_run_id varchar(128) NOT NULL,
  status varchar(32) NOT NULL CHECK (status IN ('running', 'success', 'not_found', 'restricted', 'rate_limited', 'timeout', 'provider_unavailable', 'failed')),
  provider_latency_ms integer CHECK (provider_latency_ms >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (client_id, monitor_id, idempotency_key)
);

-- Um retrato por acompanhamento, atualizado no lugar. As movimentacoes
-- acumulam e o conjunto de fingerprints e o baseline; a primeira execucao so
-- estabelece o baseline (mesmo modelo de 056_juridico_data_monitor_baseline).
CREATE TABLE IF NOT EXISTS process_monitor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  monitor_id uuid NOT NULL REFERENCES process_monitors(id) ON DELETE CASCADE,
  monitor_run_id uuid NOT NULL REFERENCES process_monitor_runs(id),
  tribunal varchar(32) NOT NULL,
  provider_updated_at timestamptz,
  process_fingerprint char(64) NOT NULL,
  baseline_established boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, monitor_id)
);

CREATE TABLE IF NOT EXISTS process_monitor_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES process_monitor_snapshots(id) ON DELETE CASCADE,
  movement_fingerprint char(64) NOT NULL,
  occurred_at timestamptz,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, snapshot_id, movement_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_process_monitor_movements_client_snapshot
  ON process_monitor_movements (client_id, snapshot_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS process_monitor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  monitor_id uuid NOT NULL REFERENCES process_monitors(id) ON DELETE CASCADE,
  movement_id uuid REFERENCES process_monitor_movements(id) ON DELETE CASCADE,
  event_type varchar(32) NOT NULL CHECK (event_type IN ('movement_detected', 'monitor_paused', 'monitor_deleted')),
  -- Destino que recebeu o evento; entrega e so para o destino atual.
  destination_product varchar(16) CHECK (destination_product IN ('juridico', 'flow')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_process_monitor_events_client_monitor_created
  ON process_monitor_events (client_id, monitor_id, created_at DESC);

-- Capacidade contratavel (ADR 006/008): sem application Identity, sem
-- entitlement por usuario. `service_name` NULL enquanto for modulo do BFF.
\connect jboot_identity

INSERT INTO capability_registry (slug, label, description, service_name)
VALUES (
  'monitoramento-processual',
  'Monitoramento processual',
  'Acompanhamento de processos no DataJud usado pelo Juridico e pelo Flow',
  NULL
)
ON CONFLICT (slug)
DO UPDATE SET label = EXCLUDED.label,
              description = EXCLUDED.description,
              service_name = EXCLUDED.service_name,
              active = true;

-- Clientes canonicos de desenvolvimento: JBoot e Demo JBoot.
INSERT INTO client_capabilities (client_id, capability, enabled, enabled_at)
SELECT c.id, 'monitoramento-processual', true, now()
FROM clients c
WHERE c.document_number IN ('63784101000110', '22345678000199')
ON CONFLICT (client_id, capability)
DO UPDATE SET enabled = true, enabled_at = COALESCE(client_capabilities.enabled_at, EXCLUDED.enabled_at);
