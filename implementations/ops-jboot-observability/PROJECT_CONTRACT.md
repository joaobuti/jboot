# Project Contract: ops-jboot-observability

## Status

```yaml
lifecycle_status: functional
production_readiness: blocked
status_evidence: make observability-validate, make observability-smoke e make observability-root-smoke aprovados em 2026-08-03; security/SECURITY_CHECKLIST.md concluido
last_status_review: 2026-08-03
```

Capability operacional interna responsável pela coleta, persistência, consulta e
visualização da telemetria dos produtos JBoot. Não é produto selecionável no
Identity e não concede entitlement a usuários finais.

## Responsabilidade

- receber traces, métricas e logs por OTLP;
- aplicar limites, normalização, redaction, batching e retries no gateway;
- persistir métricas no Mimir, traces no Tempo e logs no Loki;
- provisionar Grafana, datasources, dashboards e alertas como código;
- separar telemetria por tenant e permitir visão operacional global controlada;
- definir o contrato semântico que os projetos instrumentados devem cumprir;
- manter runtime local mínimo e caminho explícito para implantação distribuída.

## Stack

| Componente | Versão inicial | Responsabilidade |
|---|---:|---|
| OpenTelemetry Collector Contrib | 0.157.0 | gateway OTLP e políticas de ingestão |
| Grafana | 13.1.0 | consulta, dashboards e alertas |
| Grafana Mimir | 3.0.6 | métricas Prometheus multi-tenant |
| Grafana Tempo | 2.10.5 | traces multi-tenant |
| Grafana Loki | 3.7.2 | logs multi-tenant |
| MinIO | RELEASE.2025-09-07T16-13-09Z | object storage somente local |
| PostgreSQL | 18.4 | plano de controle do Grafana |

As imagens devem permanecer fixadas. Atualização exige validação de configuração,
smoke end-to-end, revisão de breaking changes e auditoria de dependências.

## Persistência

- métricas: blocos TSDB do Mimir em object storage;
- traces: blocos Parquet do Tempo em object storage;
- logs: chunks e índice TSDB do Loki em object storage;
- dashboards, datasources e alertas: Git como fonte canônica;
- estado interno do Grafana: PostgreSQL `jboot_observability`;
- MongoDB: proibido por padrão e rejeitado para telemetria bruta;
- auditoria legal: fora desta stack, em storage com política própria.

Buckets locais separados:

- `jboot-observability-mimir-blocks`;
- `jboot-observability-mimir-ruler`;
- `jboot-observability-mimir-alertmanager`;
- `jboot-observability-tempo-traces`;
- `jboot-observability-loki-chunks`.

## Multi-tenancy E Contrato Semântico

O gateway é a fronteira confiável que injeta o tenant do backend. Headers
`X-Scope-OrgID` recebidos de workloads não são autoridade de tenancy.

Atributos Resource canônicos:

```text
service.name
service.version
deployment.environment.name
cloud.region
jboot.product
jboot.application
jboot.client.id
jboot.database.ref
jboot.isolation_strategy
```

CPF, CNPJ, e-mail, tokens, credenciais, payloads de negócio e connection strings
não podem ser enviados. `jboot.client.id` e `jboot.database.ref` usam identificadores
internos opacos. Labels de métricas possuem allowlist; contexto de alta cardinalidade
fica prioritariamente em traces e logs.

O runtime local usa o tenant fixo `jboot-local`. A produção deverá validar a
identidade do workload em proxy/gateway e derivar tenant sem confiar em headers da
aplicação.

## Retenção E Sampling

- métricas: 396 dias;
- logs operacionais: 30 dias;
- traces: 14 dias;
- ambiente local: mesmos contratos com volume reduzido;
- métricas não são amostradas;
- traces locais usam 100%; produção inicia com 10% de sucesso e preserva erros,
  operações lentas e fluxos críticos por tail sampling;
- mudanças de retenção ou sampling exigem registro de custo, risco e efeito em SLO.

## Interfaces

- OTLP gRPC externo local: `localhost:14317`;
- OTLP HTTP externo local: `localhost:14318`;
- workloads Docker: `host.docker.internal:14317/14318`, publicado somente no
  endereço configurado em `OBS_DOCKER_GATEWAY_ADDRESS`;
- Grafana: `http://localhost:3300`;
- Mimir API: `http://localhost:9009`;
- Tempo API: `http://localhost:3200`;
- Loki API: `http://localhost:3100`;
- MinIO API/console: `localhost:9100` / `http://localhost:9101`;
- PostgreSQL: não exposto ao host por padrão.

Somente Grafana e endpoints necessários ao smoke local são publicados, ligados a
loopback ou na bridge Docker explicitamente configurada. Não há bind default em
`0.0.0.0`. Produção exige rede privada, TLS/mTLS, autenticação e autorização externa.

## Contratos Obrigatorios

- `docs/product/ai-usage-metering-sprints.md` (S4): painel e alertas de
  consumo de IA por cliente e aplicacao no Grafana, lendo uma visao agregada
  somente leitura do banco `jboot_ai_gateway` com usuario proprio (so
  `SELECT` na visao). Unica leitura deste stack fora de OTLP; confirmado em
  2026-11-14.

