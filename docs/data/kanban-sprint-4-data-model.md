# Kanban Sprint 4 Data Model

## Objetivo

Modelo de dados incremental para a Sprint 4 do Kanban (produto "Flow"): atribuicao multipla de card (`CardAssignee`), historico cronologico unico (`CardActivity`) e anexos vinculados a um registro do historico (`CardAttachment`).

Este documento estende `docs/data/kanban-sprint-1-data-model.md` e `docs/data/kanban-sprint-3-data-model.md`; nao redefine tabelas anteriores.

## Regras Globais

- Todas as tabelas usam `client_id`, mesmo em banco dedicado por cliente.
- `client_id` vem do contexto validado do Identity Hub, nunca de input livre.
- IDs sao UUID.
- `kanban_card_activities.created_at` e imutavel: nenhuma rotina de update altera esse campo apos a insercao do registro. Esse dado e base para metricas futuras (lead time/cycle time/throughput), nao calculadas nesta sprint.

## Tabelas

### `kanban_card_assignees`

Atribuicao N:N de identidades a um card.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `card_id uuid not null`;
- `identity_id uuid not null`;
- `assigned_by_identity_id uuid not null`;
- `created_at timestamptz not null`;

Constraints:

- `unique (client_id, card_id, identity_id)`;
- `card_id` referencia `kanban_cards(id)` do mesmo `client_id`;
- `identity_id` deve corresponder a `kanban_board_members.identity_id` ativo no mesmo `board_id` do card (validado na aplicacao; sem FK cross-database ao Identity Hub).

### `kanban_card_activities`

Feed cronologico unico do card (comentarios + eventos de sistema).

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `card_id uuid not null`;
- `type varchar(24) not null`;
- `author_identity_id uuid not null`;
- `text_content text null` — usado quando `type = 'comment'`;
- `event_payload jsonb null` — usado quando `type = 'system_event'` (ex.: `{ "kind": "card.moved", "fromBoardColumnId": "...", "toBoardColumnId": "..." }`);
- `created_at timestamptz not null`;

Constraints:

- `type in ('comment', 'system_event')`;
- `card_id` referencia `kanban_cards(id)` do mesmo `client_id`;
- `type = 'comment'` exige `text_content` nao nulo;
- `type = 'system_event'` exige `event_payload` nao nulo;
- `created_at` nunca atualizado apos insercao (constraint de aplicacao — sem `updated_at` nesta tabela, intencionalmente).

Tipos de `event_payload.kind` previstos nesta sprint: `card.moved`, `card.assignee_added`, `card.assignee_removed`, `card.archived`, `card.title_updated`, `card.description_updated`.

### `kanban_card_attachments`

Anexo vinculado a um registro especifico do feed.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `activity_id uuid not null`;
- `file_name varchar(255) not null`;
- `content_type varchar(120) not null`;
- `size_bytes bigint not null`;
- `storage_bucket varchar(120) not null`;
- `storage_key varchar(500) not null`;
- `uploaded_by_identity_id uuid not null`;
- `created_at timestamptz not null`;

Constraints:

- `activity_id` referencia `kanban_card_activities(id)` do mesmo `client_id`;
- `unique (client_id, storage_bucket, storage_key)`;
- `size_bytes > 0` e `size_bytes <= 26214400` (25 MB), validado na aplicacao antes do upload chegar ao MinIO — confirmado pelo usuario em 2026-06-19 (ver `docs/product/kanban-sprint-4-gate.md`, secao "Pendencias");
- `content_type` restrito a whitelist validada na aplicacao: imagens comuns (`image/png`, `image/jpeg`, `image/gif`, `image/webp`), `application/pdf`, office docs (`application/msword`, `application/vnd.openxmlformats-officedocument.*`), texto/zip (`text/plain`, `text/csv`, `application/zip`). Sem limite agregado de armazenamento por card na v1 — reavaliar conforme custo de bucket observado em produção.

## Relacionamentos

```text
kanban_cards 1 -> N kanban_card_assignees
kanban_cards 1 -> N kanban_card_activities
kanban_card_activities 1 -> N kanban_card_attachments
```

Todos os relacionamentos devem preservar `client_id`.

## Indices Recomendados

- `kanban_card_assignees(client_id, card_id, identity_id)`;
- `kanban_card_assignees(client_id, identity_id)` — para listar cards atribuidos a um usuario;
- `kanban_card_activities(client_id, card_id, created_at)` — ordenacao cronologica do feed;
- `kanban_card_attachments(client_id, activity_id)`.

## Storage De Anexos

- Provedor: MinIO (S3-compatible), infra `jboot-minio` ja existente em `docker-compose.yml`.
- Bucket dedicado do modulo: `kanban-card-attachments` (nao compartilhado com outros modulos/projetos). **Este bucket e compartilhado entre todos os clients/tenants do modulo** (o isolamento `dedicated_database` e por Postgres, nao se estende ao MinIO) — por isso o isolamento por tenant precisa ser garantido no `storage_key`, nao apenas no banco.
- `storage_bucket`/`storage_key` sao a referencia logica persistida; o backend resolve a URL de download via client S3, nunca expondo URL publica permanente sem assinatura/expiracao.
- `storage_key` e obrigatoriamente prefixado por `client_id`, formato: `{client_id}/{card_id}/{activity_id}/{attachment_id}-{file_name}`. Gerado sempre server-side a partir do contexto autenticado e dos IDs envolvidos; nunca aceito como input livre do client (mesma regra de `client_id` em request). Decisao do Architect, ver `docs/product/kanban-sprint-4-gate.md`, secao "Decisao Do Architect", item 5.
- Variavel de ambiente: `JBOOT_KANBAN_ATTACHMENTS_BUCKET` (default dev: `kanban-card-attachments`).

## Fora De Escopo Do Modelo Sprint 4

- Realtime do feed (`card.activity.created` via WebSocket) — confirmado pelo usuario em 2026-06-19 que fica para sprint futura; feed funciona via reload/fetch nesta sprint.
- @mencoes, edicao/exclusao de comentario apos prazo, cards relacionados, labels/tags, due date.
- Calculo/relatorio de metricas (lead time, cycle time, throughput) a partir de `created_at` imutavel.
