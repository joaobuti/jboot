# Skill: Kanban Board UI

## Objetivo

Implementar telas do board Kanban (produto "Flow") seguindo o design system da platform, incluindo drag-and-drop e atualizacao realtime via WebSocket.

## Entradas

- Contrato de rota e dados do BFF Kanban (`docs/api/kanban-sprint-1-openapi.yaml`).
- Conexao WebSocket ativa no namespace `/flow/ws`, autenticada com o mesmo JWT da sessao.
- Papel do usuario no board (`board_admin`/`board_member`) resolvido pelo contexto autenticado.

## Saidas

- Paginas em `src/app/(with-layout)/flow/*`.
- Componentes em `src/modules/kanban/components/`.
- Client tipado de WebSocket/API em `src/modules/kanban/lib/`.

## Falhas Esperadas

- Conexao WebSocket perdida: exibir indicador de "reconectando" e tentar reconectar; nunca travar a UI de drag-and-drop.
- Movimentacao de card rejeitada pelo backend (`409`, ex.: `wip_limit` excedido): revertar posicao otimista e exibir erro ao usuario.
- Usuario sem papel `board_admin` acessando rota de configuracao do board: redirecionar ou exibir estado bloqueado, nunca ocultar silenciosamente sem feedback.
