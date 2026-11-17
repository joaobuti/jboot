# Skill Local: crud-jboot-identity

## Uso

Aplicar ao criar ou alterar CRUDs administrativos do `bff-jboot-identity`.

## Padrao

- Cada recurso deve ter pasta propria em `src/admin/<resource>`.
- Estrutura esperada:
  - `<resource>.controller.ts`
  - `<resource>.service.ts`
  - `<resource>.repository.ts`
  - `dto/*.dto.ts`
  - `<resource>.module.ts` quando aplicavel
- Controller valida entrada e orquestra HTTP.
- Service concentra regra de negocio.
- Repository concentra SQL.
- DTOs usam `class-validator`.
- Listagens paginam com `limit` e `offset`.
- Mutacoes registram `audit_events`.

## Proibido

- Centralizar CRUDs diferentes em um controller/service unico.
- Criar cliente isolado como fluxo principal.
- Expor dados sensiveis sem necessidade do fluxo.
- Permitir estado incompleto entre cliente, app, membership e entitlement.

## Validacao

Executar `lint`, `typecheck`, `build` e smoke HTTP quando houver endpoint novo ou alterado.

