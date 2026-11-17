\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Titulo do card = cliente; o numero do processo vai para a linha de baixo na face do card
-- (docs/product/process-monitoring-sprints.md, Sprint 11). Ajusta os cards ja criados pela
-- importacao ("Processo <numero> · <cliente>" -> "<cliente>"). Card sem cliente na planilha fica
-- "Processo <numero>", que ja e o formato novo. Os do Monitorar ("Processo <numero> · <banco>")
-- recebem o titulo do card de origem.
--
-- Idempotente: so toca titulo ainda no formato antigo. Em base existente aplicar a mao.
BEGIN;

UPDATE kanban_cards
   SET title = btrim(substr(title, strpos(title, ' · ') + 3)),
       updated_at = now()
 WHERE source_type = 'flow_process_import'
   AND title LIKE 'Processo % · %'
   AND btrim(substr(title, strpos(title, ' · ') + 3)) <> '';

UPDATE kanban_cards c
   SET title = o.title,
       updated_at = now()
  FROM kanban_card_initial_petitions p
  JOIN kanban_cards o ON o.id = p.card_id AND o.client_id = p.client_id
 WHERE c.source_type = 'flow_petition'
   AND c.source_id = p.id::text
   AND c.client_id = p.client_id
   AND c.title LIKE 'Processo % · %'
   AND btrim(o.title) <> '';

COMMIT;
