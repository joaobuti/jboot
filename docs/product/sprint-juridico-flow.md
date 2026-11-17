# Sprint Juridico Flow

## Finalidade

Checklist executavel para adaptar o Flow ao CRM juridico da Proposta 2. Um item
so pode ser marcado como concluido quando seus criterios de aceite, testes e
evidencias estiverem registrados neste arquivo.

O produto reutiliza `establishment-customers`, mantem o CRM como fonte de
verdade dos documentos, oferece sincronizacao opcional `CRM -> Google Drive` e
adiciona processamento por IA com revisao humana obrigatoria.

## Decisoes Confirmadas

- [x] Trabalhar exclusivamente com a Proposta 2.
- [x] Reutilizar `establishment-customers`; nao criar outro cadastro mestre.
- [x] Exibir Clientes no menu do Flow.
- [x] Manter metadados no PostgreSQL e arquivos canonicos no storage do CRM.
- [x] Oferecer sincronizacao opcional e unidirecional com Google Drive.
- [x] Implementar leitura, extracao, classificacao e geracao assistidas por IA.
- [x] Exigir revisao humana antes de aprovar ou entregar documento.
- [x] Pausar evolucoes de DataJud nesta entrega.
- [x] Excluir WhatsApp, codigo temporario, `00_A classificar` e n8n de ingresso.

## Estado Geral

```yaml
status: em andamento
execution_mode: cross_project
delivery_type: embedded_module
stack_decision: inherited_from_host
source_of_truth:
  customers: establishment-customers
  document_metadata: PostgreSQL
  document_binary: CRM object storage
  drive: optional replica
data_classification: sensitive
human_review: mandatory
```

## Controle De Execucao

### JF-00-RECONCILIACAO

```yaml
task:
  id: JF-00-RECONCILIACAO
  title: reconciliar o checklist com o estado implementado e os contratos canonicos
  intent: governance
  objective: separar evidencia existente, lacuna real e decisao humana antes de codigo funcional
  user_value: evitar duplicacao de dominio e liberacao de fluxo com isolamento incorreto
  source_requirements:
    - docs/product/sprint-juridico-flow.md
    - docs/product/flow-crm-leads-sprints.md
    - docs/product/flow-crm-leads-sprint-4-9-gate.md
    - docs/architecture/decisions/013-customer-core-auxiliary-tables.md
    - docs/architecture/decisions/014-flow-lead-analysis-automation.md
  in_scope:
    - auditar os Blocos 0 a 10 contra codigo, testes, contratos e commits existentes
    - registrar gates, conflitos e bloqueios sem reimplementar capacidade existente
  out_of_scope:
    - alterar codigo funcional
    - escolher credencial ou retencao do Google Drive por inferencia
    - escolher provider ou politica de dados de IA por inferencia
  acceptance_criteria:
    - cada capacidade existente possui evidencia verificavel
    - lacunas nao sao marcadas como concluidas
    - perguntas materiais permanecem bloqueantes ate decisao humana explicita
  constraints:
    product:
      - establishment-customers permanece proprietario do cadastro mestre
    legal:
      - base legal, retencao e legal hold nao podem ser inferidos
    security_privacy:
      - dados classificados como sensitive
      - nenhum segredo, PII, documento, prompt ou resposta integral em logs e filas
    architecture:
      - feature cross-project em modulos existentes
      - stack herdada dos hosts
      - Architecture Graph transversal ainda em rollout
  affected_capabilities:
    - establishment-customers
    - flow-customer-visibility
    - flow-card-creation
    - document-drive-replication
    - legal-ai
  expected_artifacts:
    - checklist reconciliado
    - open_questions e blocking_status atualizados
    - AI_CONTEXT regenerado
  validation:
    - make ai-check
    - make ai-api-context MODULE=kanban
    - make ai-api-context MODULE=establishment-customers
    - make ai-api-impact
  dependencies: []
  risks:
    - confundir visibilidade derivada de card com customer_offices N:N
    - assumir que rotas PDV sao contrato publico do Flow
    - iniciar Drive ou IA sem decisao de dados e credenciais
  assumptions: []
  open_questions:
    - decisao de scopes dedicados flow:customers:read/write
    - confirmacao de customer_offices N:N independente dos cards
    - modelo de credencial, administrador e retencao da replica Drive
    - provider, base legal, regiao, retencao, treinamento e dataset de IA
  destructive_actions: []
  data_classification: sensitive
  human_gate: required
```

### JF-00-CONTRATOS-PROPOSTOS

```yaml
task:
  id: JF-00-CONTRATOS-PROPOSTOS
  title: propor ADR, modelo de dados e OpenAPI da fundacao
  intent: planning
  objective: tornar as decisoes e contratos auditaveis antes do human gate
  user_value: permitir aprovacao informada sem iniciar implementacao prematura
  source_requirements: [docs/product/sprint-juridico-flow.md]
  in_scope: [ADR proposta, modelo relacional proposto, OpenAPI proposta]
  out_of_scope: [migration, controller, adapter externo, frontend]
  acceptance_criteria:
    - ownership e isolamento explicitados
    - alternativas humanas permanecem abertas
    - contrato nao e apresentado como aprovado
  constraints:
    product: [cadastro mestre unico]
    legal: [retencao e base legal pendentes]
    security_privacy: [credencial write-only, filas somente com IDs]
    architecture: [embedded_module, stack herdada]
  affected_capabilities: [flow-shared-customers, flow-drive-replication, legal-ai]
  expected_artifacts:
    - docs/architecture/decisions/015-flow-shared-customers-drive-ai-boundaries.md
    - docs/data/flow-juridico-foundation-data-model.md
    - docs/api/flow-juridico-foundation-openapi.yaml
  validation: [YAML parse, make ai-check, make ai-api-graph-gate]
  dependencies: [JF-00-RECONCILIACAO]
  risks: [contrato proposto ser confundido com autorizacao]
  assumptions: []
  open_questions: [scopes, customer_offices, Drive, retencao, IA]
  destructive_actions: []
  data_classification: sensitive
  human_gate: required
```

