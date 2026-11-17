# Kanban Sprint 1 Data Model

## Objetivo

Modelo de dados inicial para a Sprint 1 do Kanban (produto "Flow"): boards, colunas, cards e membros do board.

## Regras Globais

- Todas as tabelas de negocio usam `client_id`, mesmo em banco dedicado por cliente (`dedicated_database`).
- `client_id` vem do contexto validado do Identity Hub (`database_ref`), nunca de input livre.
- IDs sao UUID.
- Mutacoes administrativas relevantes (estrutura do board) devem gerar auditoria/evento operacional.
- Exclusividades de negocio devem considerar `client_id`.
- `CardFieldDefinition`/`CardFieldValue` (Sprint 2) e `WorkflowTransitionRule`/`BoardColumnPermission` (Sprint 3) virao em documentos de modelagem incrementais futuros — nao fazem parte deste documento.

## Tabelas

### `kanban_boards`

Board do tenant.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `name varchar(160) not null`;
- `description text null`;
- `status varchar(24) not null`;
- `created_by_identity_id uuid not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `status in ('active', 'archived')`.

### `kanban_board_columns`

Coluna de um board.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `board_id uuid not null`;
- `name varchar(160) not null`;
- `position integer not null`;
- `is_default boolean not null default false`;
- `color varchar(24) null`;
- `wip_limit integer null`;
- `status varchar(24) not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, board_id, position)`;
- no maximo uma coluna ativa por board pode ter `is_default = true`;
- `wip_limit is null or wip_limit > 0`;
- `status in ('active', 'archived')`.

Regra operacional:

- todo board criado deve receber imediatamente uma coluna padrao `BACKLOG`, em
  `position = 0`, `status = 'active'` e `is_default = true`;
- o usuario pode renomear a coluna, mas a aplicacao deve recuperar a coluna
  padrao por `is_default`, nunca pelo nome;
- a coluna padrao nao pode ser arquivada enquanto for a unica coluna padrao
  ativa do board.

### `kanban_cards`

Card dentro de uma coluna.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `board_id uuid not null`;
- `board_column_id uuid not null`;
- `title varchar(200) not null`;
- `description text null`;
- `source_module varchar(80) null`;
- `source_type varchar(120) null`;
- `source_id varchar(160) null`;
- `source_payload jsonb null`;
- `source_url text null`;
- `position integer not null`;
- `status varchar(24) not null`;
- `created_by_identity_id uuid not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, board_column_id, position)`;
- `source_module`, `source_type` e `source_id` devem ser todos nulos ou todos
  preenchidos;
- `unique (client_id, board_id, source_module, source_type, source_id) where source_module is not null and status <> 'archived'`;
- `status in ('active', 'archived')`;
- `board_column_id` referencia coluna do mesmo `board_id`/`client_id`.

Observacao:

- campos `source_*` sao usados por integracoes de dominio, inicialmente
  `juridico` -> `flow`, e permitem idempotencia de importacao sem acoplar o
  Kanban ao schema do modulo de origem.

### `kanban_board_members`

Papel de uma identidade dentro de um board especifico.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `board_id uuid not null`;
- `identity_id uuid not null`;
- `role varchar(40) not null`;
- `status varchar(24) not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, board_id, identity_id)`;
- `role in ('board_admin', 'board_member')` na Sprint 1 (`board_viewer` entra como papel valido a partir da Sprint 3, quando ACL granular por coluna for modelada);
- `status in ('active', 'inactive')`.

Observacao:

- `identity_id` referencia identidade do Identity Hub de forma logica; a integridade entre bancos deve ser validada por contrato/API, nao por FK cross-database.

## Relacionamentos

```text
kanban_boards 1 -> N kanban_board_columns
kanban_boards 1 -> N kanban_board_members
kanban_board_columns 1 -> N kanban_cards
```

Todos os relacionamentos devem preservar `client_id`.

## Indices Recomendados

- `kanban_boards(client_id, status, name)`;
- `kanban_board_columns(client_id, board_id, position)`;
- `kanban_board_columns(client_id, board_id) where is_default = true and status = 'active'`;
- `kanban_cards(client_id, board_id, board_column_id, position)`;
- `kanban_cards(client_id, board_id, source_module, source_type, source_id) where source_module is not null and status <> 'archived'`;
- `kanban_board_members(client_id, board_id, identity_id)`;
- `kanban_board_members(client_id, identity_id, status)`.

## Fora De Escopo Do Modelo Sprint 1

- `CardFieldDefinition`/`CardFieldValue` (campos customizados — Sprint 2);
- form builder (Sprint 2);
- `WorkflowTransitionRule` (Sprint 3);
- `BoardColumnPermission` (ACL granular por coluna — Sprint 3);
- `board_viewer` com permissao granular por coluna;
- anexos, comentarios, checklist de card;
- notificacoes externas.
