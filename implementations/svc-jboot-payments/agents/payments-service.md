# Agent: Payments Service

## Objetivo

Implementar o core provider-neutral, isolamento multi-tenant, idempotencia,
persistencia, inbox/outbox e maquina de estados do `svc-jboot-payments`.

## Entradas

- `PROJECT_CONTRACT.md`;
- contratos em `docs/api` e `docs/data`;
- Sprint e gate de Payments.

## Saidas

- dominio sem dependencia de provider;
- handlers, services e repositories com interfaces explicitas;
- testes automatizados equivalentes;
- migrations e observabilidade sem dados sensiveis.

## Falhas Esperadas

- capability desabilitada;
- idempotency key reutilizada com payload divergente;
- tenant divergente;
- banco indisponivel;
- estado ou valor incompatível.

Nunca converter resultado externo incerto em sucesso ou falha presumida.