### JF-00-UIUX-PROPOSTO

```yaml
task:
  id: JF-00-UIUX-PROPOSTO
  title: definir UX de clientes e configuracao Drive
  intent: planning
  objective: congelar fluxo, hierarquia e estados antes do frontend
  user_value: operacao consistente sem expor tenant, escritorio, CPF ou segredo
  source_requirements:
    - docs/product/sprint-juridico-flow.md
    - docs/api/flow-juridico-foundation-openapi.yaml
  in_scope: [menu, clientes, criar card, configuracao Drive, estados]
  out_of_scope: [JSX, client HTTP, implementacao backend]
  acceptance_criteria: [reuso do padrao canonico, estados completos, segredo write-only]
  constraints:
    product: [Flow como contexto, Drive como replica]
    legal: [minimizacao de CPF]
    security_privacy: [403 explicito, 404 indistinto, segredo nunca reexibido]
    architecture: [frontend somente apos contrato HTTP congelado]
  affected_capabilities: [flow-customers-ui, flow-drive-settings-ui]
  expected_artifacts: [docs/product/flow-juridico-uiux-decision.md]
  validation: [make ai-check]
  dependencies: [JF-00-CONTRATOS-PROPOSTOS]
  risks: [implementar contra contrato ainda nao aprovado]
  assumptions: []
  open_questions: [human gate da ADR 015]
  destructive_actions: []
  data_classification: sensitive
  human_gate: required
```

**Resultado:** concluido em 2026-10-13. Confirmacao humana: UI/UX segue o
padrao existente (`platform-crud-ui`, design system e componentes atuais), sem
novo padrao visual.

### JF-B1-B3-BACKEND

```yaml
task:
  id: JF-B1-B3-BACKEND
  title: clientes globais, visibilidade N:N e criacao idempotente de card
  intent: implementation
  objective: entregar os contratos backend aprovados dos Blocos 1 a 3
  user_value: operar cliente compartilhado sem vazamento entre escritorios
  source_requirements:
    - docs/product/sprint-juridico-flow.md
    - docs/architecture/decisions/015-flow-shared-customers-drive-ai-boundaries.md
    - docs/data/flow-juridico-foundation-data-model.md
    - docs/api/flow-juridico-foundation-openapi.yaml
  in_scope:
    - migration customer_offices e idempotencia
    - policy central de cliente por escritorio
    - fachada HTTP Flow
    - CreateCardFromCustomer
    - testes de tenant, escritorio, scope, replay, ACL e WIP
  out_of_scope: [frontend, Google Drive, IA, DataJud]
  acceptance_criteria:
    - outro tenant e escritorio recebem 404 indistinto
    - scopes dedicados retornam 403 quando ausentes
    - replay cria um unico card
    - nenhum SQL Kanban acessa tabelas mestre de clientes
  constraints:
    product: [establishment-customers e proprietario unico]
    legal: [minimizacao de CPF]
    security_privacy: [auditoria sem PII]
    architecture: [services exportados, DTOs explicitos, API congelada antes do frontend]
  affected_capabilities: [flow-shared-customers, flow-customer-offices, flow-create-card-from-customer]
  expected_artifacts: [migration, controllers, services, repositories, DTOs, tests, OpenAPI]
  validation: [backend tests, typecheck, lint de escopo, build, API Graph gate, security checklist]
  dependencies: [JF-00-CONTRATOS-PROPOSTOS, human_confirmation]
  risks: [unicidade CPF normalizada, concorrencia, inferencia cross-office]
  assumptions: []
  open_questions: []
  destructive_actions: []
  data_classification: sensitive
  human_gate: approved
```

### JF-B4-BACKEND

```yaml
task:
  id: JF-B4-BACKEND
  title: configuracao segura da replica Google Drive
  intent: implementation
  objective: configurar e testar OAuth por tenant sem persistir credencial
  user_value: preparar replica opcional sem afetar o storage canonico
  source_requirements: [ADR 015, flow-juridico-foundation-data-model, flow-juridico-foundation-openapi]
  in_scope: [DocumentSyncPort, Google REST adapter, secret reference, configuration endpoints, migration, tests]
  out_of_scope: [Drive to CRM, IA, DataJud, sync worker]
  acceptance_criteria: [credential write-only, folder test sanitized, tenant isolation, audit without secret]
  constraints:
    product: [MinIO remains canonical]
    security_privacy: [OAuth secret only by env reference; no PII or token in logs]
    architecture: [embedded module; no new dependency]
  validation: [tests, typecheck, scoped lint, build, API Graph, security checklist]
  dependencies: [JF-B1-B3-FRONTEND]
  open_questions: []
  destructive_actions: []
  data_classification: sensitive
  human_gate: approved
```

### JF-B5-BACKEND

