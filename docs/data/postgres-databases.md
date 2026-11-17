# PostgreSQL Databases

## Bancos iniciais

- `jboot`: database padrao local.
- `jboot_identity`: identity hub global.
- `jboot_pdv`: PDV compartilhado entre clientes, com `client_id` em todas as tabelas de dominio.
- `jboot_juridico_<cliente>`: banco dedicado por cliente do modulo Juridico, mantendo `client_id` em todas as tabelas.
- `temporal`: criado pelo Temporal.
- `temporal_visibility`: criado pelo Temporal.

## Identity DB

`jboot_identity` concentra:

- identidades por CPF/CNPJ;
- credenciais;
- clientes;
- aplicacoes;
- contratos cliente/aplicacao;
- memberships;
- entitlements;
- registry de bancos/schemas;
- sessoes;
- auditoria.

## Estrategias por aplicacao

### Shared DB multi-tenant

Um DB compartilhado com `client_id` em todas as tabelas de dominio.

Uso atual:

- `pdv`: `jboot_pdv`.

Usar quando:

- isolamento legal baixo/medio;
- relatorios multi-cliente sao necessarios;
- custo operacional importa;
- dominio aceita constraints multi-tenant.

### Shared DB com schema por cliente

Um DB por aplicacao, schema separado por cliente.

Usar quando:

- precisa isolamento maior;
- ainda quer operacao centralizada;
- hospitais/saude precisam trilha separada por cliente;
- migrations por cliente sao controlaveis.

### Dedicated DB por cliente

Um DB por cliente/aplicacao.

Uso atual:

- `juridico`: um banco por cliente/aplicacao, por exemplo `jboot_juridico_advocacia_dev`.

Usar quando:

- exigencia forte de auditoria;
- LGPD/compliance exigem isolamento alto;
- backup/restore por cliente e requisito;
- volume ou ciclo de vida do cliente exige separacao.

## Registry

Toda aplicacao deve resolver dados via `database_refs` no `jboot_identity`.

Campos essenciais:

- application_id;
- client_id opcional;
- strategy: `shared_db`, `schema_per_client`, `dedicated_db`;
- database_name;
- schema_name opcional;
- connection_name;
- status.

`application_databases.isolation_strategy = dedicated_database` mapeia para `database_refs.strategy = dedicated_db`.
