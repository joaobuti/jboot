# Skill: kanban-realtime

## Objetivo

Implementar e manter o WebSocket Gateway (`@nestjs/websockets`) que sincroniza movimentacao de card entre usuarios conectados ao mesmo board Kanban.

## Entradas

- Conexao WebSocket autenticada por JWT no handshake, namespace `/flow/ws`.
- Evento `card.move` enviado pelo cliente (`boardId`, `cardId`, `toBoardColumnId`, `toPosition`).
- Registro de `BoardMember` ativo para validar se a identidade pode entrar na room `board:{boardId}`. A room e canal de leitura: `board.join` usa `BoardAccessService.requireMember` (qualquer papel ativo, inclusive `board_viewer`); mutacao via socket nunca depende da room e passa pelo service com `requireRole(['board_admin','board_member'])`.

## Saidas

- Evento `card.moved` emitido para todos os clientes na room `board:{boardId}` apos persistencia da movimentacao.
- Erro estruturado (`error` event) quando a movimentacao for rejeitada (ex.: `wip_limit` excedido, coluna de outro board).

## Falhas Esperadas

- Handshake sem JWT valido: rejeitar conexao antes de qualquer `join`.
- Identidade sem `BoardMember` ativo tentando entrar na room: rejeitar `board.join` com erro estruturado, nunca incluir na room silenciosamente.
- Movimentacao que excede `wip_limit`: rejeitar no service antes de emitir `card.moved`; emitir `error` somente ao remetente.
- Multiplas instancias de `platform-api`: limitacao conhecida — sem Redis/pub-sub no MVP, broadcast so alcanca clientes conectados na mesma instancia. Nao tentar contornar sem decisao explicita do Architect.
