-- =============================================================
-- 029_pdv_inventory_sale.sql — Sprint 2: habilitar movimentos de venda
--
-- Alterações:
--   1. pdv_inventory_movements: adiciona type 'sale' e source_type 'pdv_sale'
--   2. pdv_inventory_balances: remove CHECK quantity >= 0 (permite negativo)
--      e remove CHECK reserved_quantity <= quantity (incompatível com saldo negativo)
-- =============================================================

\connect jboot_pdv

-- 1. Ampliar CHECK de tipo em movimentos
ALTER TABLE pdv_inventory_movements
  DROP CONSTRAINT IF EXISTS pdv_inventory_movements_type_check;

ALTER TABLE pdv_inventory_movements
  ADD CONSTRAINT pdv_inventory_movements_type_check
  CHECK (type IN ('initial', 'adjustment_in', 'adjustment_out', 'batch_import', 'sale'));

-- 2. Ampliar CHECK de source_type em movimentos
ALTER TABLE pdv_inventory_movements
  DROP CONSTRAINT IF EXISTS pdv_inventory_movements_source_type_check;

ALTER TABLE pdv_inventory_movements
  ADD CONSTRAINT pdv_inventory_movements_source_type_check
  CHECK (source_type IN ('manual_adjustment', 'batch_import', 'pdv_sale'));

-- 3. Remover restrição de saldo não-negativo (decisão PO Sprint 2: permite negativo)
ALTER TABLE pdv_inventory_balances
  DROP CONSTRAINT IF EXISTS pdv_inventory_balances_quantity_check;

-- 4. Remover restrição derivada (reserved_quantity <= quantity — inválida com saldo negativo)
ALTER TABLE pdv_inventory_balances
  DROP CONSTRAINT IF EXISTS pdv_inventory_balances_check;