```yaml
task:
  id: JF-B5-BACKEND
  title: outbox, worker e reprocessamento da replica Google Drive
  intent: implementation
  objective: replicar versoes canonicas aprovadas sem acoplar o CRM a disponibilidade do Drive
  user_value: copia operacional recuperavel e idempotente, mantendo o CRM como fonte de verdade
  source_requirements: [ADR 015, flow-juridico-foundation-data-model, flow-juridico-foundation-openapi]
  in_scope: [outbox transacional, relay, reconciliacao de outbox ausente, retry/backoff, DLQ persistida, idempotencia remota, reprocessamento]
  out_of_scope: [Drive to CRM, IA, DataJud, expurgo remoto sem workflow canonico de legal hold]
  acceptance_criteria: [payload somente com identificadores, checksum canonico, tenant revalidado, falha externa nao bloqueia CRM, replay remoto idempotente]
  constraints:
    product: [MinIO remains canonical]
    security_privacy: [sem PII, documento ou segredo em fila, log ou metrica]
    architecture: [worker in-process no platform-api; estado duravel no PostgreSQL]
  validation: [tests, typecheck, scoped lint, build, API Graph, security checklist]
  dependencies: [JF-B4-BACKEND]
  open_questions: []
  destructive_actions: []
  data_classification: sensitive
  human_gate: approved
```

```text
Agent Routing:
  task_id: JF-00-RECONCILIACAO
  owner: product-engineer
  executor: product-engineer
  reviewers: product-owner, architect, security-privacy, qa-release
  sequence: audit -> reconcile -> human-gate -> implementation
  files_in_scope: sprint, contracts, ADRs, OpenAPI, code and tests (read-only audit)
  blocked_files: DataJud, WhatsApp, n8n

Agent Activation:
  using_agent: orchestrator, prompt-builder, product-owner, product-engineer, architect
  using_skill: ai-first-governance
  referenced_only: security-checklist, tenant-context, api-contract, dev-runtime-profile, platform-crud-ui
  not_using: implementation agents while the human gate is open
```

### PE Decision E Gates

```yaml
pe_decision:
  execution_mode: cross_project
  delivery_type: embedded_module
  target_projects:
    - implementations/bff-jboot-platform
    - implementations/app-jboot-next-platform
  target_modules:
    - modules/establishment-customers
    - modules/kanban
  ownership:
    customer_master: establishment-customers
    flow_orchestration: kanban
  stack_decision: inherited_from_host
deployment_boundary_gate:
  decision: embedded_module
  rationale: capacidades pertencem aos modulos existentes e ao deploy compartilhado da Platform
  exceptions:
    - Gotenberg permanece unidade de infraestrutura independente ja aprovada no ADR 014
    - OCR ou inferencia local exigira novo gate se a politica de dados impedir provider externo
stack_fit_gate:
  status: not_applicable
  rationale: nenhuma nova unidade independente foi autorizada neste item
sprint_artifact: docs/product/sprint-juridico-flow.md
sprint_gate: implementation_in_progress
blocking_status: foundation_approved_ai_inputs_blocked
```

### Evidencia De Reconciliacao Em 2026-10-13

- `make ai-check`: inicialmente falhou somente por cinco `AI_CONTEXT.md` stale;
  apos `make ai-context`, passou com 56 testes de governanca e conformance
  `conformant`.
- `make ai-api-context MODULE=establishment-customers`: quatro rotas existentes,
  todas sob `/pdv/admin/customers`; nao existe fachada publica do Flow.
- `make ai-api-context MODULE=kanban`: 108 rotas e 113 chamadas; nao existem
  fachada global de clientes, `CreateCardFromCustomer` ou contratos Drive.
- `make ai-api-impact`: zero rotas e zero consumidores afetados pelo diff de
  documentacao atual.
- O codigo existente preserva o ownership: Kanban usa services exportados de
  `establishment-customers`, sem SQL direto nas tabelas mestre.
- A matriz existente de escritorio protege cards e clientes vinculados por
  `kanban_cards.office_id`, mas nao implementa `customer_offices` N:N persistente,
  seus metadados de vinculo ou visibilidade independente de card.
- Os Blocos 3, 4 e 5 nao possuem implementacao equivalente no estado auditado.
- O Architecture Graph transversal ainda nao possui registry/gate operacional;
  registrar migracao futura e obrigatorio, sem afirmar sincronizacao.
- ADR 015, modelo relacional e OpenAPI foram criados em estado `proposed`;
  eles tornam o human gate auditavel, mas nao autorizam codigo funcional.

### Perguntas Humanas Abertas

1. [Resolvida em 2026-10-13] Scopes dedicados `flow:customers:read` e
   `flow:customers:write` aprovados.
2. [Resolvida em 2026-10-13] `customer_offices` N:N independente dos cards
   aprovado.
3. [Resolvida em 2026-10-13] Google Drive por OAuth do tenant; pasta raiz
   administrada pelo cliente; replica segue exclusao canonica aprovada.
4. [Resolvida em 2026-10-13] Legal hold bloqueia expurgo; RPO zero para
   metadados/versoes confirmadas e RTO inicial de 4 horas.
5. Para IA, fornecer campos por tipo documental, amostra real anonimizada com
   gabarito fora do Git, base legal/consentimento, provider elegivel, regiao,
   retencao, uso para treinamento, volume e acuracia minima.
6. Fornecer tipos de caso/criterios e modelos `.docx` reais para os aceites que
   dependem desses insumos.

### Security Review Do Contrato Proposto

