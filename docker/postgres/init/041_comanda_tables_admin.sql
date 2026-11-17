\set ON_ERROR_STOP on
\connect jboot_pdv

-- Sprint 7 do modulo `comanda` (cadastro de mesas + QR imprimivel). Ver
-- docs/product/comanda-sprints.md.
--
-- Ate a Sprint 6 `comandas.table_number` era um int solto: nao havia
-- garantia de que a mesa referenciada existisse em `comanda_tables`, porque
-- mesas so nasciam por seed de dev. Com o cadastro administrativo entrando,
-- a integridade passa a ser exigivel.

-- 1) Materializa mesas orfas: qualquer table_number ja usado por uma comanda
--    que nao exista em comanda_tables vira mesa `inactive` (nao `active`, para
--    nao inventar mesa operante que o admin nunca cadastrou — ela aparece no
--    cadastro para o operador decidir ativar ou renomear).
INSERT INTO comanda_tables (client_id, table_number, label, status)
SELECT DISTINCT c.client_id, c.table_number, 'Mesa ' || c.table_number, 'inactive'
FROM comandas c
LEFT JOIN comanda_tables t
  ON t.client_id = c.client_id AND t.table_number = c.table_number
WHERE t.id IS NULL
ON CONFLICT (client_id, table_number) DO NOTHING;

-- 2) FK composta. Sem ON DELETE: mesa nunca e removida fisicamente (o QR
--    impresso referencia table_number), apenas inativada via status.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comandas_table_fk'
  ) THEN
    ALTER TABLE comandas
      ADD CONSTRAINT comandas_table_fk
      FOREIGN KEY (client_id, table_number)
      REFERENCES comanda_tables (client_id, table_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comanda_tables_client_status
  ON comanda_tables(client_id, status, table_number);
