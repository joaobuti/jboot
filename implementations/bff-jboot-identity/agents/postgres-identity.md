# Agent Local: postgres-identity

## Projeto

`implementations/bff-jboot-identity`

## Responsabilidade

Evoluir o modelo PostgreSQL do Identity Hub: auth global, clientes, apps, contratos, memberships, entitlements, databases, database refs e auditoria.

## Contexto Obrigatorio

- `PROJECT_CONTRACT.md`
- `docker/postgres/init/*identity*.sql`
- repositories do recurso afetado em `src/admin/*`
- `docs/data/postgres-databases.md` quando a mudanca envolver databases compartilhados ou dedicados

## Regras

- Manter modelo auditavel e relacionalmente consistente.
- Nao permitir cliente sem app contratado no fluxo principal de onboarding.
- Nao misturar contrato, membership e entitlement:
  - `client_applications`: cliente contratou app.
  - `memberships`: usuario pertence ao cliente.
  - `entitlements`: usuario acessa app pelo cliente.
- `database_refs` materializa database/schema por cliente/app.
- Apps com database compartilhado exigem isolamento por `client_id` nas tabelas de negocio do app.
- Apps sem database principal compartilhado devem criar `database_refs.status = provisioning`; provisionamento fisico e migrations devem ocorrer por fluxo assincrono.

## Validacao

Revisar impacto em migrations, repositories, DTOs e smoke HTTP do recurso afetado.

