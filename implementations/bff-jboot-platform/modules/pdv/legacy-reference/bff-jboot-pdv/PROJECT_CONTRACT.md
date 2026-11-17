# Project Contract: bff-jboot-pdv (ARQUIVADO)

> Diretorio `implementations/bff-jboot-pdv` removido em 2026-07-17. Codigo-fonte descontinuado (ver ADR 003); este arquivo e os demais nesta pasta `legacy-reference/` sao mantidos apenas como referencia historica/tecnica, sem contrato ativo. Nao reflete o modulo `bff-jboot-platform/modules/pdv` atual.

## Status

Legado/origem de migracao.

Sprint 1 foi implementada aqui antes da decisao de platform modular. Novas evolucoes backend web do PDV devem mirar `implementations/bff-jboot-platform/modules/pdv`, salvo decisao explicita em contrario.

## Stack

- Node.js 24
- TypeScript
- NestJS
- PostgreSQL compartilhado multi-tenant
- Temporal para workflows duraveis de sync quando implementado
- RabbitMQ quando comandos/eventos assincronos justificarem
- Redis/Valkey para cache, locks, rate limit e estado efemero

## Responsabilidade

Backend do PDV: dominio transacional, produtos, categorias, estoque, clientes do estabelecimento, operadores, vendas, itens, pagamentos, caixa, configuracoes, sync offline e integracoes futuras.

## Direcao Atual

Este projeto nao e mais o destino arquitetural preferencial para novas features web/backend do PDV.

Destino atual:

```text
implementations/bff-jboot-platform/modules/pdv
```

Use este projeto como origem de migracao, referencia de codigo e validacao tecnica da Sprint 1.

## Agents

- `agents/backend-node-typescript.md`: executor principal do backend NestJS.
- `agents/postgres-pdv.md`: modelo relacional multi-tenant do PDV.
- `agents/sync-idempotency.md`: sync offline, idempotencia, outbox e reconciliacao.
- Referencias globais opcionais:
  - `docs/agents/stacks/platform-temporal.md`
  - `docs/agents/stacks/platform-rabbitmq.md`
  - `docs/agents/stacks/platform-redis-valkey.md`

## Skills

- `skills/pdv-domain.md`
- `skills/pdv-crud.md`
- `skills/pdv-sync-contract.md`

## Ativacao Obrigatoria

Antes de qualquer codigo neste projeto, a execucao deve declarar explicitamente:

```text
Agent Activation:
  project: implementations/bff-jboot-pdv
  using_agent:
    - implementations/bff-jboot-pdv/agents/backend-node-typescript.md
    - implementations/bff-jboot-pdv/agents/postgres-pdv.md
  using_skill:
    - implementations/bff-jboot-pdv/skills/pdv-domain.md
    - implementations/bff-jboot-pdv/skills/pdv-crud.md
```

Adicionar `agents/sync-idempotency.md` e `skills/pdv-sync-contract.md` quando a tarefa envolver sync offline, idempotencia, eventos, outbox ou reconciliacao.

Se esse bloco nao for mostrado ao usuario antes da implementacao, a execucao deve ser tratada como nao aderente ao contrato, mesmo que passe em build/testes.

## Entrypoints Planejados

- `src/main.ts`
- `src/app.module.ts`
- `src/auth-context/*`
- `src/products/*`
- `src/inventory/*`
- `src/customers/*`
- `src/operators/*`
- `src/sales/*`
- `src/cash-registers/*`
- `src/payments/*`
- `src/sync/*`
- `src/database/*`
- `docker/postgres/init/*pdv*.sql`

## Contratos

- Identity Hub -> PDV:
  - validar JWT emitido pelo `bff-jboot-identity`;
  - exigir `client_id`, `application_id`, `database_ref`, roles/scopes;
  - nao autenticar CPF/CNPJ diretamente.
- Backend PDV -> Web:
  - OpenAPI para APIs administrativas e caixa online.
- Backend PDV -> App:
  - APIs de bootstrap, delta sync, upload de eventos offline e reconciliacao.
- Backend PDV -> Fiscal:
  - contrato futuro com `svc-jboot-fiscal`.

## Sprint 1 Gate

Codigo funcional da Sprint 1 deve usar estes artefatos como entrada obrigatoria:

- `docs/product/pdv-sprint-1-gate.md`
- `docs/data/pdv-sprint-1-data-model.md`
- `docs/api/pdv-sprint-1-openapi.yaml`

Nao implementar endpoints, migrations ou services da Sprint 1 fora desses contratos sem atualizar o gate primeiro.

## Modelo Multi-Tenant

- Todas as tabelas de negocio devem ter `client_id`.
- Toda query de negocio deve filtrar por `client_id` do JWT/contexto.
- IDs devem usar UUID.
- Eventos offline devem ter chave idempotente por cliente, dispositivo e operacao.
- Vendas offline devem ser aceitas com status de sincronizacao/reconciliacao.

## Validacao

Quando houver codigo:

```bash
npm run lint
npm run typecheck
npm run build
```

Validacoes obrigatorias futuras:

- teste de isolamento por `client_id`;
- teste de idempotencia de venda offline;
- teste de duplicidade de pagamento;
- teste de autorizacao por role/scope;
- teste de contrato OpenAPI.

## Restricoes

- Este contrato e fonte de verdade para execucao neste projeto.
- Agents globais de stack servem como referencia, nao como executor principal.
- Nao criar autenticacao propria.
- Nao acessar banco no controller.
- Controller orquestra HTTP; service aplica regra; repository acessa SQL.
- Nao criar controller/service/repository generico para dominios diferentes.
- Toda mutacao relevante deve gerar auditoria/evento operacional.
- Nao acoplar emissao fiscal ao core PDV.

## Riscos Conhecidos

- Venda offline pode gerar duplicidade se idempotencia for fraca.
- Estoque offline pode divergir; precisa politica de reconciliacao.
- Banco compartilhado exige disciplina rigorosa de `client_id`.
- Pagamentos integrados exigem auditoria e contratos dedicados.
