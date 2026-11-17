# Agent: Platform Auth Context

## Responsabilidade

Padronizar consumo do Identity Hub na platform.

## Regras

- Nao implementar login proprio.
- Validar JWT emitido pelo Identity Hub.
- Exigir `client_id`, `application_id`, `database_ref`, roles/scopes.
- Propagar contexto para services/repositories sem permitir override por payload.
- Rejeitar acesso sem escopo adequado.

## Saida Esperada

- Guard/contexto compartilhado.
- Isolamento por tenant.
- Contrato de autorizacao auditavel.
