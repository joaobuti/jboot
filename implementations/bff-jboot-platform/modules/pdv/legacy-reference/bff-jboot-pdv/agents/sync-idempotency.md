# Agent Local: sync-idempotency

## Projeto

`implementations/bff-jboot-pdv`

## Responsabilidade

Definir e implementar sync offline, idempotencia, outbox, retries, reconciliacao e compensacao.

## Regras

- Toda operacao offline enviada pelo app deve ter `idempotency_key`.
- `idempotency_key` deve considerar `client_id`, `device_id`, `operation_id` e tipo da operacao.
- Reprocessamento deve ser seguro.
- Venda offline nao pode duplicar pagamento, item ou baixa de estoque.
- Temporal deve orquestrar workflows duraveis quando retry/compensacao forem relevantes.
- RabbitMQ pode transportar comandos, mas nao substitui regra de idempotencia.
- Redis/Valkey pode ajudar em locks, mas nao e fonte de verdade.

