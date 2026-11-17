# ADR 008: Capability como sub-modulo de Application

```
date: 2026-08-23
status: accepted
supersedes-parcial: 006 (amplia o conceito de capability)
```

## Contexto

A [ADR 006](006-client-capabilities.md) criou `capability_registry` + `client_capabilities` para servicos internos s2s (ex: `fiscal` -> svc-jboot-fiscal), definindo capability estritamente como "servico s2s sem UI".

Na pratica, ate 2026-08-23, coexistiam **tres mecanismos paralelos** para representar "o cliente X tem o recurso Y habilitado":

1. **Linha em `client_applications`** — modulo contratado com UI e sessao Identity (PDV, Juridico, Flow). Aparece no seletor pos-login.
2. **Chave em `client_applications.config` (jsonb)** — flag ad-hoc por tenant. Unico caso: `autoatendimento_habilitado` (depois `autoatendimento_comanda`), que liga/desliga o cardapio publico do QR de mesa da `comanda`.
3. **`capability_registry` + `client_capabilities`** — servico s2s. Unico caso: `fiscal`.

Os dois sub-recursos reais do PDV — `comanda` e `fiscal` — viviam em tabelas diferentes, por caminhos diferentes, e **nenhum tinha UI de gestao**: `comanda` dependia de `UPDATE` manual no jsonb (nao reproduzido por nenhum seed), e `fiscal` nunca teve toggle nem era validado antes da chamada s2s.

A flag jsonb, alem disso, nao tem catalogo (a tela teria de hardcodar quais chaves existem por application), nao tem FK e nao tem auditoria de quem ligou.

## Decisao

**Capability deixa de significar "servico s2s sem UI" e passa a significar "capacidade contratavel que nao e uma application".** Isso cobre dois casos:

- **Servico s2s** (ex: `fiscal`): sem UI propria, consumido por BFF. `service_name` preenchido.
- **Sub-feature de uma application** (ex: `comanda`): tem UI, mas nao tem sessao Identity persistente propria (por isso ja era isenta de `application_slug` — ver `AGENTS.md`). Roda dentro do BFF da application pai. `service_name` NULL.

O criterio para ser capability (e nao application) permanece: **nao ter sessao Identity persistente propria nem aparecer no seletor pos-login.** O criterio para ter `application_slug` preenchido e: **ser oferecida como sub-modulo de uma application contratada.**

### Mudancas de schema

`docker/postgres/init/044_capability_application_submodules.sql`:

- `capability_registry.application_slug TEXT NULL REFERENCES applications(slug)` — agrupa a capability sob a application pai. NULL = capability s2s pura sem application pai (comportamento da ADR 006 preservado).
- `capability_registry.service_name` passa a ser NULLABLE — sub-feature sem container s2s dedicado nao tem servico.
- `fiscal` recebe `application_slug = 'pdv'`.
- `comanda` entra no catalogo (`application_slug = 'pdv'`, `service_name` NULL).
- Estado por cliente de `autoatendimento_comanda` migra do jsonb para `client_capabilities`; a chave jsonb e removida.

### Fonte de verdade

- **Contratou o modulo?** existencia + `status` da linha em `client_applications`.
- **Sub-modulo/capability ligado?** `client_capabilities.enabled` (fonte unica; jsonb aposentado para este fim).

### API (BFF Identity)

- `GET /admin/capabilities[?applicationSlug=]` — catalogo global.
- `GET /admin/clients/:clientId/capabilities` — catalogo com estado do cliente sobreposto (LEFT JOIN: capability nao tocada aparece `enabled=false`, nao some).
- `PUT /admin/clients/:clientId/capabilities` — upsert em lote, valida slugs contra o catalogo, audita `admin_client_capabilities_updated`.

### UI (identity-admin)

Tela de clientes (`identity/clientes`) passa a mostrar "Modulos contratados" e "Sub-modulos" em **criacao E edicao** (antes o bloco de contrato so existia na criacao). Sub-modulos exibidos sao os das applications marcadas; desmarcar o modulo pai desliga seus sub-modulos no save.

### Consumo

`bff-jboot-platform` `public-menu.repository.ts` le `client_capabilities` (slug `comanda`, `cr.active = true`) em vez do jsonb. Desativar a capability no catalogo global (`capability_registry.active = false`) desliga o cardapio para todos os clientes de uma vez.

## Racional

- Um mecanismo unico para "recurso habilitado por cliente que nao e application", com catalogo consultavel, FK e auditoria (`enabled_by`/`enabled_at`, ja previstos no schema da ADR 006).
- A tela descobre os sub-modulos a partir do banco — nada hardcoded por application.
- Reaproveita a infra da ADR 006 em vez de criar uma quarta tabela.

## Consequencias

- A afirmacao da ADR 006 "capability = servico s2s sem UI" fica ampliada, nao revogada: capability s2s continua valida (`application_slug` NULL, `service_name` preenchido).
- `service_name` nullable exige que consumidores s2s tratem NULL como "sem servico dedicado".
- Bases existentes (dev com dados, producao) precisam aplicar `044` manualmente — o arquivo so roda automaticamente em volume Postgres novo.

## Decisoes futuras (herdadas da ADR 006, ainda abertas)

- Endpoint `GET /capabilities` no BFF Identity para BFFs verificarem capability antes de chamar servico s2s (hoje `fiscal` ainda nao e validado pelo BFF PDV antes da chamada).
- Menu "Configuracoes" compartilhado entre aplicacoes para flags de tenant que nao sejam contrato comercial.
