# Agent: Establishment Customers Domain

## Responsabilidade

Garantir coerencia do cadastro de cliente final do estabelecimento (nivel 2 do dominio), extraido de `pdv/admin/customers` para servir tambem o modulo `comanda`.

## Regras

- `client_id` obrigatorio em toda leitura/escrita.
- Nunca tratar este cadastro como equivalente a `clients` (nivel 1, tenant da JBoot) — sao entidades e tabelas completamente distintas.
- Busca por `document_number`/`phone` deve ser idempotente: mesmo documento/telefone dentro do mesmo `client_id` resolve para o mesmo registro, nunca cria duplicata silenciosa.
- `PdvAuditService` (via `PdvAuditModule` compartilhado) continua registrando toda mutacao administrativa, exatamente como antes da extracao.
