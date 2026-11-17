# Kanban Sprint 5 Gate

## Status

Implementado em 2026-06-22. Escopo definido diretamente pelo usuario na conversa de implementacao (PO/PE/Architect informais — modulo ja maduro, mesmo padrao de extensao incremental usado nas Sprints 3/4).

## Objetivo

Permitir cadastro de `CardTag` (multiplas por card) e `CardStatus` (unico por card), com gestao (cadastro, edicao) e aplicacao no card controladas pelo `MemberProfile` — mesmo mecanismo de permissao da Sprint 3.

## Regras De Negocio

- `CardTag` (board_id, name, color): N:N com `Card` via `kanban_card_tag_links`. Exclusiva por board (mesmo padrao do `MemberProfile`).
- `CardStatus` (board_id, name, color): 1:1 com `Card` (`kanban_cards.card_status_id`, nullable). Exclusiva por board.
- Dois novos campos booleanos em `MemberProfile`: `can_manage_tags`, `can_manage_statuses`. Cobrem cadastro/edicao/remocao da definicao (Tag/Status) **e** aplicar/remover no card. `board_admin` sempre bypassa (mesmo padrao do `can_delete_archived_cards`).
- Excluir uma `CardTag` remove o vinculo de todos os cards (cascade). Excluir um `CardStatus` em uso so limpa `card_status_id` dos cards afetados (`ON DELETE SET NULL`), nao bloqueia a exclusao — assimetria deliberada: tag e rotulo solto (sem custo remover), status e um campo do card (perder o valor é diferente de perder a definicao, mas nao deve travar a operacao administrativa).
- Card fechado no board exibe: responsavel(is) (mesmo formato usado na modal — badge com id truncado, nao mais avatar de iniciais), status (badge colorido, se definido) e tags (badges coloridos, se houver).
- Frontend precisa saber se o usuario logado pode gerenciar tags/status para mostrar ou esconder os controles de edicao — `GET /kanban/boards/:boardId` passa a retornar `currentUserCapabilities` resolvidas server-side.

## Fora De Escopo

- Filtro/busca de cards por tag ou status (fica para sprint futura, quando houver demanda real).
- Templates de tag/status reutilizaveis entre boards.
