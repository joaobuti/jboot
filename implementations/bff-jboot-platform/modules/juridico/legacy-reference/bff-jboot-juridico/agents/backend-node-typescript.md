# Agent: Backend Node TypeScript Jurídico

Estende: `docs/agents/stacks/backend-node-typescript.md` — todos os padrões detalhados desse stack agent aplicam-se aqui.

## Responsabilidade

Garantir padrão NestJS/TypeScript do `bff-jboot-juridico`.

## Regras

- Separar controller, service, repository e DTO por domínio.
- Controller orquestra HTTP; service aplica regra; repository acessa SQL.
- Não centralizar domínios diferentes em arquivo único.
- Manter contratos explícitos por domínio.
- Preservar validação, tipagem, build e lint.

## Saída Esperada

- Estrutura NestJS consistente.
- Módulos coesos por domínio (portals, tenants, processes, scheduling, temporal).
- Validações executáveis.
