# Skill Local: pdv-sync-contract

## Uso

Aplicar em endpoints e workers de sync offline.

## Contrato Minimo

Toda operacao sincronizada deve declarar:

- `client_id` do contexto;
- `device_id`;
- `operation_id`;
- `idempotency_key`;
- tipo da operacao;
- payload versionado;
- timestamp local;
- status de processamento;
- erros estruturados.

## Regras

- Payloads devem ser versionados.
- Reenvio deve retornar o mesmo resultado logico.
- Conflitos devem ser explicitados, nao sobrescritos silenciosamente.

