\set ON_ERROR_STOP on

-- Fontes separadas no acompanhamento e publicacoes do DJEN (ADR 022,
-- docs/product/process-monitoring-sprints.md, Sprint 7).
--
-- Cada acompanhamento passa a ter estado por fonte: DataJud (ligado + cadencia,
-- que ja existia em `cadence`) e DJEN (ligado/desligado/padrao + cadencia em dias
-- uteis). `djen_enabled` NULL = padrao: ligado quando o destino e o Flow e o
-- cliente contrata `publicacoes-processuais`. Migration aditiva e idempotente.

\connect jboot_process_monitoring

BEGIN;

ALTER TABLE process_monitors
  ADD COLUMN IF NOT EXISTS datajud_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS djen_enabled boolean,
  ADD COLUMN IF NOT EXISTS djen_cadence_days smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS djen_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS djen_next_check_on date,
  ADD COLUMN IF NOT EXISTS djen_checked_until date,
  ADD COLUMN IF NOT EXISTS djen_baseline_established boolean NOT NULL DEFAULT false;

ALTER TABLE process_monitors DROP CONSTRAINT IF EXISTS process_monitors_djen_cadence_days_check;
ALTER TABLE process_monitors
  ADD CONSTRAINT process_monitors_djen_cadence_days_check CHECK (djen_cadence_days IN (1, 3, 7));

-- Execucao por fonte; as existentes sao do DataJud.
ALTER TABLE process_monitor_runs
  ADD COLUMN IF NOT EXISTS source varchar(8) NOT NULL DEFAULT 'datajud';
ALTER TABLE process_monitor_runs DROP CONSTRAINT IF EXISTS process_monitor_runs_source_check;
ALTER TABLE process_monitor_runs
  ADD CONSTRAINT process_monitor_runs_source_check CHECK (source IN ('datajud', 'djen'));
CREATE INDEX IF NOT EXISTS idx_process_monitor_runs_client_monitor_source
  ON process_monitor_runs (client_id, monitor_id, source, completed_at DESC);

-- Publicacoes do DJEN: texto puro cifrado (nunca o HTML do provedor), deduplicado
-- pelo hash do DJEN. `is_new` = detectada depois da base (vira evento no destino).
CREATE TABLE IF NOT EXISTS process_monitor_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  monitor_id uuid NOT NULL REFERENCES process_monitors(id) ON DELETE CASCADE,
  provider_hash varchar(128) NOT NULL,
  communication_id bigint,
  available_on date,
  communication_type varchar(160),
  document_type varchar(160),
  court_name varchar(500),
  text_ciphertext bytea,
  encryption_key_version smallint CHECK (encryption_key_version IS NULL OR encryption_key_version > 0),
  link varchar(2000),
  is_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, monitor_id, provider_hash)
);
CREATE INDEX IF NOT EXISTS idx_process_monitor_publications_client_monitor
  ON process_monitor_publications (client_id, monitor_id, available_on DESC);

ALTER TABLE process_monitor_events
  ADD COLUMN IF NOT EXISTS publication_id uuid REFERENCES process_monitor_publications(id) ON DELETE CASCADE;
ALTER TABLE process_monitor_events DROP CONSTRAINT IF EXISTS process_monitor_events_event_type_check;
ALTER TABLE process_monitor_events
  ADD CONSTRAINT process_monitor_events_event_type_check
  CHECK (event_type IN ('movement_detected', 'publication_detected', 'monitor_paused', 'monitor_deleted'));

COMMIT;

-- Capacidade contratavel (ADR 006/022), dependente de `monitoramento-processual`.
\connect jboot_identity

BEGIN;

UPDATE capability_registry
   SET label = 'Monitoramento processual (DataJud)'
 WHERE slug = 'monitoramento-processual';

INSERT INTO capability_registry (slug, label, description, service_name)
VALUES (
  'publicacoes-processuais',
  'Publicações processuais (DJEN)',
  'Publicações e intimações do DJEN por número de processo nos acompanhamentos do Flow; exige monitoramento-processual',
  NULL
)
ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

INSERT INTO client_capabilities (client_id, capability, enabled, enabled_at)
SELECT c.id, 'publicacoes-processuais', true, now()
FROM clients c
WHERE c.document_number IN ('63784101000110', '22345678000199')
ON CONFLICT (client_id, capability)
DO UPDATE SET enabled = true, enabled_at = COALESCE(client_capabilities.enabled_at, EXCLUDED.enabled_at);

COMMIT;