```yaml
review_date: 2026-10-13
scope: ADR 015, data model and proposed OpenAPI
using_skill: security-checklist
status: approved_for_planning_only
checks:
  injection: parameterized repositories required; no dynamic SQL authorized
  access_control: tenant and office ownership required; cross-boundary resource returns 404
  output_dto: explicit schemas; no entity serialization or PDV fiscal fields
  sensitive_data: CPF minimized; secrets write-only; no PII in logs, queues or metrics
  mass_assignment: additionalProperties false on write DTOs
  pagination: bounded to 100 records
  ssrf: arbitrary remote URL is not part of the contract; Drive uses provider-owned IDs
  dependencies: not_applicable_until_adapter_selection
  frontend: token storage unchanged; no HTML injection surface introduced
  agentic_ai: no tools, no automatic approval/delivery, output remains untrusted
blocking_before_functional_merge:
  - authorization matrix tests for tenant, office and scopes
  - parameterized repository review
  - secret-store adapter and response/log redaction tests
  - dependency audit after Drive SDK/provider selection
  - rate limiting for customer search and reprocess operations
```

### Checkpoint

```yaml
last_completed_item: JF-B4-FRONTEND-validation
item_in_progress: eligible-blocks-closeout
modified_files:
  - docs/product/sprint-juridico-flow.md
  - docs/ai-governance/attestations/2026-10-14-flow-juridico-foundation.yaml
  - implementations/app-jboot-next-platform/src/app/(with-layout)/flow/configuracoes/google-drive/page.tsx
  - implementations/app-jboot-next-platform/src/modules/kanban/components/drive/GoogleDriveSettingsPage.tsx
  - implementations/app-jboot-next-platform/src/modules/kanban/lib/kanban-api.ts
  - implementations/app-jboot-next-platform/src/layouts/Layouts/LayoutMenuData.tsx
tests:
  - command: docker compose exec -T jboot bash -lc 'cd implementations/bff-jboot-platform && npm test'
    result: passed; 551 tests, 549 passed and 2 skipped
  - command: docker compose exec -T jboot bash -lc 'cd implementations/bff-jboot-platform && npm run typecheck && scoped eslint --max-warnings=0 && npm run build'
    result: passed
  - command: make ai-api-graph-gate
    result: passed; zero errors
  - command: make ai-check
    result: passed; 56 governance tests and conformant
  - command: npm audit --omit=dev --audit-level=critical
    result: failed on pre-existing dependency findings; no dependency changed by JF-B1-B3
  - command: docker compose exec -T jboot bash -lc 'cd implementations/app-jboot-next-platform && npm run test && npm run lint && npm run type-check && npm run build'
    result: passed; 24 files and 95 tests, lint with 181 baseline warnings and zero errors, type-check and production build successful
current_failures:
  - dependency audit reports one critical and eight high transitive/runtime findings; remediation requires a separately reviewed dependency upgrade before merge
  - full backend lint reports three no-floating-promises errors in the pre-existing DataJud test outside this delivery
next_action: close eligible checklist items and preserve external blockers
open_risks:
  - dependency remediation remains a merge gate, not introduced by this change
  - AI blocks remain explicitly blocked by data, legal and provider inputs
```

### Evidencia JF-B4 Backend Em 2026-10-14

```yaml
using_agent: implementations/bff-jboot-platform/agents/backend-node-typescript.md
using_skill: [dev-runtime-profile, tenant-context, api-contract, security-checklist, ai-first-governance]
status: implemented_and_validated
security:
  - OAuth secret stored only as env reference; GET, audit and errors never return it
  - Google endpoints are fixed allowlisted URLs; folder id is restricted and encoded
  - tenant comes only from authenticated context and every query filters client_id
  - adapter has 10 second timeout and stable sanitized error codes
validation:
  - 545 backend tests; 543 passed and 2 Gotenberg integration tests skipped because converter was unavailable
  - typecheck, scoped lint and build passed
  - API Graph, ai-conformance and evidence pack passed
runtime:
  - code-up:kanban-leads unchanged; JBOOT_FLOW_DRIVE_OAUTH_SECRET is optional and blank by default
  - docker compose config confirms propagation to the jboot container
```

### Evidencia JF-B5 Backend Em 2026-10-14

```yaml
using_agent: implementations/bff-jboot-platform/agents/backend-node-typescript.md
using_skill: [tenant-context, api-contract, dev-runtime-profile, security-checklist, ai-first-governance]
status: implemented_and_validated
capabilities:
  - outbox transacional na aprovacao e reconciliacao de aprovados sem outbox
  - claim tenant-scoped com lease, limite de cinco tentativas e backoff exponencial persistido
  - DLQ derivada de failed sem next_attempt_at e reprocessamento administrativo rate-limited
  - checksum SHA-256 do objeto canonico e idempotencia remota por jbootSyncId
  - fila com databaseRef, clientId e syncId somente
security:
  - SQL parametrizado e configuracao ativa revalidada no claim
  - URLs Google fixas, IDs codificados e timeouts de 10/30 segundos
  - nenhum segredo, PII ou binario em fila, log ou metrica
  - erro externo reduzido a codigo estavel; corpo remoto nao e propagado
validation:
  - 553 backend tests; 551 passed and 2 Gotenberg integration tests skipped
  - 15 focused Drive/visibility tests passed
  - typecheck, scoped lint and build passed
  - API Graph and ai-conformance passed
open_items:
  - remote deletion/legal hold depends on a canonical audited purge workflow
  - controlled Google account contract smoke without real customer data
```

### Evidencia JF-B4 Frontend Em 2026-10-14

