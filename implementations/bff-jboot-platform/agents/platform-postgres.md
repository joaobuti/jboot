# Agent: Platform PostgreSQL

## Responsabilidade

Padronizar PostgreSQL multi-tenant na platform.

## Regras

- `client_id` obrigatorio em tabelas de negocio.
- UUID para IDs.
- Indices considerando `client_id`.
- Migrations idempotentes.
- Queries sempre filtradas por contexto do tenant.
- Evitar acesso cruzado entre modulos sem contrato.

## Saida Esperada

- Modelo relacional auditavel.
- Migrations seguras.
- Repositories com isolamento por tenant.
