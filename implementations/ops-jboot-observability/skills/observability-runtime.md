---
name: observability-runtime
description: Use para alterar Collector, Mimir, Tempo, Loki, Grafana, tenancy, retenção, dashboards, alertas ou smoke do ops-jboot-observability.
---

# Observability Runtime

## Preflight

1. Ler `PROJECT_CONTRACT.md` e o ADR aceito.
2. Classificar sinais, tenants, cardinalidade, dados sensíveis e storage afetados.
3. Declarar Agent Activation.
4. Verificar impacto no runtime raiz e nos projetos instrumentados.

## Implementação

1. Alterar fonte canônica no projeto antes de adapters externos.
2. Manter imagens fixadas e buckets separados.
3. Aplicar redaction antes de qualquer exporter.
4. Não aceitar header de tenant do workload como autoridade.
5. Provisionar dashboards, datasources e alertas como código.
6. Adicionar teste automatizado para cada regra/configuração nova.

## Validação

```bash
make observability-validate
make observability-smoke
make ai-check
```

O smoke deve gerar e consultar traces, métricas e logs. Subida de containers sem
consulta dos dados não comprova o pipeline.

## Bloqueios

- imagem `latest`;
- segredo real versionado;
- MongoDB/PostgreSQL usados para telemetria bruta;
- PII ou payload de negócio na telemetria;
- storage compartilhado entre sinais;
- mudança de retenção/sampling sem impacto registrado;
- claim de produção baseado apenas no Compose local.