```yaml
using_agent: implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
using_skill: [platform-crud-ui, api-client, platform-design-system, tenant-context]
status: implemented_and_validated
ui_ux:
  decision: reuse_existing_pattern
  route: /flow/configuracoes/google-drive
  navigation: Configuracoes > Google Drive, visible only to flow:admin
  states: [loading, disconnected, active, paused, invalid, error, permission_denied, success]
capabilities:
  - save initial configuration and rotate the write-only credential reference
  - test, activate, pause and disconnect without redisplaying or resending the stored reference
  - show root folder, credential presence, last test, last success and sanitized failure
  - show backlog, oldest delay, success/retry/failure counts and a bounded terminal-failure list
  - reprocess a terminal failure without exposing document content or customer data
security:
  - typed client only; no direct fetch in the page and no client_id payload
  - no token storage change, dangerouslySetInnerHTML or provider response rendering
  - secret input is blank after save and is never populated from GET
validation:
  - 24 frontend test files and 95 tests passed
  - full lint completed with zero errors and 181 pre-existing warnings
  - type-check and production build passed
  - API Graph resolves all five Drive routes to the typed client
```

### Evidencia JF-B1-B3 Backend Em 2026-10-14

```yaml
using_agent: backend/auth/PostgreSQL
using_skill: [kanban-board-crud, tenant-context, api-contract, security-checklist]
status: implemented_and_validated_pending_api_freeze_commit
security_review:
  injection: passed; queries use positional parameters and fixed SQL fragments
  access_control: passed; authentication, dedicated scopes, tenant, office, board, column and card policies are independent
  output_dto: passed; Flow projections exclude PDV fiscal fields and mask documents in lists
  sensitive_data: passed; activity and audit payloads contain identifiers only
  mass_assignment: passed; DTO whitelist rejects additional fields
  pagination_rate_limit: passed; customer list is bounded and rate-limited per tenant and identity
  ssrf: not_applicable; no outbound URL exists in this block
  dependencies: blocked_by_preexisting_audit_findings; no package or lockfile changed
  agentic_ai: not_applicable; no AI execution exists in this block
evidence:
  - 541 backend tests passed in the project container
  - typecheck, scoped lint with zero warnings, and build passed in the project container
  - API Graph gate passed with zero errors
  - ai-check passed with 56 governance tests and conformant status
  - tenant/office/scope/replay/ACL/WIP and inherited office-link tests passed
architecture_graph:
  status: migration_debt
  reason: registry and transversal gate are not operational before API Graph Sprint 4
```

### Evidencia JF-B1-B3 Frontend Em 2026-10-14

```yaml
using_agent: frontend-kanban
using_skill: [platform-crud-ui, api-contract, tenant-context]
status: implemented_and_validated
ui_ux:
  decision: reuse_existing_pattern
  evidence:
    - operational card and responsive table
    - centered XL create/edit modal with icon steps and fixed actions
    - loading, empty, error, forbidden and success states
    - masked document in listing; technical IDs are not primary labels
capabilities:
  - Flow menu and /flow/clientes route
  - search and bounded pagination
  - create/edit general and juridical data with office selection
  - list visible linked cards and create a card idempotently
validation:
  - 94 frontend tests passed
  - full lint completed with zero errors and 181 pre-existing warnings
  - type-check and production build passed
  - API Graph resolves all seven customer routes to the typed client
```

## Projetos E Responsabilidades

| Alvo | Responsabilidade |
|---|---|
| `bff-jboot-platform/modules/establishment-customers` | cadastro mestre e dados juridicos auxiliares |
| `bff-jboot-platform/modules/kanban` | fachada Flow, escritorios, cards, documentos, IA, jobs e auditoria |
| `app-jboot-next-platform/modules/kanban` | menu, clientes, configuracoes, Drive, IA e operacao |
| PostgreSQL | metadados, configuracoes, estados, vinculos e auditoria |
| MinIO/S3 | arquivos canonicos do CRM |
| Google Drive | replica opcional, nunca fonte de autorizacao ou workflow |
| BullMQ/Valkey | jobs com payload contendo somente identificadores |

## Regras Transversais

- [x] Filtrar toda consulta e mutacao por `client_id` do contexto autenticado.
- [x] Responder `404` para recurso de outro tenant, sem confirmar sua existencia.
- [x] Restringir usuario nao administrador aos seus escritorios.
- [x] Auditar acesso global de `flow:admin`.
- [x] Impedir PII, documento, prompt ou resposta integral em log, fila ou metrica.
- [x] Nunca devolver credencial Google depois de salva; IA permanece sem adapter.
- [x] Tratar arquivo e texto documental como dados nao confiaveis, nunca instrucoes.
- [x] Tornar jobs idempotentes, observaveis, limitados e reprocessaveis.
- [x] Criar teste para toda regra de negocio nova.
- [x] Atualizar OpenAPI e graphs quando contratos forem alterados.
- [x] Impedir integracao externa de escrever diretamente nas tabelas do Flow.
- [x] Impedir IA de aprovar, entregar ou protocolar documento.

## Ordem De Execucao

Os blocos seguem a ordem abaixo. O frontend de um bloco so inicia depois do
contrato HTTP correspondente estar congelado.

## Bloco 0 — Gate, Contratos E Dados

**Estado:** `em andamento` (fundacao aprovada; insumos de IA pendentes)

**Objetivo:** remover ambiguidades antes de codigo funcional.

