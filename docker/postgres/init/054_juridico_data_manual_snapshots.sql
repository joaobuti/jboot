\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

-- Sprint 5 de docs/product/juridico-datajud-flow-sprints.md
--
-- A consulta manual DataJud passa a gravar um snapshot, para servir de origem
-- estavel ao export para o Flow e de baseline de comparacao ao monitoramento.
-- Em vez de tabelas novas, generaliza-se `juridico_data_process_snapshots`: a
-- deteccao de mudanca por fingerprint ja vive nela e e o mecanismo que a
-- Sprint 7 consome.

ALTER TABLE juridico_data_process_snapshots
  ALTER COLUMN monitor_id DROP NOT NULL,
  ALTER COLUMN monitor_run_id DROP NOT NULL;

ALTER TABLE juridico_data_process_snapshots
  ADD COLUMN IF NOT EXISTS origin varchar(16) NOT NULL DEFAULT 'monitor',
  -- Numero do processo nunca em claro no banco, mesmo dedicado: mesmo padrao
  -- de juridico_data_monitors.
  ADD COLUMN IF NOT EXISTS process_number_ciphertext bytea,
  ADD COLUMN IF NOT EXISTS encryption_key_version smallint,
  ADD COLUMN IF NOT EXISTS process_number_hmac char(64),
  ADD COLUMN IF NOT EXISTS hmac_key_version smallint,
  -- Capa do processo, hoje so em transito na resposta da API.
  ADD COLUMN IF NOT EXISTS datajud_id varchar(200),
  ADD COLUMN IF NOT EXISTS grau varchar(16),
  ADD COLUMN IF NOT EXISTS data_ajuizamento timestamptz,
  ADD COLUMN IF NOT EXISTS sincronizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS classe jsonb,
  ADD COLUMN IF NOT EXISTS formato jsonb,
  ADD COLUMN IF NOT EXISTS sistema jsonb,
  ADD COLUMN IF NOT EXISTS orgao_julgador jsonb,
  ADD COLUMN IF NOT EXISTS assuntos jsonb,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE juridico_data_process_snapshots
  DROP CONSTRAINT IF EXISTS juridico_data_process_snapshots_origin_check;
ALTER TABLE juridico_data_process_snapshots
  ADD CONSTRAINT juridico_data_process_snapshots_origin_check
  CHECK (origin IN ('monitor', 'manual_query'));

-- Snapshot de monitor continua exigindo monitor e run; snapshot de consulta
-- manual nao tem nem um nem outro, e precisa do numero cifrado para ser
-- localizavel sem monitor.
ALTER TABLE juridico_data_process_snapshots
  DROP CONSTRAINT IF EXISTS juridico_data_process_snapshots_origin_shape_check;
ALTER TABLE juridico_data_process_snapshots
  ADD CONSTRAINT juridico_data_process_snapshots_origin_shape_check
  CHECK (
    (origin = 'monitor' AND monitor_id IS NOT NULL AND monitor_run_id IS NOT NULL)
    OR (
      origin = 'manual_query'
      AND monitor_id IS NULL
      AND monitor_run_id IS NULL
      AND process_number_ciphertext IS NOT NULL
      AND process_number_hmac IS NOT NULL
      AND purge_after IS NOT NULL
    )
  );

-- Um unico snapshot vivo por processo consultado manualmente, atualizado a cada
-- nova consulta. O UNIQUE existente (client_id, monitor_id, process_fingerprint)
-- nao colide: monitor_id NULL nunca conflita em unique constraint no Postgres.
CREATE UNIQUE INDEX IF NOT EXISTS uq_juridico_data_snapshots_manual_process
  ON juridico_data_process_snapshots (client_id, process_number_hmac)
  WHERE origin = 'manual_query';

CREATE INDEX IF NOT EXISTS idx_juridico_data_snapshots_purge
  ON juridico_data_process_snapshots (purge_after)
  WHERE purge_after IS NOT NULL;
