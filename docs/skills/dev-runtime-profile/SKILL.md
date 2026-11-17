---
name: dev-runtime-profile
description: Use when creating a new JBoot project/module or changing local development infrastructure, docker-compose, Makefile dev-up targets, ports, seeds, workers, queues, observability, or runtime dependencies.
---

# Dev Runtime Profile

## Objetivo

Toda aplicacao ou modulo deve declarar explicitamente o que precisa subir para execucao local, desenvolvimento e smoke test. `dev-up` deve subir o menor conjunto operacional correto, nao a infra completa por conveniencia.

## Quando Usar

Use antes de alterar ou criar:

- `docker-compose.yml`, `Makefile`, `tools/dev-up.sh`, scripts de seed ou healthcheck.
- `PROJECT_CONTRACT.md`, `MODULE_CONTRACT.md` ou `AI_CONTEXT.md` de novo projeto/modulo.
- Qualquer modulo em `implementations/*` que dependa de banco, fila, cache, storage, worker, observabilidade ou frontend/backend local.
- Novos agents/skills que afetem operacao local.

## Contrato Obrigatorio

Cada projeto/modulo deve ter uma secao `Dev Runtime Profile` no contrato correspondente.

```text
## Dev Runtime Profile

### Target Runtime Matrix
- target: <command>:<target>
  - purpose:
  - containers:
    - required:
    - optional:
    - forbidden_by_default:
  - app_processes:
    - required:
    - optional:
    - forbidden_by_default:
  - ports:
  - healthchecks:
  - seed_dependencies:
  - expected_resource_profile:

### Rules
- Full stack somente via target/profile explicito `full`.
- Servicos pesados devem ser opt-in.
- Cada target deve ter sua propria matriz; nao reutilize a matriz de outro target por inferencia.
- Um target de modulo nao pode subir container/processo sem justificativa no contrato.
```

## Classificacao De Servicos

- `required_services`: indispensaveis para o fluxo declarado.
- `optional_services`: uteis para features especificas, mas opt-in.
- `forbidden_by_default`: pesados ou irrelevantes para o target; nao sobem sem target explicito.
- `app_processes`: processos Node/Python/etc. iniciados dentro do container/app host.

Servicos normalmente pesados ou especializados: ClickHouse, Qdrant, Redpanda, Temporal, RabbitMQ, MinIO, OTel collector, workers de scraping, apps mobile, frontends adicionais.

## Regras De Decisao

1. Comece pelo fluxo do usuario: login, modulo, API, worker ou integracao.
2. Liste dependencias reais por fluxo, nao por disponibilidade no compose.
3. Separe infraestrutura de processos de aplicacao.
4. `TARGET=<modulo>` deve ser minimo e reproduzivel.
5. `TARGET=full` e o unico lugar aceitavel para subir tudo.
6. Se um servico nao e chamado pelo fluxo nem por healthcheck obrigatorio, ele fica opt-in.
7. Se a mudanca adiciona servico pesado, documente memoria/custo operacional esperado.
8. Seeds devem ser idempotentes e separados quando forem caros.
9. Targets parecidos ainda precisam de matrizes separadas quando diferirem em processos, seeds, portas, workers ou containers.
10. Seed de novo projeto/modulo deve conceder entitlement administrativo ativo ao usuario senior de testes e administracao geral (`Operador Senior`, cpf `00000000191`, cliente `JBoot` cnpj `63784101000110`) no novo `application_slug`, replicando `docker/postgres/init/007_identity_pdv_dev_seed.sql`/`010_identity_juridico_dev_seed.sql`. `seed_dependencies` do `Target Runtime Matrix` deve citar esse seed.
11. Todo modulo/projeto selecionavel por usuario final tambem deve conceder admin do modulo ao `Usuario Teste` (`cpf 00011122233`) no cliente publico `Demo JBoot` (`cnpj 22345678000199`), exceto `identity-admin`. Nao vincular o `Usuario Teste` ao cliente `JBoot`; documentar rotina de reset dos dados demo no contrato.

## Validacao

Antes de concluir mudancas de infra/dev-up:

- Verifique o contrato `Dev Runtime Profile`.
- Verifique se cada target alterado possui `Target Runtime Matrix`.
- Se criar comando de subida, crie tambem comando de parada/restart ou documente por que nao se aplica.
- Compare `docker compose ps`, portas e processos iniciados com o target.
- Confirme que servicos `forbidden_by_default` nao sobem em targets minimos.
- Execute healthchecks dos required services.
- Informe qualquer validacao que nao pode ser executada.