- [x] Criar ADR para clientes no Flow, Drive e fronteira da IA.
- [x] Registrar nos/arestas no Architecture Graph; backfill em 2026-10-16, com IA juridica `planned`.
- [x] Modelar `customer_offices`, configuracao Drive, sync, configuracao IA e execucoes IA.
- [x] Definir OpenAPI, eventos/outbox e idempotencia.
- [x] Definir scopes, papeis, retencao, legal hold, RPO e RTO.
- [ ] Confirmar tipos, tamanhos e volume de documentos.
- [ ] Confirmar provider IA, regiao, retencao e uso para treinamento.
- [ ] Confirmar tipos de caso, criterios e campos extraidos.
- [x] Atualizar threat model em `docs/security/flow-drive-ai-threat-model.md`.

**Evidencias:**

- [x] ADR aprovado, modelo revisado, OpenAPI proposto e threat model revisado.
- [x] Perguntas de fundacao resolvidas; insumos concretos de IA e smoke externo mantidos como bloqueios explicitos.

## Bloco 1 — Clientes Compartilhados No Flow

**Estado:** `concluido`

**Objetivo:** exibir o cadastro multimodular sem duplicar dominio.

### Backend

- [x] Manter `establishment-customers` como proprietario unico do cadastro.
- [x] Proibir SQL do Kanban nas tabelas de clientes; usar servicos exportados.
- [x] Criar fachada HTTP Flow para listar, consultar, criar e editar clientes.
- [x] Nao expor `/pdv/admin/customers` como contrato publico do Flow.
- [x] Criar scopes `flow:customers:read` e `flow:customers:write`.
- [x] Formalizar administracao por `flow:admin` ou scope dedicado.
- [x] Expor DTO explicito, sem dados internos de PDV.
- [x] Manter nucleo e `customer_juridico` sob seus servicos proprietarios.
- [x] Preservar unicidade de CPF por tenant, inclusive sob concorrencia.
- [x] Auditar mudancas sem PII no evento.

### Frontend

- [x] Adicionar `Clientes` no menu do Flow e rota `/flow/clientes`.
- [x] Reutilizar padroes da tela existente sem copiar regra de dominio.
- [x] Exibir busca, paginacao, loading, vazio, erro e permissao negada.
- [x] Separar campos gerais e juridicos.
- [x] Oferecer `Criar card` e listar cards visiveis vinculados.
- [x] Minimizar exibicao de CPF em listagens.

### Aceite

- [x] Alteracao pelo Flow afeta o mesmo cadastro consumido por outros modulos.
- [x] Nenhuma segunda tabela mestre e criada.
- [x] Usuario sem scope recebe `403`; outro tenant recebe `404`.
- [x] Tela funciona sem scopes `pdv:admin:*`.

## Bloco 2 — Visibilidade De Cliente Por Escritorio

**Estado:** `concluido`

**Objetivo:** impedir vazamento pela nova listagem global.

- [x] Criar migration aditiva `customer_offices` com isolamento entre tenants.
- [x] Permitir relacao N:N cliente-escritorio.
- [x] Registrar `linked_at`, `linked_by_identity_id` e `source`.
- [x] Cliente legado sem escritorio fica visivel somente a `flow:admin`.
- [x] Cliente criado pelo Flow recebe escritorio autorizado.
- [x] Cliente criado pelo card herda o escritorio do card.
- [x] Vinculo a outro escritorio exige autorizacao, motivo e auditoria.
- [x] Transferencia de card nao apaga vinculos historicos.
- [x] Centralizar policy para lista, detalhe, CPF, documentos e cards.

### Aceite

- [x] Escritorio A nao lista, busca, altera ou infere cliente exclusivo de B.
- [x] Usuario A+B enxerga a uniao sem duplicidade.
- [x] Admin enxerga todos e classifica clientes legados.
- [x] CPF nao funciona como oraculo de outro escritorio.
- [x] Testes cobrem admin, A, B, A+B, sem escritorio, inativo e outro tenant.

**Bloqueio:** o Bloco 1 nao pode ser liberado a operadores antes deste bloco.

## Bloco 3 — Cliente Para Card

**Estado:** `concluido`

- [x] Criar comando idempotente `CreateCardFromCustomer`.
- [x] Exigir board, coluna inicial e escritorio autorizado.
- [x] Referenciar o cliente em `kanban_card_customers`; nunca copiar o mestre.
- [x] Permitir vincular cliente existente a card existente pela mesma policy.
- [x] Registrar activity/auditoria somente com IDs.
- [x] Tratar card existente, cliente inativo, escritorio proibido e ACL/WIP.
- [x] Executar card, vinculo, activity, auditoria e comando na mesma transacao.

### Aceite

- [x] Replay da mesma chave retorna um unico card.
- [x] Card referencia o cadastro mestre e respeita visibilidade por escritorio.

## Bloco 4 — Configuracao Google Drive

**Estado:** `concluido`

**Objetivo:** preparar replica opcional sem substituir o storage do CRM.

- [x] Criar `DocumentSyncPort` separado do storage canonico.
- [x] Implementar `GoogleDriveDocumentSyncAdapter` e fake de teste.
- [x] Manter MinIO/S3 como origem do binario.
- [x] Definir pastas por tenant, escritorio, cliente e caso/card.
- [x] Definir nome canonico com minimizacao de PII.
- [x] Mapear documento, versao, `drive_file_id`, checksum e estado.
- [x] Criar `Configuracoes -> Google Drive`.
- [x] Permitir conectar, testar, ativar, pausar e desconectar.
- [x] Permitir escolher pasta raiz e exibir ultimo sucesso/falha sanitizada.
- [x] Armazenar apenas referencia do segredo no banco.
- [x] Nunca persistir private key ou refresh token em texto aberto.
- [x] Usar escopo minimo do Google Drive e auditar configuracao sem segredo.
- [x] Proibir sync `Drive -> CRM` nesta sprint.

