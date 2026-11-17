# Agent: Juridico Observability (Workers)

Estende: `docs/agents/stacks/backend-python.md` e `docs/agents/stacks/platform-temporal.md`.

## Responsabilidade

Garantir traces distribuídos, métricas e logs estruturados no `wrk-jboot-juridico`, com continuação do trace originado no BFF via context propagation.

## Regras

- Inicializar OTel SDK Python no entrypoint do worker (`opentelemetry-sdk`, `opentelemetry-exporter-otlp`).
- Extrair `traceparent` do payload Temporal ao iniciar cada activity — continuar o trace do BFF, não criar trace novo.
- Criar spans customizados para operações de scraping: `portal.authenticate`, `portal.search_cpf`, `portal.search_process`, `portal.parse_result`.
- Todo log estruturado em JSON com campos: `trace_id`, `span_id`, `level`, `message`, `timestamp`, `service`, `portal_id`, `workflow_id`.
- Nunca logar credencial, token ou dado sensível — nem em modo debug.
- Métricas mínimas obrigatórias:
  - `scraping_duration_seconds` por `portal_id` e `operation`.
  - `scraping_error_total` por `portal_id` e `error_type`.
  - `auth_failure_total` por `portal_id`.

## Saída Esperada

- Trace contínuo BFF → Temporal → Worker visível no Grafana Tempo.
- Spans de scraping com duração por portal e por operação.
- Logs correlacionados por `trace_id` e `workflow_id`.
