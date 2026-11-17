# Domain Flow Integration Sprint 1 Data Model

## Objetivo

Registrar as alteracoes de dados necessarias para exportar registros de dominio
para cards do Flow sem perder origem, isolamento por tenant ou coluna padrao.

## Regras Globais

- `client_id` continua obrigatorio em todas as tabelas de negocio.
- `client_id` e `database_ref` vem do contexto autenticado, nunca de payload.
- A coluna padrao do board deve ser recuperavel por metadado, nao por nome.
- Referencia externa deve ser estruturada para auditoria e idempotencia futura.

## Alteracoes Em `kanban_board_columns`

Adicionar:

- `is_default boolean not null default false`.

Constraints:

- unico por board para coluna padrao ativa:
  `unique (client_id, board_id) where is_default = true and status = 'active'`;
- a coluna criada automaticamente em board novo usa:
  - `name = 'BACKLOG'`;
  - `position = 0`;
  - `is_default = true`;
  - `status = 'active'`.

Regra operacional:

- O usuario pode renomear a coluna, mas `is_default` permanece verdadeiro.
- Arquivar a coluna padrao deve ser bloqueado enquanto nao houver substituicao
  explicita em sprint futura. Na Sprint 1, a coluna padrao nao pode ser
  arquivada.

## Alteracoes Em `kanban_cards`

Adicionar:

- `source_module varchar(80) null`;
- `source_type varchar(120) null`;
- `source_id varchar(160) null`;
- `source_payload jsonb null`;
- `source_url text null`.

Constraints recomendadas:

- se `source_module` nao for nulo, `source_type` e `source_id` tambem sao
  obrigatorios;
- indice unico parcial para idempotencia:
  `unique (client_id, board_id, source_module, source_type, source_id) where source_module is not null and status <> 'archived'`.

## Fonte Juridico PJe

Origem inicial:

- tabela: `juridico_pje_comunicacoes`;
- identificador: `id`;
- tipo de origem: `pje_comunicacao`;
- modulo de origem: `juridico`.

Payload minimo no card:

```json
{
  "numeroProcesso": "string | null",
  "numeroProcessoMask": "string | null",
  "siglaTribunal": "string | null",
  "nomeOrgao": "string | null",
  "tipoComunicacao": "string | null",
  "tipoDocumento": "string | null",
  "nomeClasse": "string | null",
  "dataDisponibilizacao": "YYYY-MM-DD | null"
}
```

## Fora De Escopo

- Tabela generica de jobs de integracao.
- Fila/retry duravel.
- Anexar documentos ao card.
- Sincronizacao bidirecional de status.
