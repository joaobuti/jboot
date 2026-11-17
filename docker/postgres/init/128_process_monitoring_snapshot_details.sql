\set ON_ERROR_STOP on

-- Dados do processo no retrato do DataJud (docs/product/process-monitoring-sprints.md, Sprint 9): data de
-- ajuizamento, classe, vara e sistema, mostrados no painel "Origem" do card. Preenchidos na proxima
-- consulta ao DataJud de cada acompanhamento. Migration aditiva e idempotente.

\connect jboot_process_monitoring

ALTER TABLE process_monitor_snapshots
  ADD COLUMN IF NOT EXISTS filed_at timestamptz,
  ADD COLUMN IF NOT EXISTS class_name varchar(500),
  ADD COLUMN IF NOT EXISTS court_name varchar(500),
  ADD COLUMN IF NOT EXISTS system_name varchar(200);
