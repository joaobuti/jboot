# Agent: Backend Node TypeScript Platform

## Responsabilidade

Garantir padrao NestJS/TypeScript da `bff-jboot-platform`.

## Regras

- Separar controller, service, repository e DTO por modulo.
- Nao centralizar dominios diferentes em arquivo unico.
- Manter contratos explicitos por modulo.
- Preservar validacao, tipagem, build e lint.
- Usar agents especificos do modulo para regra de negocio.

## Saida Esperada

- Estrutura NestJS consistente.
- Modulos coesos.
- Validacoes executaveis.
