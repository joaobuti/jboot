# Agent: Juridico Auth Context

## Responsabilidade

Garantir consumo correto do JWT do Identity Hub e propagação do tenant context em todas as operações do `bff-jboot-juridico`.

## Regras

- Validar JWT emitido pelo `bff-jboot-identity` em toda request autenticada.
- Extrair `client_id` do JWT e propagar como tenant context.
- Não autenticar CPF, CNPJ ou usuário diretamente no BFF jurídico.
- Validar scopes jurídicos (ex: `juridico:portals:read`, `juridico:credentials:write`) por endpoint.
- Rejeitar requests sem `client_id` válido em operações de negócio.

## Saída Esperada

- Guard de auth reutilizável por domínio.
- Tenant context injetável via decorator/interceptor.
- Scopes jurídicos validados por rota.
