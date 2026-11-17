---
name: crud-jboot-identity
description: Use ao criar ou alterar CRUDs administrativos no bff-jboot-identity, incluindo clients, applications, contratos, memberships, entitlements, database_refs e audit_events.
---

# CRUD JBoot Identity

Use somente para CRUDs admin do `implementations/bff-jboot-identity`.

Fonte executora local: `implementations/bff-jboot-identity/skills/crud-jboot-identity.md`.

Esta skill deve ser aplicada quando o `product-engineer` ou o `architect` definir que a tarefa altera CRUDs administrativos do Identity Hub.

## Regras

- Qualidade e manutencao prevalecem sobre rapidez.
- Antes de criar tela, rota, CRUD ou menu admin, verificar se ja existe artefato com a mesma responsabilidade.
- Se o usuario indicar tela, rota ou arquivo de referencia, revisar exclusivamente esse alvo e seu entorno necessario antes de ampliar escopo.
- Manter rotas admin em `src/admin`, separadas por recurso/dominio.
- Cada CRUD deve ter pasta propria com controller, service, repository e DTOs.
- Nao criar controller/service/repository generico centralizando recursos diferentes.
- Controller orquestra HTTP; service aplica regra; repository acessa SQL.
- Nao acessar banco no controller.
- DTOs usam `class-validator`.
- Toda mutacao registra `audit_events`.
- Rotas admin exigem JWT com role `global_admin` e scope `identity:admin`.
- Usar `uuid` nativo e queries parametrizadas.
- Listagens devem paginar com `limit` e `offset`.
- Nao expor `document_number` por padrao se nao for necessario ao fluxo.
- Nao misturar contrato com permissao:
  - `client_applications`: contrato cliente/aplicacao.
  - `memberships`: usuario pertence ao cliente.
  - `entitlements`: usuario pode acessar aplicacao naquele cliente.
- Validar com `npm run lint`, `npm run typecheck`, `npm run build` e smoke HTTP quando aplicavel.
- Ao alterar esta skill, revisar o fluxo completo de agentes de `pedido` ate validacao final.
