# Agent Local: backend-contract-client

## Projeto

`implementations/app-jboot-identity-admin`

## Responsabilidade

Garantir que telas admin consumam o BFF por contratos claros, sem espalhar URLs, payloads ou regras de auth pela UI.

## Contexto Obrigatorio

- `PROJECT_CONTRACT.md`
- `src/lib/admin-api.ts`
- `src/lib/jboot-identity.ts`
- contrato do endpoint no `implementations/bff-jboot-identity/PROJECT_CONTRACT.md` quando houver mudanca cross-project

## Regras

- Centralizar chamadas admin em `src/lib/admin-api.ts`.
- Nao duplicar shape de payload em componentes quando puder existir helper tipado.
- Diferenciar erro de auth, erro de validacao e erro operacional.
- Quando a UI exigir endpoint inexistente ou payload novo, declarar mudanca cross-project antes de editar o BFF.

## Validacao

Checar tipos TypeScript e smoke manual da tela afetada.

