\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

-- Sprint 7 de docs/product/juridico-datajud-flow-sprints.md
--
-- Correcao estrutural da deteccao de mudanca do monitoramento DataJud.
--
-- Modelo anterior: `process_fingerprint` entra na chave unica do snapshot,
-- entao qualquer movimentacao nova gerava um snapshot NOVO, e todas as
-- movimentacoes do processo eram inseridas nele como ineditas. O resultado era
-- `movement_detected` para as 92 movimentacoes a cada mudanca, nao para a que
-- de fato mudou. O defeito nunca apareceu em producao porque criar monitor
-- falhava antes, em DataJudMonitorCryptoService.encrypt.
--
-- Modelo novo: um snapshot por monitor, atualizado no lugar. As movimentacoes
-- acumulam e o conjunto de fingerprints e o baseline; movimentacao nova e a que
-- ainda nao esta no conjunto. Mesmo modelo ja usado pela consulta manual na
-- Sprint 5.

ALTER TABLE juridico_data_process_snapshots
  -- A primeira execucao apos ativar o monitoramento apenas estabelece o
  -- baseline: sem esta marca, ativar (ou reativar depois da purga) inundaria o
  -- card com um evento por movimentacao historica.
  ADD COLUMN IF NOT EXISTS baseline_established boolean NOT NULL DEFAULT false;

ALTER TABLE juridico_data_process_snapshots
  DROP CONSTRAINT IF EXISTS juridico_data_process_snapsho_client_id_monitor_id_process__key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_juridico_data_snapshots_monitor
  ON juridico_data_process_snapshots (client_id, monitor_id)
  WHERE origin = 'monitor';

-- Snapshots de monitor anteriores a esta correcao sao baseline sujo: o
-- monitoramento nunca executou, entao nao ha historico a preservar.
DELETE FROM juridico_data_process_snapshots WHERE origin = 'monitor';
