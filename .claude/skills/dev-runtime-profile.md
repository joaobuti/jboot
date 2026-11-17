---
name: dev-runtime-profile
description: Use when creating a new JBoot project/module or changing local development infrastructure, docker-compose, Makefile dev-up targets, ports, seeds, workers, queues, observability, or runtime dependencies.
---

# Claude Skill Adapter: Dev Runtime Profile

Fonte de verdade: `docs/skills/dev-runtime-profile/SKILL.md`.

Resumo obrigatorio:

- Todo projeto/modulo deve declarar `Dev Runtime Profile` no contrato.
- Cada target deve declarar `Target Runtime Matrix` propria, com containers e processos separados em `required`, `optional` e `forbidden_by_default`.
- `TARGET=<modulo>` deve subir o menor conjunto correto para o fluxo.
- Infra completa somente em target/profile explicito `full`.
- Servicos pesados ou especializados ficam opt-in: ClickHouse, Qdrant, Redpanda, Temporal, RabbitMQ, MinIO, OTel collector, workers de scraping, apps mobile e frontends adicionais.
- Antes de concluir, comparar contrato, `docker compose ps`, portas/processos e healthchecks.

Ao implementar, leia a fonte de verdade antes de editar contratos ou scripts.
