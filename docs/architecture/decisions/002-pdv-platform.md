# ADR 002: Plataforma PDV

## Status

Substituida parcialmente por `003-jboot-platform-modular-monolith.md`.

As decisoes de stack permanecem validas. A decisao de separar backend/web PDV em projetos proprios foi substituida pela direcao de platform modular para web/backend.

## Contexto

O produto PDV sera uma plataforma multi-tenant para vendas/frente de caixa, com web online, app mobile/tablet offline-first e login centralizado pelo Identity Hub existente.

O produto deve suportar especializacoes futuras por segmento, como mercado e restaurante/comandas, sem misturar regras especializadas no core generico.

## Decisao

```text
backend_pdv: Node.js 24 + TypeScript + NestJS + PostgreSQL
web_pdv: React + Next.js + TypeScript
mobile_pdv: React Native + Expo + SQLite local
sync: Temporal + outbox PostgreSQL
messaging: RabbitMQ quando comandos/eventos assincronos justificarem
ephemeral_state: Redis/Valkey para cache, locks, rate limit e estado efemero
fiscal: servico separado em sprint posterior
identity: Identity Hub existente
tenant_model: PostgreSQL compartilhado com client_id obrigatorio
```

## Projetos

```text
implementations/bff-jboot-platform/modules/pdv
implementations/app-jboot-next-platform/modules/pdv
implementations/app-jboot-pdv-mobile
implementations/svc-jboot-fiscal
```

Projetos `implementations/bff-jboot-pdv` e `implementations/app-jboot-pdv-web` existem como origem de migracao da Sprint 1.

## Racional

- NestJS/TypeScript alinha o backend PDV ao Identity Hub, reduzindo friccao de contratos, DTOs, validacao e OpenAPI.
- Next.js/React/TypeScript permite reutilizar uma copia derivada do template `Next-TS`, pois a stack escolhida e compativel.
- React Native/Expo permite base unica para mobile/tablet e reuso de TypeScript, mas com componentes nativos equivalentes ao design system.
- SQLite local no app e necessario para venda offline real.
- PostgreSQL compartilhado e adequado para dominio transacional, desde que `client_id` seja obrigatorio e validado em todas as queries.
- Temporal e recomendado para sincronizacao critica, retries, compensacao e workflows duraveis.
- RabbitMQ fica como fila/comando assincrono quando houver necessidade clara.
- Redis/Valkey nao e fonte de verdade; sera usado para locks, cache, rate limit e estado efemero.
- Fiscal deve ser servico separado por ser dominio regulado, reutilizavel e de alto risco operacional.

## Contratos Obrigatorios

- Identity Hub -> PDV.
- Backend PDV -> Web PDV.
- Backend PDV -> App PDV.
- App PDV -> Sync offline.
- Backend PDV -> Fiscal, na sprint fiscal.
- Design system web/app.

## Riscos

- Venda offline exige idempotencia forte para evitar duplicidade.
- Banco compartilhado exige isolamento por `client_id` em toda tabela e query de negocio.
- Estoque offline pode gerar conflito; a primeira versao deve declarar politica de reconciliacao.
- Fiscal nao pode ficar acoplado ao core PDV.
- Pagamentos integrados exigem contratos e auditoria especificos.
