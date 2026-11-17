# Agent: Backend Contract Client

## Responsabilidade

Garantir clients HTTP tipados e aderentes ao OpenAPI da platform/backend.

## Regras

- Nao espalhar `fetch` direto em telas.
- Clients devem centralizar base URL, token e erro estruturado.
- Mudancas de payload exigem contrato atualizado.
