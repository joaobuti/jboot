# Kanban Sprint 3 Data Model

## Objetivo

Modelo de dados incremental para a Sprint 3 do Kanban (produto "Flow"): perfis de movimentacao por board (`MemberProfile`), transicoes de coluna permitidas por perfil (`MemberProfileTransition`) e ACL de coluna por perfil (`BoardColumnPermission`).

Este documento estende `docs/data/kanban-sprint-1-data-model.md`; nao redefine `kanban_boards`, `kanban_board_columns`, `kanban_cards`.

## Revisao De Premissa

> **Pendente de confirmacao do Architect.** A versao anterior do `MODULE_CONTRACT.md` previa ACL de coluna chaveada por papel fixo (`board_admin`/`board_member`/`board_viewer`). Este documento modela a ACL chaveada por `profile_id` (`MemberProfile`), conforme revisao de escopo do PO em `docs/product/kanban-sprints.md`. Ver `docs/product/kanban-sprint-3-gate.md`, secao "Pendencias".

## Regras Globais

- Todas as tabelas usam `client_id`, mesmo em banco dedicado por cliente.
- `client_id` vem do contexto validado do Identity Hub, nunca de input livre.
- IDs sao UUID.
- `MemberProfile` e exclusivo de um `board_id` — nao existe perfil compartilhado entre boards.

## Tabelas

### `kanban_member_profiles`

Perfil de movimentacao nomeado, exclusivo de um board.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `board_id uuid not null`;
- `name varchar(160) not null`;
- `can_delete_archived_cards boolean not null default false`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, board_id, name)`;
- `board_id` referencia `kanban_boards(id)` do mesmo `client_id`.

### `kanban_member_profile_transitions`

Transicao de coluna permitida para um perfil.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `profile_id uuid not null`;
- `from_board_column_id uuid not null`;
- `to_board_column_id uuid not null`;
- `created_at timestamptz not null`;

Constraints:

- `unique (client_id, profile_id, from_board_column_id, to_board_column_id)`;
- `profile_id` referencia `kanban_member_profiles(id)` do mesmo `client_id`;
- `from_board_column_id`/`to_board_column_id` referenciam colunas do mesmo `board_id` do perfil;
- `from_board_column_id <> to_board_column_id`.

### `kanban_board_column_permissions`

ACL de visualizacao/edicao de coluna, chaveada por perfil.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `profile_id uuid not null`;
- `board_column_id uuid not null`;
- `can_view boolean not null default true`;
- `can_edit boolean not null default false`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, profile_id, board_column_id)`;
- `profile_id` referencia `kanban_member_profiles(id)` do mesmo `client_id`;
- `board_column_id` referencia coluna do mesmo `board_id` do perfil;
- `can_edit = true` implica `can_view = true` (validar na aplicacao ou via check constraint).

### Alteracao Em `kanban_board_members`

Campo adicionado:

- `profile_id uuid null` — referencia `kanban_member_profiles(id)` do mesmo `client_id`/`board_id`. `null` significa membro sem perfil atribuido (nao move card entre colunas, nao exclui card arquivado, exceto se `board_admin` ou autor do card).

## Relacionamentos

```text
kanban_boards 1 -> N kanban_member_profiles
kanban_member_profiles 1 -> N kanban_member_profile_transitions
kanban_member_profiles 1 -> N kanban_board_column_permissions
kanban_board_columns 1 -> N kanban_member_profile_transitions (from e to)
kanban_board_columns 1 -> N kanban_board_column_permissions
kanban_board_members N -> 1 kanban_member_profiles (profile_id nullable)
```

Todos os relacionamentos devem preservar `client_id`.

## Indices Recomendados

- `kanban_member_profiles(client_id, board_id, name)`;
- `kanban_member_profile_transitions(client_id, profile_id, from_board_column_id, to_board_column_id)`;
- `kanban_board_column_permissions(client_id, profile_id, board_column_id)`;
- `kanban_board_members(client_id, board_id, profile_id)`.

## Regras De Validacao Na Aplicacao

- Movimentacao de card: se `board_admin`, bypass total. Caso contrario, exigir `BoardMember.profile_id` nao nulo e par `(from_board_column_id, to_board_column_id)` presente em `kanban_member_profile_transitions` do perfil.
- Exclusao definitiva de card arquivado: permitida se `board_admin`, ou se `identity_id = Card.created_by_identity_id`, ou se `BoardMember.profile_id` aponta para perfil com `can_delete_archived_cards = true`.
- Leitura/listagem de colunas: filtrar por `kanban_board_column_permissions.can_view` do perfil do `BoardMember` autenticado (bypass para `board_admin`).
- Emissao de evento realtime: aplicar o mesmo filtro de `can_view` antes de emitir para cada destinatario da room do board.

## Fora De Escopo Do Modelo Sprint 3

- Perfis reutilizaveis entre boards.
- Automacoes condicionais alem de transicao de coluna.
- `CardAssignee`, `CardActivity`, `CardAttachment` (Sprint 4).
