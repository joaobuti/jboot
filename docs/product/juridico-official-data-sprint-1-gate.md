# Juridico Official Data Sprint 1 Gate

## Status

```yaml
gate_status: completed
architecture_confirmed_by_human: 2026-08-27
functional_code_started: true
```

## Objetivo

Entregar consulta manual DataJud ponta a ponta usando um novo servico REST
interno baseado seletivamente no upstream `mcp-juridico-brasil`.

## PE Decision

```yaml
execution_mode: cross_project
delivery_type: internal_service_integration
target_project: implementations/svc-jboot-juridico-data
target_module: modules/juridico
sprint_artifact: docs/product/juridico-official-data-sprints.md
sprint_gate: docs/product/juridico-official-data-sprint-1-gate.md
stack_fit_gate: approved
open_questions: []
blocking_status: unblocked_for_sprint_1_after_foundation_validation
```

## Stack Fit Gate

Escolha: Python 3.12 + FastAPI em servico interno. FastMCP fica fora da
interface de produto; NestJS e incorporacao ao worker foram rejeitados conforme
ADR 009.

## Fronteiras E Trust Boundaries

| Fronteira | Regra |
|---|---|
| Browser -> BFF | Cookie/token Platform; BFF exige `juridico:read` |
| BFF -> servico | JWT s2s com audience propria; nunca encaminhar JWT do usuario |
| Servico -> DataJud | HTTPS e host/indices em allowlist; API key apenas em secret/env |
| BFF -> banco juridico | Conexao somente por `database_ref`; toda query filtra `client_id` |
| Upstream -> JBoot | Codigo externo e dado nao confiavel; pin, review, license e testes obrigatorios |

## Contratos Obrigatorios

- `docs/architecture/decisions/009-juridico-official-data-service.md`;
- `docs/product/juridico-official-data-sprints.md`;
- `docs/api/juridico-data-sprint-1-bff-openapi.yaml`;
- `docs/api/juridico-data-sprint-1-service-openapi.yaml`;
- `docs/data/juridico-data-sprint-1-data-model.md`;
- `docs/product/juridico-official-data-sprint-1-ux.md`;
- contratos dos tres projetos afetados.

## Ordem De Implementacao

1. Validar tag/commit/licenca e produzir inventario de arquivos upstream.
2. Materializar runtime/healthchecks/capability seed do novo servico.
3. Implementar dominio e client DataJud com testes isolados.
4. Congelar e testar OpenAPI interno.
5. Implementar BFF, audit repository e client s2s; congelar contrato BFF.
6. Executar `ui-ux` e implementar rota frontend contra client tipado.
7. Executar testes/builds no container, security checklist, smoke, attestation e
   conformance.

Backend e frontend fazem parte da mesma Sprint 1; a sprint nao conclui com
apenas o servico ou BFF implementado.

## Agent Activation Planejada

Novo servico:

- `implementations/svc-jboot-juridico-data/agents/juridico-data-domain.md`;
- `implementations/svc-jboot-juridico-data/agents/juridico-data-integrations.md`;
- `implementations/svc-jboot-juridico-data/skills/datajud-contract.md`;
- `implementations/svc-jboot-juridico-data/skills/upstream-adaptation.md`;
- `implementations/svc-jboot-juridico-data/skills/internal-service-security.md`.

BFF:

- agents `backend-node-typescript`, `platform-auth-context`, `platform-postgres`;
- skills `nest-module-pattern`, `tenant-context`, `api-contract`.

Frontend, obrigatoriamente apos `docs/agents/orchestration/ui-ux.md`:

- agents `frontend-next-typescript`, `platform-layout`,
  `backend-contract-client`, `juridico-web`, `juridico-api-client`;
- skills `next-module-pattern`, `platform-design-system`, `api-client`,
  `juridico-web-ui`, `juridico-api-client`.

Cross-cutting:

- `dev-runtime-profile`;
- `security-checklist`;
- `ai-first-governance`.

## Validacoes Obrigatorias

Novo servico, dentro do container:

- `pytest`;
- `pyright src/`;
- `mypy src/`;
- `ruff check src tests`;
- auditoria de dependencias Python.

BFF e frontend, dentro do container:

- testes automatizados equivalentes;
- lint e typecheck;
- build do backend e frontend;
- contract tests BFF -> servico;
- smoke autenticado da rota `/juridico/consultas/processo`.

Governanca:

- `make ai-check`;
- `make ai-conformance`;
- attestation cobrindo todo o diff;
- security checklist sem item aberto.

## Stop Conditions

Bloquear a sprint se:

- tag/commit/licenca upstream divergir do pin;
- DataJud exigir URL controlada pelo usuario;
- numero processual, partes ou secrets aparecerem em log/trace;
- BFF nao conseguir obter token s2s com audience dedicada;
- resposta upstream real divergir do schema sem parser defensivo;
- dependencia possuir CVE critica sem mitigacao aprovada;
- frontend precisar chamar o servico diretamente;
- testes/builds nao executarem no container correto.

## Fora De Escopo

MCP, IA/LLM, persistencia integral, monitoring, prazo, DJe autenticado,
confirmacao de leitura e providers comerciais.
