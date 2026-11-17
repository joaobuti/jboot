# Kanban Sprint 7 Gate

## Status

Implementado em 2026-06-23 como retomada a partir do Item 4 da lista operacional do usuario.

Agents/skills declarados nesta retomada: usando agent Codex; usando skill nenhuma (continuidade em modulo existente, sem criacao de novo projeto/modulo).

## Escopo

Sprint 7: notificacoes in-app e vencimento de card.

Projetos afetados:

- `implementations/bff-jboot-platform/modules/kanban`;
- `implementations/app-jboot-next-platform/modules/kanban`.

## Regras De Negocio

- `Card.due_date` e opcional, editavel no modal do card, exibido no board e usado para metrica de cards atrasados.
- Card atrasado e card ativo com `due_date < CURRENT_DATE`.
- Alteracao de vencimento gera `CardActivity.system_event` com `kind = card.due_date_changed`.
- Notificacoes in-app sao geradas para:
  - usuario atribuido ao card (`card.assigned`);
  - responsaveis atuais quando um card atribuido recebe comentario (`card.commented`);
  - responsaveis atuais quando um card atribuido muda de coluna (`card.moved`).
- O proprio autor da acao nunca recebe notificacao da propria acao.
- WebSocket entra automaticamente em room por identidade (`user:{identityId}`) no handshake autenticado e emite `notification.created`.
- O dropdown de notificacoes e exibido somente no modulo `flow`; os demais modulos continuam com o componente padrao da platform.

## Banco/API

- Migration incremental: `docker/postgres/init/019_kanban_notifications_due_date.sql`.
- Nova tabela: `kanban_notifications`.
- Novo campo: `kanban_cards.due_date date null`.
- Endpoint novo: `GET /kanban/notifications?unreadOnly=true|false`.
- Endpoints de leitura: `PATCH /kanban/notifications/:notificationId/read` e `PATCH /kanban/notifications/read-all`.
- Metricas (`GET /kanban/metrics`) incluem `overdueCount`.

## Validacao Planejada

- Backend: typecheck, lint, teste automatizado de persistencia de `dueDate`, contagem de `overdueCount` e regra de notificacao.
- Frontend: type-check, lint, testes Vitest existentes, smoke de board/modal/Home/dropdown.
- Smoke manual via `curl`/`psql`: aplicar migration, consultar `kanban_notifications`, atualizar `dueDate`, verificar `overdueCount` e endpoints de notificacao.

## Riscos E Pendencias

- Notificacoes sao in-app e volateis em realtime por instancia unica; historico persistido cobre reload, mas push multi-instancia exigira pub/sub futuro.
- Payload de notificacao permanece minimo nesta sprint; exibicao usa `boardId`/`cardId` e texto derivado de `kind`.
- Nao ha job de notificacao automatica por vencimento; `due_date` nesta sprint impacta UI e metricas, nao envia alerta calendarizado.
