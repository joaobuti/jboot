# Roadmap: ops-jboot-observability

## Sprint 0 — Fundação E Contratos

- objetivo: materializar ownership, arquitetura, persistência e runtime;
- entregáveis: contrato, ADR, agents, skill, Compose, configurações e testes;
- critérios: validação estática e configurações aceitas pelos binários;
- fora: instrumentar todos os produtos.

## Sprint 1 — Vertical Slice Local

- objetivo: comprovar os três sinais ponta a ponta;
- entregáveis: telemetrygen, consultas automatizadas, datasources e dashboard;
- critérios: dados persistidos e recuperados no tenant `jboot-local`;
- fora: HA e carga de produção.

## Sprint 2 — Padrão De Instrumentação JBoot

- objetivo: aplicar contrato semântico a um fluxo de referência;
- projetos: `ops-jboot-observability` e um BFF/worker escolhido por novo preflight;
- critérios: propagação de contexto, exemplars, redaction e testes de regressão;
- fora: migração simultânea de todos os projetos.

## Sprint 3 — SLOs E Operação

- objetivo: transformar telemetria em controle de qualidade;
- entregáveis: SLIs, SLOs, error budgets, recording rules, alertas e runbooks;
- critérios: alertas testados e vinculados a diagnóstico/rollback;
- fora: metas contratuais por produto sem baseline real.

## Sprint 4 — Produção Distribuída

- objetivo: implantar por região/cluster com isolamento e HA;
- dependências: provedor, Kubernetes, object storage, identidade de workload,
  capacidade esperada, RTO/RPO e residência de dados;
- arquitetura Mimir: avaliar e adotar `ingest storage` com Kafka como baseline
  preferencial para nova implantação; o modo clássico deste runtime é somente
  fundação local e não constitui decisão de topologia produtiva;
- critérios: carga, falha, restore, upgrade e rollback comprovados;
- fora: prometer `production_ready` antes da Definition of Done.
