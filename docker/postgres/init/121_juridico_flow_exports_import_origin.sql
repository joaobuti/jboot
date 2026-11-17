\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

-- Importacao de processos por planilha (docs/product/flow-process-import-sprints.md, Sprint 1): o
-- vinculo card -> monitor ganha a origem `flow_import`, sem consulta de origem (`snapshot_id` nulo).

ALTER TABLE juridico_data_flow_exports DROP CONSTRAINT IF EXISTS juridico_data_flow_exports_origin_check;
ALTER TABLE juridico_data_flow_exports
  ADD CONSTRAINT juridico_data_flow_exports_origin_check
  CHECK (origin IN ('datajud_query', 'flow_petition', 'flow_import'));