## Agents Locais

- `agents/observability-platform-engineer.md`;
- `agents/sre.md`;
- `agents/security-engineer.md`.

## Skills Locais

- `skills/observability-runtime.md`.

## Ativação Obrigatória

```text
Agent Activation:
  project: implementations/ops-jboot-observability
  module: none
  using_agent:
    - implementations/ops-jboot-observability/agents/observability-platform-engineer.md
    - implementations/ops-jboot-observability/agents/sre.md
    - implementations/ops-jboot-observability/agents/security-engineer.md
  using_skill:
    - implementations/ops-jboot-observability/skills/observability-runtime.md
    - docs/skills/dev-runtime-profile/SKILL.md
    - docs/skills/security-checklist/SKILL.md
```

## Dev Runtime Profile

### Target Runtime Matrix

- target: `make observability-up`
  - purpose: executar a plataforma local persistente para desenvolvimento;
  - containers:
    - required: `observability-postgres`, `observability-minio`, `minio-init`,
      `mimir`, `tempo`, `loki`, `otel-gateway`, `grafana`;
    - optional: `telemetrygen-traces`, `telemetrygen-metrics`, `telemetrygen-logs`;
    - forbidden_by_default: `mongodb`, `redpanda`, modo distribuído, aplicações JBoot;
  - app_processes:
    - required: nenhum;
    - optional: scripts de validação e smoke;
    - forbidden_by_default: processos de produtos;
  - ports: `3300`, `14317`, `14318`, `9009`, `3200`, `3100`, `9100`, `9101`;
  - healthchecks: PostgreSQL, MinIO, Mimir, Tempo, Loki, Collector e Grafana;
  - seed_dependencies: criação idempotente dos cinco buckets MinIO;
  - expected_resource_profile: mínimo recomendado de 8 GiB RAM disponíveis ao Docker;

- target: `make observability-smoke`
  - purpose: comprovar traces, métricas e logs ponta a ponta;
  - containers:
    - required: todos de `observability-up`;
    - optional: nenhum;
    - forbidden_by_default: `mongodb`, aplicações JBoot e modo distribuído;
  - app_processes:
    - required: três execuções one-shot do `telemetrygen` e consultas às APIs;
    - optional: nenhum;
    - forbidden_by_default: geradores contínuos de carga;
  - ports: os mesmos de `observability-up`;
  - healthchecks: os mesmos, mais consultas por tenant aos três backends;
  - seed_dependencies: buckets locais;
  - expected_resource_profile: mínimo recomendado de 8 GiB RAM disponíveis ao Docker;

- target: `make observability-root-smoke`
  - purpose: comprovar o fluxo collector raiz -> gateway -> Tempo;
  - containers:
    - required: todos de `observability-up` e `jboot-otel-collector`;
    - optional: telemetrygen one-shot;
    - forbidden_by_default: aplicações de negócio e geradores contínuos de carga;
  - app_processes:
    - required: telemetrygen com identificador único e polling do Tempo;
    - optional: nenhum;
    - forbidden_by_default: nenhum processo persistente adicional;
  - ports: `4317/4318` no collector raiz e `14317/14318` no gateway;
  - healthchecks: readiness da plataforma e consulta do trace encaminhado;
  - seed_dependencies: buckets locais;
  - expected_resource_profile: o mesmo de `observability-smoke`;

- target: `observability-scale`
  - purpose: implantação distribuída futura;
  - containers:
    - required: pendente do provedor de produção;
    - optional: Redpanda/Kafka, caches e gateways regionais;
    - forbidden_by_default: execução implícita em desenvolvimento;
  - app_processes: definidos no deployment contratado;
  - ports: somente privados, definidos por ambiente;
  - healthchecks: SLOs por componente e por pipeline;
  - seed_dependencies: buckets e credenciais gerenciados pelo provedor;
  - expected_resource_profile: dimensionado por ingestão, cardinalidade e retenção reais.

### Rules

- a stack não sobe junto a targets mínimos de produtos;
- `observability-scale` não possui comando local implícito;
- `make observability-down` preserva volumes;
- remoção de volumes exige comando e confirmação separados, fora da fundação;
- MinIO é somente local; produção usa object storage gerenciado ou dedicado;
- PostgreSQL, MongoDB e object storage dos produtos não são reutilizados.

## Definition Of Done Da Fundação

- `docker compose config` válido;
- configurações dos quatro componentes validadas por seus binários;
- testes automatizados do contrato aprovados;
- smoke gera e consulta traces, métricas e logs no tenant local;
- reinício preserva dados;
- dashboard e datasources são provisionados;
- nenhum segredo real ou dado pessoal é versionado;
- `security-checklist`, `make ai-check` e `make ai-conformance` aprovados.

## Riscos Conhecidos

- o runtime monolítico não prova capacidade ou HA de produção;
- retenções são defaults de planejamento e exigem revisão após medir ingestão;
- federation e isolamento por cliente dependem do gateway autenticado de produção;
- dashboards globais podem induzir cardinalidade excessiva sem recording rules;
- MinIO local não representa durabilidade de object storage gerenciado.
- MinIO OSS local possui exceções de CVE por alcançabilidade documentadas no
  checklist de segurança e é proibido em produção.
