# Skill: observability (BFF)

## Objetivo

Implementar OpenTelemetry no `bff-jboot-juridico` com exportação para Grafana (Tempo + Loki + Prometheus).

## Procedimento

1. Instalar: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/exporter-metrics-otlp-http`.
2. Criar `src/platform/telemetry/otel.ts` — inicializar SDK antes de qualquer import de módulo NestJS.
3. Configurar resource attributes: `service.name=bff-jboot-juridico`, `service.version`, `deployment.environment`.
4. Ativar auto-instrumentação: HTTP, NestJS, PostgreSQL (pg), Redis.
5. Exportar traces via OTLP HTTP para `OTEL_EXPORTER_OTLP_ENDPOINT` (env var).
6. Logger estruturado JSON com campos: `trace_id`, `span_id`, `level`, `message`, `timestamp`, `service`, `tenant_id`.
7. Ao despachar job Temporal: injetar `traceparent` e `tracestate` no header do payload.
8. Registrar métricas customizadas: `portal_job_dispatched_total`, `portal_job_error_total`.

## Restrições

- `otel.ts` deve ser o primeiro import em `src/main.ts`.
- Não logar valor de credencial, JWT completo ou `client_id` de credencial.
- `OTEL_EXPORTER_OTLP_ENDPOINT` obrigatório via variável de ambiente — sem default hardcoded.
