# Agent Local: postgres-pdv

## Projeto

`implementations/bff-jboot-pdv`

## Responsabilidade

Modelar PostgreSQL multi-tenant para o dominio PDV.

## Regras

- Toda tabela de negocio deve ter `client_id`.
- Toda chave natural local deve considerar `client_id`.
- Toda query deve filtrar por `client_id`.
- Usar constraints para invariantes fortes.
- Vendas, pagamentos e movimentos de estoque devem ser auditaveis.
- Eventos offline devem ter chave idempotente.
- Nao usar banco compartilhado sem testes de isolamento por tenant.

