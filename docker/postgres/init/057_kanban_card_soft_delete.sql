\set ON_ERROR_STOP on

\connect jboot_kanban_demo_dev

-- Decisao do usuario em 2026-09-09 (ver JUR-003 em
-- docs/product/juridico-official-data-pendencias.md): exclusao de card no Flow
-- passa a ser SEMPRE logica. Quem tem papel/permissao para excluir continua
-- podendo excluir; o registro e que deixa de sair do banco.
--
-- Motivacao: o Flow e o registro permanente do cliente. Ate aqui,
-- `deletePermanently` executava `DELETE FROM kanban_cards`, o que apagava de
-- vez inclusive card de origem juridica exportado do DataJud, contrariando a
-- regra de imutabilidade e permanencia do dado de origem.
--
-- A regra vale para todo card, nao apenas os de origem externa: um unico
-- caminho de exclusao e mais simples de auditar do que dois com semanticas
-- diferentes.

ALTER TABLE kanban_cards DROP CONSTRAINT IF EXISTS kanban_cards_status_check;
ALTER TABLE kanban_cards
  ADD CONSTRAINT kanban_cards_status_check
  CHECK (status IN ('active', 'archived', 'deleted'));

-- Card excluido nao pode bloquear uma reimportacao futura da mesma origem,
-- pelo mesmo motivo que card arquivado ja nao bloqueava.
DROP INDEX IF EXISTS kanban_cards_source_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS kanban_cards_source_active_idx
  ON kanban_cards (client_id, board_id, source_module, source_type, source_id)
  WHERE source_module IS NOT NULL AND status NOT IN ('archived', 'deleted');
