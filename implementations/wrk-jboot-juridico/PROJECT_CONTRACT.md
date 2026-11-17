# Project Contract: wrk-jboot-juridico

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: workers Python, adapters e testes automatizados versionados
last_status_review: 2026-08-02
```

Workers Python de scraping para automação jurídica, criados após ADR 004.

APIs judiciais oficiais sincronas passam a ter fronteira planejada em
`implementations/svc-jboot-juridico-data`, conforme ADR 009. Este worker
continua responsavel por Playwright, sessoes de portal e workflows Temporal.
O PJe/DJEN publico foi migrado na Sprint 4 para `svc-jboot-juridico-data`.
Este worker nao consulta DJEN, nao recebe URL de banco para PJe e nao expõe rota
PJe; qualquer reintroducao exige novo gate humano.

## Stack

- Python 3.12+
- Playwright (scraping, autenticação, sessão)
- Temporal SDK Python (worker e workflows)
- Sem acesso direto ao banco — recebe payload do BFF via Temporal

## Responsabilidade

Executar consultas em portais jurídicos (Projudi, ESAJ, EPROC e outros) via Playwright. Cada portal é um adapter independente. Recebe jobs do `bff-jboot-platform/modules/juridico` via Temporal, executa e publica resultados.

## Agents De Stack (Referência Obrigatória)

Definem padrões detalhados que os agents locais estendem. Devem ser lidos antes de qualquer implementação:

- `docs/agents/stacks/backend-python.md`: tipagem progressiva com pyright, Pydantic para contratos, separação entre domínio/adaptadores/provedores, testes e logs estruturados.
- `docs/agents/stacks/platform-temporal.md`: workflows deterministas, activities idempotentes, retry policies explícitos, versionamento, observabilidade por workflow/run/task id.

## Agents Globais

- `agents/scraping-worker.md`: padrão Python/Playwright para workers de scraping.
- `agents/portal-adapter.md`: padrão de implementação de adapter por portal.
- `agents/juridico-observability.md`: OTel Python, continuação de trace do BFF, métricas de scraping.

## Skills Globais

- `skills/playwright-portal-pattern.md`: padrão de navegação, autenticação e extração por portal.
- `skills/temporal-worker-pattern.md`: padrão de worker e activity Temporal em Python.
- `skills/observability.md`: OTel Python, context propagation, spans de scraping, logs JSON.
- `skills/portal-failure-handling.md`: classificação de erros, WorkflowResult estruturado, retry policy.

## Ativação Obrigatória

Antes de qualquer código neste projeto, declarar:

```text
Agent Activation:
  project: implementations/wrk-jboot-juridico
  module: none
  using_agent:
    - implementations/wrk-jboot-juridico/agents/scraping-worker.md
    - implementations/wrk-jboot-juridico/agents/portal-adapter.md
  referenced_only:
    - docs/agents/stacks/backend-python.md: padrões detalhados de Python/Pydantic/pyright
    - docs/agents/stacks/platform-temporal.md: padrões de workflow e activity
  using_skill:
    - implementations/wrk-jboot-juridico/skills/playwright-portal-pattern.md
    - implementations/wrk-jboot-juridico/skills/temporal-worker-pattern.md
```

## Estrutura De Portais

```text
src/
  workers/         # Temporal worker entrypoint
  workflows/       # Temporal workflow definitions
  activities/      # Temporal activities (uma por tipo de consulta)
  portals/
    base.py        # Classe base do adapter
    projudi/
    esaj/
    eproc/
    <portal>/
  shared/
    auth/          # Estratégias de auth (user_pass, token, 2fa)
    parser/        # Extração e normalização de dados
```

## Contratos

- Recebe de `bff-jboot-platform/modules/juridico` via Temporal:
  - `portal_id`, `client_id`, credenciais criptografadas, tipo de consulta, parâmetros (CPF ou número do processo).
- Publica resultado via Temporal:
  - lista de processos encontrados ou status de andamento, metadados de execução, erros tratados.

## Limite DJEN

DJEN e sua normalizacao pertencem exclusivamente ao servico juridico interno.
O BFF persiste jobs e comunicacoes no contexto autenticado do tenant.

## Dev Runtime Profile

- Processo: `python -m src.workers.main` no container `jboot`, expondo a API interna em `:8020`
  (`JBOOT_WORKER_API_PORT`) e o Temporal worker na fila `juridico-scraping`.
- Fila `process-monitoring` (ADR 021, Sprint 4 de `docs/product/process-monitoring-sprints.md`):
  so a consulta do acompanhamento, uma por vez e com ritmo limitado na fila inteira
  (`JBOOT_PROCESS_MONITORING_MAX_CONCURRENCY`, padrao 1; `JBOOT_PROCESS_MONITORING_RATE_PER_SECOND`,
  padrao 1). Mesmo processo, segundo Temporal worker.
- Fila `process-publications` (ADR 022, Sprint 7): consulta ao DJEN do acompanhamento
  (`JBOOT_PROCESS_PUBLICATIONS_MAX_CONCURRENCY`, padrao 1; `JBOOT_PROCESS_PUBLICATIONS_RATE_PER_SECOND`,
  padrao 2). O `ProcessMonitorWorkflow` acorda todo dia util as 7h de Brasilia, pede o plano ao BFF e
  dispara cada fonte vencida na sua fila.
- Sobe junto do perfil jurídico: `make code-up TARGET=juridico` e `make dev-up TARGET=juridico`.
  Execução isolada em primeiro plano: `make juridico-worker-dev`.
- Log: `docker compose exec jboot tail -f /tmp/jboot-code-juridico-worker.log`.
- Dependência: `.venv` sincronizada (`uv sync --dev`); sem o worker de pé o BFF responde
  `503 Worker juridico indisponivel` nas telas de eProc.

## Restrições

- Não acessa banco diretamente nas activities Temporal.
- Não armazena credenciais — usa apenas em memória durante a execução da activity.
- Cada portal é um adapter isolado; falha de um não afeta outros.
- Adapters não compartilham estado de sessão entre tenants.
- Credenciais descartadas da memória após uso.
- DataJud, calculo de prazo e interface MCP nao entram neste worker na Sprint 1
  de `docs/product/juridico-official-data-sprints.md`. Na Sprint 2 funcional,
  o worker somente agenda e dispara callback S2S ao BFF para monitoramento
  DataJud; ele nao acessa DataJud nem banco juridico diretamente.
- Falha de uma execucao do monitor DataJud (processo ainda nao indexado,
  provedor fora) nao encerra o `DataJudMonitorWorkflow`: o loop registra e
  aguarda o proximo tick (2026-11-06, regressao em
  `tests/test_datajud_monitor_workflow.py`). Workflows ja encerrados antes da
  correcao sao reiniciados ao reativar o acompanhamento.

## Validação

```bash
python -m pytest
python -m pyright src/
python -m mypy src/
```

Preferência: `pyright` como type checker principal (mais rápido, melhor suporte a Pydantic v2). `mypy` como verificação complementar em CI.

## Riscos Conhecidos

- Portais podem alterar layout sem aviso — adapters precisam de testes de smoke por portal.
- 2FA exige estratégia por portal (TOTP, SMS delegation, sessão persistente).
- Anti-bot (reCAPTCHA, Cloudflare) pode exigir soluções específicas por portal.
