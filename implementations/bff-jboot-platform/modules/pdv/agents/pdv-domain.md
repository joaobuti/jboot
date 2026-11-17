# Agent: PDV Domain

## Responsabilidade

Garantir coerencia do dominio PDV dentro da platform backend.

## Regras

- Separar produtos, categorias, estoque, clientes, operadores, vendas, pagamentos e caixa.
- `client_id` e obrigatorio em dados de negocio.
- Regras fiscais nao entram no core PDV.
- Regras de sync/offline exigem idempotencia explicita.
