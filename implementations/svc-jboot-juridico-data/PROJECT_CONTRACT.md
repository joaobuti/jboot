# Project Contract: svc-jboot-juridico-data

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: Sprint 1 implementada com API FastAPI, DataJud allowlisted, JWT s2s, testes, auditoria de dependencias e smoke Identity -> servico aprovados
last_status_review: 2026-08-27
```

## Identificacao

| Campo | Valor |
|---|---|
| Projeto | `implementations/svc-jboot-juridico-data` |
| Tipo | Servico interno s2s |
| Capability slug | `juridico-data` |
| Application Identity | Nao se aplica |
| Runtime planejado | Python 3.12+ / FastAPI |
| Porta local reservada | `8030` |
| Banco proprio | Nenhum na Sprint 1 |

O servico nao e selecionavel por usuario, nao possui frontend, entitlement ou
rota `/usuarios`. Deve ser registrado em `capability_registry` como capability
interna quando o runtime for materializado.

## Responsabilidade

Integrar APIs judiciais oficiais, normalizar seus contratos e oferecer uma API
REST interna deterministica para BFFs autorizados.

Sprint 1:

- catalogo DataJud de tribunais;
- consulta por numero CNJ;
- processo e movimentacoes normalizados;
- bloqueio de processo sigiloso;
- timeout, retry, rate limit e erros estruturados;
- observabilidade sem dados processuais ou secrets.

Acompanhamento em segundo plano (ADR 021, Sprint 4 de
`docs/product/process-monitoring-sprints.md`, 2026-11-08):

- cabecalho opcional `X-JBoot-Query-Mode: background` na consulta por CNJ: uma
  tentativa so, com `JURIDICO_DATA_BACKGROUND_REQUEST_TIMEOUT_SECONDS` (padrao
  60 s, maximo 120 s); quem chama serializa as consultas e repete pelo Temporal;
- sem o cabecalho, a consulta de tela segue com `JURIDICO_DATA_REQUEST_TIMEOUT_SECONDS`
  (12 s) e as novas tentativas internas.

Sprint 4:

- adaptador DJEN público com URL fixa, filtros explícitos, paginação e
  normalização sem payload bruto;
- somente callers S2S autorizados; BFF continua owner de tenant e persistência.

Nao e responsabilidade do servico:

- autenticar usuario final ou resolver tenant/database;
- persistir processo, snapshot ou auditoria;
- executar Playwright ou manter sessao de portal;
- orquestrar polling duravel;
- resumir dados por LLM;
- confirmar leitura ou executar ato com efeito juridico.

## Stack Fit Gate

Escolha confirmada em `docs/architecture/decisions/009-juridico-official-data-service.md`:

- Python 3.12+;
- FastAPI + Uvicorn;
- Pydantic v2;
- HTTPX;
- Tenacity;
- Structlog + OpenTelemetry;
- pytest, pytest-asyncio, respx, pyright, mypy e Ruff.

FastMCP nao e dependencia necessaria da Sprint 1. MCP podera ser adapter de
borda futuro, nunca substituto da API REST interna nem do BFF.

## Agents Locais

- `agents/juridico-data-domain.md`;
- `agents/juridico-data-integrations.md`.

## Skills Locais

- `skills/datajud-contract.md`;
- `skills/upstream-adaptation.md`;
- `skills/internal-service-security.md`.

## Ativacao Obrigatoria

Antes de qualquer codigo funcional neste projeto, declarar:

```text
Agent Activation:
  project: implementations/svc-jboot-juridico-data
  module: none
  using_agent:
    - implementations/svc-jboot-juridico-data/agents/juridico-data-domain.md
    - implementations/svc-jboot-juridico-data/agents/juridico-data-integrations.md
  using_skill:
    - implementations/svc-jboot-juridico-data/skills/datajud-contract.md
    - implementations/svc-jboot-juridico-data/skills/upstream-adaptation.md
    - implementations/svc-jboot-juridico-data/skills/internal-service-security.md
    - docs/skills/dev-runtime-profile/SKILL.md
    - docs/skills/security-checklist/SKILL.md
  referenced_only:
    - docs/agents/stacks/backend-python.md: padroes Python, Pydantic, HTTP e testes
  not_using:
    - implementations/wrk-jboot-juridico/agents/scraping-worker.md: DataJud nao usa Playwright
    - implementations/wrk-jboot-juridico/skills/temporal-worker-pattern.md: consulta manual nao exige workflow duravel
