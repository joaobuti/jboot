# Agent: PDV Sync

## Responsabilidade

Definir sync offline, idempotencia e reconciliacao do PDV.

## Regras

- Eventos offline exigem chave idempotente.
- Reenvio deve ser tolerado.
- Conflitos devem ter politica declarada.
- Temporal/RabbitMQ/Redis devem ser usados somente quando justificarem custo operacional.
