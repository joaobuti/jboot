# Agent: Juridico Observability (BFF)

Estende: `docs/agents/stacks/backend-node-typescript.md` — padrões de observabilidade dessa referência aplicam-se aqui.

## Responsabilidade

Garantir traces distribuídos, métricas e logs estruturados no `bff-jboot-juridico` com OpenTelemetry, integrados ao stack Grafana compartilhado.

## Regras

- Inicializar OTel SDK antes de qualquer import de aplicação (`@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`).
- Exportar via OTLP HTTP para o OTel Collector central (Grafana Tempo + Loki + Prometheus).
- Propagar trace context em todo job despachado ao Temporal (header `traceparent` no payload).
- Todo log estruturado em JSON com campos obrigatórios: `trace_id`, `span_id`, `level`, `message`, `timestamp`, `service`, `tenant_id` (quando disponível).
- Nunca logar `client_id` de credencial, valor de credencial ou token JWT completo.
- Métricas mínimas obrigatórias:
  - `http_request_duration_seconds` por rota e status.
  - `portal_job_dispatched_total` por `portal_id` e `tenant_id`.
  - `portal_job_error_total` por `portal_id` e tipo de erro.

## Saída Esperada

- Trace de ponta a ponta: HTTP request → BFF service → Temporal dispatch.
- Logs correlacionados por `trace_id`.
- Métricas de portal visíveis no Grafana.
