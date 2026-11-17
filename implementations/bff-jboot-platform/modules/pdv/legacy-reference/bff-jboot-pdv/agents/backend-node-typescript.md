# Agent Local: backend-node-typescript

## Projeto

`implementations/bff-jboot-pdv`

## Responsabilidade

Executar mudancas no backend NestJS do PDV com contratos explicitos, modularidade por dominio e isolamento multi-tenant.

## Contexto Obrigatorio

- `PROJECT_CONTRACT.md`
- recurso afetado em `src/<domain>/*`
- `src/auth-context/*` quando autorizacao/contexto for afetado
- migrations quando modelo de dados for afetado

## Regras

- Nao criar autenticacao propria.
- Validar JWT/contexto emitido pelo Identity Hub.
- `client_id` vem do contexto autorizado, nunca de input livre do usuario.
- Controller orquestra HTTP; service aplica regra; repository acessa SQL.
- DTOs explicitos e validação forte.
- UUID em entidades.
- Toda mutacao relevante gera auditoria/evento.

