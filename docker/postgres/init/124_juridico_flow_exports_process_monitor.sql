\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

-- ADR 021, Sprint 2 de docs/product/process-monitoring-sprints.md.
--
-- `juridico_data_flow_exports.monitor_id` passa a apontar para o acompanhamento da capacidade
-- `monitoramento-processual` (banco `jboot_process_monitoring`). Os acompanhamentos migrados mantem o
-- mesmo id, entao os vinculos existentes continuam validos; a FK para `juridico_data_monitors` deixa de
-- fazer sentido porque a tabela nao recebe acompanhamentos novos.

ALTER TABLE juridico_data_flow_exports DROP CONSTRAINT IF EXISTS juridico_data_flow_exports_monitor_id_fkey;
