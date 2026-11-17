# Payments Sprint 1 Data Model

Todas as tabelas de dominio usam UUID e `client_id`. Valores monetarios usam
`BIGINT` em minor units. Payload bruto externo nao faz parte do core.

| Agregado | Finalidade | Chaves de isolamento/idempotencia |
|---|---|---|
| `provider_connections` | Conta BYOA por tenant/provider | unique tenant/provider/identifier |
| `charges` | Obrigacao de pagamento provider-neutral | unique tenant/app/idempotency key |
| `payment_attempts` | Tentativas externas e resultado incerto | tenant + charge + provider account |
| `provider_events` | Inbox idempotente de eventos externos | provider/account/external event |
| `refunds` | Fato de devolucao futuro, sem inferir suporte | tenant + charge + idempotency key |
| `outbox_events` | Eventos atomicos do dominio | aggregate + type + sequence |

Estados iniciais de charge: `created`, `provider_pending`, `awaiting_payment`,
`verification_pending`, `received`, `pending_reconciliation`,
`creation_outcome_unknown`, `cancelled`, `failed`.

`received` nunca regressa. Devolucao futura e fato compensatorio separado.
