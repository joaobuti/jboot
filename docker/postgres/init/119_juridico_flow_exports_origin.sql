\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

-- Monitorar peticao protocolada (docs/product/flow-card-actions-sprints.md, Sprint 2).
--
-- O vinculo card -> monitor passa a ter duas origens:
-- - `datajud_query`: card exportado de uma consulta DataJud (Sprint 6 de juridico-datajud-flow);
-- - `flow_petition`: card criado no board de monitoramento a partir de peticao protocolada no Flow.
--   Nao ha consulta de origem: `snapshot_id` fica nulo (a coluna ja aceitava nulo pela purga).

ALTER TABLE juridico_data_flow_exports
  ADD COLUMN IF NOT EXISTS origin varchar(20) NOT NULL DEFAULT 'datajud_query';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'juridico_data_flow_exports_origin_check') THEN
    ALTER TABLE juridico_data_flow_exports
      ADD CONSTRAINT juridico_data_flow_exports_origin_check
      CHECK (origin IN ('datajud_query', 'flow_petition'));
  END IF;
END $$;
