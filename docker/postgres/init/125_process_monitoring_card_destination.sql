\set ON_ERROR_STOP on

\connect jboot_process_monitoring

-- Sprint 3 de docs/product/process-monitoring-sprints.md: o Flow acha o acompanhamento pelo card de
-- destino (toggle e cadencia do card) sem passar pelo Juridico.
CREATE INDEX IF NOT EXISTS idx_process_monitors_flow_card
  ON process_monitors (client_id, (destination_ref->>'cardId'))
  WHERE destination_product = 'flow' AND state <> 'deleted';