### Aceite

- [x] Tenant sem Drive funciona integralmente.
- [x] Pausar Drive nao apaga arquivos canonicos.
- [x] Credencial nao aparece em GET, log, erro, fila ou auditoria.
- [x] Falha Google nao impede uso do documento no CRM.

## Bloco 5 — Jobs CRM Para Drive

**Estado:** `em andamento` (sync/retry/reprocessamento/reconciliacao/metricas implementados; expurgo pendente)

- [x] Publicar outbox somente depois de persistir a versao canonica.
- [x] Enfileirar apenas IDs e tenant/database ref; versao e checksum permanecem na outbox duravel.
- [x] Revalidar tenant e configuracao ao executar.
- [x] Sincronizar por documento+versao+checksum, sem sobrescrita silenciosa.
- [ ] Usar integralmente os estados `pending`, `syncing`, `synced`, `failed`, `paused`, `deleted`; os quatro primeiros estao ativos e `paused`/`deleted` aguardam o workflow de expurgo.
- [x] Implementar retry/backoff, DLQ e `Reprocessar`.
- [x] Implementar reconciliacao local-remota de ausencia/checksum.
- [ ] Implementar semantica auditavel de exclusao com legal hold no workflow canonico de expurgo.
- [x] Medir atraso, sucesso, falha e backlog sem PII.

### Aceite

- [x] Replay nao duplica arquivo; nova versao permanece identificavel.
- [x] Drive indisponivel nao perde job nem afeta o CRM.
- [ ] Testes usam fake; contrato externo usa conta controlada sem dados reais.

## Bloco 6 — Configuracao De IA Por Tenant

**Estado:** `bloqueado`

- [ ] Definir interface `LegalAiProvider` e fake deterministico.
- [ ] Implementar adapter somente depois do eval arquitetural.
- [ ] Criar `Configuracoes -> Inteligencia Artificial`.
- [ ] Permitir provider, ativo/inativo, credencial write-only e limite mensal.
- [ ] Testar credencial sem PII antes de salvar e mostrar apenas mascara.
- [ ] Registrar aceite do administrador e implementar kill switch.
- [ ] Medir uso/tokens/custo estimado sem prompts ou documentos.
- [ ] Classificar credencial, saldo, rate limit, timeout, indisponibilidade e limite.

**Bloqueios:** provider/API, politica de dados, base legal e conta do cliente.

## Bloco 7 — Leitura E Extracao Por IA

**Estado:** `bloqueado`

- [ ] Definir tipos documentais e schema de extracao por tipo.
- [ ] Processar somente documentos autorizados do tenant/escritorio.
- [ ] Criar snapshot imutavel dos inputs.
- [ ] Defender contra prompt injection documental.
- [ ] Validar saida estruturada; campo ausente fica vazio, nunca inferido.
- [ ] Guardar pagina/trecho de evidencia e divergencias com o cadastro.
- [ ] Nao alterar cadastro automaticamente.
- [ ] Invalidar resultado quando cadastro/documento mudar.
- [ ] Reprocessar de forma idempotente e versionada.
- [ ] Criar painel `Leitura` e fallback manual.

### Aceite

- [ ] Eval anonimizado mede acuracia por campo e taxa de alucinacao.
- [ ] Conteudo malicioso nao altera tools, regras ou escopo.
- [ ] Falha do provider preserva o fluxo manual.

## Bloco 8 — Classificacao Assistida

**Estado:** `bloqueado`

- [ ] Limitar respostas aos tipos de caso ativos do tenant.
- [ ] Retornar sugestao, confianca e evidencias.
- [ ] Encaminhar baixa confianca para revisao.
- [ ] Permitir confirmar/trocar; troca exige motivo auditado.
- [ ] Nao treinar automaticamente com correcoes.
- [ ] Versionar criterios, provider, modelo e prompt.

### Aceite

- [ ] IA nunca cria tipo inexistente.
- [ ] Eval mede acuracia por tipo e cobertura.
- [ ] Caso incerto nao gera documento automaticamente.

## Bloco 9 — Orquestracao E Geracao

**Estado:** `bloqueado`

```text
lead completo -> snapshot -> extracao -> classificacao
  -> parada humana se incerto/incompleto
  -> DOCX versionado -> persistencia CRM
  -> sync Drive opcional -> aguardando revisao
  -> aprovacao humana -> PDF
```

- [ ] Disparar por outbox/job depois do envio completo.
- [ ] Persistir estado/tentativa e parar corretamente por falha ou incerteza.
- [ ] Preencher template com valor e origem de cada campo.
- [ ] Versionar template, catalogo, input, provider, modelo e prompt.
- [ ] Persistir DOCX antes de mover o card para revisao.
- [ ] Criar nova versao no reprocessamento; nunca apagar a anterior.
- [ ] Manter aprovacao humana, PDF e fallback manual existentes.
- [ ] Exibir progresso/falhas sanitizadas e impedir duplicidade por retry.

### Aceite

