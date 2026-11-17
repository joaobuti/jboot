# Skill: kanban-board-crud

## Objetivo

Padronizar CRUDs de board, coluna e card do modulo Kanban na backend platform.

## Entradas

- Contrato OpenAPI (`docs/api/kanban-sprint-1-openapi.yaml`).
- Contexto autenticado (JWT) com `client_id`, scopes (`flow:read`/`flow:write`/`flow:admin`) e `database_ref` do banco dedicado.

## Saidas

- DTOs validados por recurso (Board, BoardColumn, Card, BoardMember).
- Controller/service/repository por recurso, filtrando sempre por `client_id`.
- Evento de auditoria para mutacoes administrativas (criar/editar/remover coluna, mudar papel de membro).

## Falhas Esperadas

- Mutacao sem scope adequado: retornar `403` estruturado.
- Card/coluna referenciando `board_id` de outro `client_id`: retornar `404` estruturado (nao confirmar existencia cross-tenant).
- Movimentacao de card que excede `wip_limit` da coluna destino: retornar `409` estruturado, sem persistir a movimentacao.