```

## Contratos Obrigatorios

- `docs/architecture/decisions/009-juridico-official-data-service.md`;
- `docs/product/juridico-official-data-sprints.md`;
- `docs/product/juridico-official-data-sprint-1-gate.md`;
- `docs/product/juridico-official-data-sprint-2-gate.md`;
- `docs/api/juridico-data-sprint-1-service-openapi.yaml`;
- `docs/api/juridico-data-sprint-1-bff-openapi.yaml`;
- `docs/api/juridico-data-sprint-2-bff-openapi.yaml`;
- `docs/api/juridico-data-sprint-2-worker-openapi.yaml`;
- `docs/data/juridico-data-sprint-1-data-model.md`;
- `docs/data/juridico-data-sprint-2-data-model.md`;
- `docs/product/juridico-official-data-sprint-1-ux.md`;
- `UPSTREAM.md`.

## Contratos De Seguranca

- somente rede interna; nenhum ingress publico;
- JWT s2s emitido pelo Identity, audience `svc:juridico-data`;
- caller inicial allowlisted: `platform-api`;
- JWT do usuario final nao e aceito nem encaminhado;
- URLs DataJud derivadas exclusivamente de catalogo local allowlisted;
- API key somente por secret/env, sem default versionado;
- numero CNJ, nomes de partes, tokens e payloads nao entram em logs/traces;
- DTOs de entrada/saida possuem `additionalProperties: false`;
- responses de erro nao carregam body upstream, stack trace ou identificadores
  sensiveis;
- codigo upstream e revisado como supply chain nao confiavel.

## Observabilidade

- trace distribuido por `traceparent` e `X-Request-Id`;
- spans de chamada externa sem query/body;
- metricas por provider/tribunal/status: requests, latencia, retry, timeout,
  rate limit e circuit breaker;
- health `/health` verifica processo;
- readiness `/ready` verifica configuracao local sem chamar DataJud;
- nenhuma metrica usa numero processual, tenant ou parte como label.

## Proveniencia Upstream

- repositorio: `https://github.com/DeHor-Labs/mcp-juridico-brasil`;
- licenca: MIT;
- tag: `v0.1.0`;
- commit: `dcc1e4dfa0534809958eec05ad094be415ff2ce1`;
- estrategia: clone temporario, inventario, port seletivo e review por arquivo;
- proibido depender de branch flutuante ou copiar DJe/providers comerciais sem
  novo gate.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:juridico-data`
  - purpose: desenvolver e testar o servico interno isoladamente.
  - containers:
    - required: `jboot`.
    - optional: `postgres` e `valkey` somente para smoke integrado com Identity/BFF.
    - forbidden_by_default: `rabbitmq`, `temporal`, `minio`, `redpanda`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `juridico-data-service`.
    - optional: `identity-api`, `platform-api` para teste s2s/contrato.
    - forbidden_by_default: `platform-web`, `juridico-worker` e workers nao relacionados.
  - ports: `8030`.
  - healthchecks: `GET http://localhost:8030/health` e `/ready`.
  - seed_dependencies: registro idempotente da capability `juridico-data` quando a Sprint 1 materializar runtime.
  - expected_resource_profile: baixo; um processo Python sem browser, banco ou fila.

- target: `code-up:juridico`
  - purpose: fluxo autenticado completo em `/juridico/consultas/processo`.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `temporal`, `otel-collector` quando monitoramento/trace completo for validado.
    - forbidden_by_default: `rabbitmq`, `minio`, `redpanda`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`, `juridico-data-service`.
    - optional: `juridico-worker` para rotas PJe/eProc, nao para DataJud manual.
    - forbidden_by_default: workers nao relacionados.
  - ports: `3000`, `3002`, `8000`, `8010`, `8030`, `5432`.
  - healthchecks: Identity, Platform, `:8030/health`, `:8030/ready` e abertura da rota de consulta.
  - seed_dependencies: Identity Juridico existente e capability `juridico-data`.
  - expected_resource_profile: medio; sem browser/Temporal no fluxo DataJud manual.

### Rules

- Sprint 1 deve criar start/stop/restart simetricos para o novo processo;
- o target isolado nao sobe frontend nem banco por conveniencia;
- o target Juridico inclui o servico somente quando a rota DataJud for
  materializada;
- mudancas em Makefile/compose/scripts exigem validacao via
  `dev-runtime-profile`.

## Validacao

Dentro do container do projeto:

```bash
pytest
pyright src/
mypy src/
ruff check src tests
```

Tambem obrigatorios: auditoria de dependencias, contract test do OpenAPI,
security checklist, smoke integrado e `make ai-conformance`.

Evidencia Sprint 1 em 2026-08-27:

- 12 testes Python aprovados;
- Ruff, mypy e pyright aprovados no container;
- `pip-audit --skip-editable` sem vulnerabilidades conhecidas;
- smoke s2s real entre Identity e catalogo interno aprovado;
- migrations `050`/`051` aplicadas com sucesso no runtime local.

## Riscos E Stop Conditions

- upstream pre-alpha: bloquear import sem pin e testes;
- DataJud sem SLA formal: nao prometer atualizacao em tempo real;
- rate limit desconhecido: medir antes de definir throughput;
- schema upstream variavel: parser defensivo e fixtures sanitizadas;
- CVE critica, log com PII ou URL controlavel pelo usuario bloqueiam entrega;
- `production_ready` somente apos Definition of Done completa.