- [ ] Caso claro chega a rascunho revisavel.
- [ ] Caso incerto para e explica o motivo.
- [ ] Documento nunca e aprovado, enviado ou protocolado automaticamente.
- [ ] Toda versao permite reconstruir contratos e dados usados.

## Bloco 10 — Qualidade E Operacao

**Estado:** `em andamento` (qualidade local e runbook Drive entregues; validacoes externas e IA pendentes)

- [x] Testes unitarios e integracao PostgreSQL dos blocos implementados.
- [ ] E2E externo com Google Drive controlado.
- [x] Matriz tenant/escritorio/scope nas operacoes implementadas.
- [x] Contract tests Drive fake e idempotencia de APIs/eventos/jobs implementados.
- [ ] Contract tests de IA, bloqueados pela definicao do provider.
- [x] Falhas de storage, Valkey e Drive cobertas sem perder o canonico/outbox.
- [ ] Falhas de IA, bloqueadas pela definicao do provider.
- [x] MIME divergente, arquivo malformado, tamanho e malware simulado.
- [ ] Prompt injection e saida fora do schema.
- [x] DLQ, reprocessamento e reconciliacao.
- [x] Restore de banco/objetos com RPO/RTO medidos (2026-10-16, local: RTO ~2 s, RPO zero, 27/29 objetos ok; 2 anexos de card antigos sem objeto; repetir com volume de producao). Evidencia em `docs/runbooks/flow-drive-sync.md`.
- [x] Lint do escopo, typecheck, testes, build e API Graph.
- [x] Architecture Graph operacional: capacidades, ADR, sprint e integracao Drive registrados; gate sem findings em 2026-10-16.
- [x] Runbook para Drive, fila, segredo revogado e restore criado em `docs/runbooks/flow-drive-sync.md`.
- [ ] Runbook de IA, bloqueado pela definicao do provider e politica de dados.
- [ ] Smoke manual com dados sinteticos (bloqueado: passos com Drive exigem conta Google controlada e o app OAuth do JBoot; passo 7, download canonico com Drive desligado, coberto pelo E2E local).

**Evidencias locais de 2026-10-14:** suite backend com 556 testes (554
aprovados e 2 skips de Gotenberg), suite frontend com 95 testes, type-check e
build dos dois projetos aprovados, API Graph sem erros e testes adicionais de
falha transitoria do storage, esgotamento do Drive e indisponibilidade do
Valkey. O lint completo preserva tres erros preexistentes fora do escopo em
teste DataJud; o lint dos arquivos alterados passou.

## Fora De Escopo

- WhatsApp, codigo temporario e `00_A classificar`.
- n8n como orquestrador ou integracao de dominio.
- Evolucao/tela/regra nova de DataJud.
- Sincronizacao `Google Drive -> CRM`.
- Binarios no PostgreSQL.
- Assinatura, protocolo, prazo oficial ou envio automatico ao cliente.
- Aprovacao ou entrega automatica por IA.
- Migracao em massa de legado sem novo escopo.

## Perguntas Bloqueantes

- [x] Aprovar scopes do Flow e modelo N:N `customer_offices`.
- [x] Definir tratamento de clientes legados sem escritorio.
- [x] Escolher OAuth ou service account para Drive e administrador da pasta.
- [x] Definir retencao/exclusao da replica Drive.
- [ ] Definir provider/API de IA e politica de dados.
- [ ] Entregar tipos de caso, criterios e modelos `.docx` reais.
- [ ] Entregar campos por documento e amostra anonimizada com gabarito.
- [ ] Definir acuracia minima, base legal, regiao e retencao.

## Definition Of Done Por Checkbox

Um item funcional so pode ser concluido quando:

- [ ] contrato/regra estao documentados;
- [ ] implementacao respeita SRP, DIP e ownership;
- [ ] testes passam e isolamento tenant/escritorio foi provado;
- [ ] logs/eventos foram revisados contra PII e segredos;
- [ ] OpenAPI/graphs foram atualizados quando aplicavel;
- [ ] UI cobre loading, vazio, sucesso, falha e permissao negada;
- [ ] arquivos, comandos e resultados foram registrados;
- [ ] revisores exigidos aprovaram;
- [ ] o estado deste documento foi atualizado.

## Agent Routing

```text
Agent Routing:
  task_id: JURIDICO-FLOW
  owner: product-engineer
  skills: customer-domain, kanban-board-crud, tenant-context, api-contract,
          async-jobs, document-storage, security-privacy, ai-evaluation
  reviewers: product-owner, architect, security-privacy, qa-release
  sequence: contracts -> backend -> frontend -> security -> QA -> integration
  files_in_scope: establishment-customers, kanban/flow, storage, jobs, docs/api
  blocked_files: DataJud, WhatsApp, n8n
  human_gate: required for blockers and before production
```

## TaskEnvelope Obrigatorio Por Item

```yaml
task:
  id: JF-BLOCO-ITEM
  title: resultado concreto
  intent: implementation
  objective: estado observavel ao final
  user_value: valor para operador, gestor ou administrador
  source_requirements: [docs/product/sprint-juridico-flow.md]
  in_scope: []
  out_of_scope: []
  acceptance_criteria: []
  constraints:
    product: []
    legal: []
    security_privacy: []
    architecture: []
  affected_capabilities: []
  expected_artifacts: []
  validation: []
  dependencies: []
  risks: []
  assumptions: []
  open_questions: []
  destructive_actions: []
  data_classification: sensitive
  human_gate: required
```

Cada envelope possui um unico executor. Revisores registram achados; nao
reimplementam silenciosamente o item.
