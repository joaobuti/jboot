# Skill: observability (Workers)

## Objetivo

Implementar OpenTelemetry em Python no `wrk-jboot-juridico` com continuação de trace do BFF e exportação para Grafana.

## Procedimento

1. Instalar: `opentelemetry-sdk`, `opentelemetry-exporter-otlp-proto-http`, `opentelemetry-instrumentation-requests`.
2. Inicializar OTel no entrypoint do worker antes de registrar activities.
3. Configurar resource: `service.name=wrk-jboot-juridico`, `service.version`, `deployment.environment`.
4. Ao receber activity: extrair `traceparent` do payload e criar span filho com `use_span(context.attach(...))`.
5. Criar spans customizados por operação de scraping com atributos: `portal.id`, `operation.type`, `tenant.id` (anonimizado se necessário).
6. Logger estruturado JSON: biblioteca `structlog` ou `python-json-logger` com campos `trace_id`, `span_id`, `workflow_id`, `portal_id`.
7. Exportar traces via OTLP HTTP para `OTEL_EXPORTER_OTLP_ENDPOINT` (env var).
8. Métricas via `opentelemetry-sdk` metrics API: `scraping_duration_seconds`, `scraping_error_total`, `auth_failure_total`.

## Restrições

- Nunca incluir credencial ou dado de autenticação em atributo de span ou campo de log.
- `OTEL_EXPORTER_OTLP_ENDPOINT` obrigatório via env var.
- `tenant.id` em spans: usar hash ou UUID interno — nunca CPF, CNPJ ou nome real.
