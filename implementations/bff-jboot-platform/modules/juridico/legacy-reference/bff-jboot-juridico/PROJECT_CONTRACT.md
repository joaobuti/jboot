# Project Contract: bff-jboot-juridico (ARQUIVADO)

> Diretorio `implementations/bff-jboot-juridico` removido em 2026-07-17. Era um esqueleto NestJS nunca desenvolvido alem do boilerplate (health/database/config/auth-context); toda a logica de negocio real (captacao, eproc, credenciais, portais) foi implementada em `bff-jboot-platform/modules/juridico`. Este arquivo e os demais nesta pasta `legacy-reference/` sao mantidos apenas como referencia historica/tecnica, sem contrato ativo.

## Status

Contrato criado após ADR 004. Backend NestJS da automação jurídica SaaS multi-tenant.

## Stack

- Node.js 24
- TypeScript
- NestJS
- PostgreSQL multi-tenant (client_id em todas as tabelas de negócio)
- Redis/Valkey para cache, filas e estado efêmero
- Temporal para orchestração de workflows de scraping e scheduling
- Consome JWT do bff-jboot-identity

## Responsabilidade

API central da plataforma jurídica. Gerencia tenants, portal registry, contratos de acesso por portal, credenciais criptografadas, configuração de agendamento e despacha jobs para os workers via Temporal.

## Agents De Stack (Referência Obrigatória)

Definem padrões detalhados que os agents locais estendem. Devem ser lidos antes de qualquer implementação:

- `docs/agents/stacks/backend-node-typescript.md`: TypeScript estrito, separação domínio/aplicação/adaptadores, observabilidade, testes, timeouts e retries.
- `docs/agents/stacks/platform-temporal.md`: workflows deterministas, activities idempotentes, retry policies explícitos, versionamento, observabilidade por workflow/run/task id.
- `docs/agents/stacks/platform-redis-valkey.md`: TTL explícito, chaves namespaced por tenant, locks com expiração, métricas de hit ratio e latência.

## Agents Globais

- `agents/backend-node-typescript.md`: padrão NestJS/TypeScript do projeto.
- `agents/juridico-auth-context.md`: consumo do JWT do Identity Hub, tenant context, portal scopes.
- `agents/juridico-postgres.md`: padrão PostgreSQL multi-tenant, client_id obrigatório.
- `agents/juridico-observability.md`: OTel, traces distribuídos, métricas e logs estruturados.
- `agents/juridico-portal-failure.md`: ciclo de falha de portal, notificações in-app, suspensão por CAPTCHA.

## Skills Globais

- `skills/portal-registry.md`: criação e manutenção do registry de portais disponíveis.
- `skills/tenant-credential-management.md`: gestão segura de credenciais de portal por tenant.
- `skills/scheduling-config.md`: configuração de intervalos de polling por tenant.
- `skills/observability.md`: setup OTel, exportação OTLP, logs JSON, trace propagation ao Temporal.
- `skills/portal-failure-notification.md`: listener de falha de workflow, criação de notificação in-app, retry policy.

## Ativação Obrigatória

Antes de qualquer código neste projeto, declarar:

```text
Agent Activation:
  project: implementations/bff-jboot-juridico
  module: none
  using_agent:
    - implementations/bff-jboot-juridico/agents/backend-node-typescript.md
    - implementations/bff-jboot-juridico/agents/juridico-auth-context.md
    - implementations/bff-jboot-juridico/agents/juridico-postgres.md
  referenced_only:
    - docs/agents/stacks/backend-node-typescript.md: padrões detalhados de TypeScript/NestJS
    - docs/agents/stacks/platform-temporal.md: padrões de workflow e activity
    - docs/agents/stacks/platform-redis-valkey.md: padrões de cache e locks
  using_skill:
    - implementations/bff-jboot-juridico/skills/portal-registry.md
    - implementations/bff-jboot-juridico/skills/tenant-credential-management.md
    - implementations/bff-jboot-juridico/skills/scheduling-config.md
```

## Entrypoints Planejados

- `src/main.ts`
- `src/app.module.ts`
- `src/platform/auth-context/*`
- `src/platform/database/*`
- `src/portals/*` (registry de portais)
- `src/tenants/*` (contratos, credenciais, configurações)
- `src/processes/*` (processos encontrados)
- `src/scheduling/*` (configuração de polling)
- `src/temporal/*` (integração com Temporal)

## Contratos

- Identity Hub → Juridico:
  - validar JWT emitido pelo `bff-jboot-identity`;
  - exigir `client_id`, `application_id`, roles/scopes jurídicos;
  - não autenticar diretamente.
- Juridico → Workers:
  - despachar jobs Temporal com credenciais criptografadas, portal_id, tenant_id;
  - nunca expor credencial em log.
- Juridico → Web:
  - OpenAPI por domínio.

## Regras Multi-Tenant

- Todas as tabelas de negócio devem ter `client_id` (UUID).
- Toda query de negócio deve filtrar por `client_id` do JWT.
- Credenciais de portal criptografadas por tenant com chave derivada do client_id.
- IDs devem usar UUID.

## Validação

```bash
npm run lint
npm run typecheck
npm run build
```

## Restrições

- Não autenticar CPF/CNPJ diretamente — consumir Identity Hub.
- Não armazenar credenciais de portal em plaintext.
- Não expor credenciais em logs, respostas de API ou traces.
- Workers não acessam banco diretamente — recebem payload do BFF via Temporal.
- Não misturar lógica de scraping no BFF.

## Riscos Conhecidos

- Credenciais de portal são dado sensível crítico — auditoria e criptografia obrigatórias.
- Temporal requer cluster; avaliar managed service vs self-hosted.
