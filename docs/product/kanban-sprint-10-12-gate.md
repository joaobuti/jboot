# Gate — Kanban Sprints 10–12

## Estado

```yaml
status: implementacao_em_andamento
confirmed_by_human: 2026-10-14
implementation_started: true
last_human_decision: 2026-10-15
blocking_status: openai_confirmed; chatgpt_plan_primary_confirmed; byok_optional_checkpoint_complete; plus_execution_blocked_by_openai_approval_and_background_grant; effect_handlers_blocked_by_contract; production_blocked_by_data_policy_kms_and_controls
```

## PO Scope

```yaml
objective: permissoes por modulo, vinculo seguro de escritorios, ChatGPT Plan primario, BYOK opcional e automacoes com agentes versionados
users_roles:
  - tenant_manager
  - delegated_office_user_manager
  - module_user
  - automation_board_admin
business_rules:
  - ChatGPT Plus e modalidade primaria obrigatoria; API key e opcional sem fallback automatico
  - credencial isolada por client, identity e provider
  - agente gerenciado pelo JBoot e restrito ao application_slug
  - cada versao de agente fixa contrato de input, allowed_tools e schemas estritos
  - o prompt escolhe/sequencia somente tools autorizadas; o Kanban reautoriza cada chamada
  - conexao de desenvolvimento pertence ao operador; em producao cada tenant designa a propria
  - tenant manager escolhe escritorios ativos
  - administrador delegado herda os proprios escritorios sem editar
  - automacao referencia agent_id e nunca transporta segredo ou prompt
out_of_scope:
  - invocar Custom GPT ou agente Claude.ai por nome
  - compartilhar chave entre tenants
  - mutacao irrestrita produzida por IA
  - liberar dados reais antes da politica do provider
```

## PE Decision

```yaml
execution_mode: cross_project
delivery_type: shared_ai_integration
target_projects:
  - implementations/bff-jboot-identity
  - implementations/bff-jboot-platform
  - implementations/app-jboot-next-platform
  - implementations/svc-jboot-ai-gateway
target_modules:
  - identity
  - kanban
deployment_boundary_gate:
  configuration_and_permissions: embedded_modules
  ai_gateway: independent_unit
  evidence: credenciais e providers sao compartilhados entre modulos e exigem ciclo operacional proprio
stack_fit_gate:
  status: approved
  candidates: [typescript_nestjs, python_fastapi, go]
  recommendation: typescript_nestjs
  counterfactual_choice: typescript_nestjs
  rationale: contratos estruturados, adapters heterogeneos, jobs, observabilidade e politicas transacionais predominam sobre computacao cientifica
sprint_artifact: docs/product/kanban-sprints.md
sprint_gate: docs/product/kanban-sprint-10-12-gate.md
human_confirmation: confirmed
open_questions:
  - aprovacao comercial OpenAI, client ID/scopes/callbacks e automacao server-side
  - politica de residencia, retencao, treinamento e DPA por provider
  - allowlist inicial de modelos e limites de custo por tenant/usuario
  - secret manager/KMS e procedimento de rotacao para cada ambiente
  - catalogo inicial de tools, schemas, approval policy e campos mutaveis
  - contrato de dados do card/cliente e documentos anexados
blocking_status: checkpoint BYOK manual implementado; OAuth/plan usage, automacao server-side e efeitos de dominio permanecem bloqueados pelos itens acima
```

## Architect Decision

## Deployment Boundary Gate

- Permissoes, menu e provisionamento de usuarios permanecem como modulos
  embutidos nos hosts Identity, Platform BFF e Platform Web.
- Credenciais, agentes e execucoes formam `independent_unit` no
  `svc-jboot-ai-gateway`, com build, runtime, deploy, healthcheck, secrets e
  operacao proprios.
- Persistencia propria isolada nao foi o criterio decisivo: a fronteira foi
  escolhida por reuso cross-module, autoridade exclusiva sobre segredos BYOK,
  egress externo e necessidade de falhar/escalar sem afetar o Kanban.

## Stack Fit Gate

| Candidata | Fit | Decisao |
|---|---|---|
| TypeScript/NestJS | contratos estruturados, adapters HTTP/SDK, jobs e observabilidade | recomendada |
| Python/FastAPI | forte ecossistema de IA, mas pouco ganho para gateway transacional | rejeitada nesta fronteira |
| Go | concorrencia/custo bons, menor ergonomia para providers e schemas heterogeneos | rejeitada nesta fronteira |

A baseline local nao recebeu bonus. A escolha contrafactual greenfield tambem
seria TypeScript/NestJS. Se o gateway passar a executar inferencia local,
pipelines cientificos ou GPU, a fronteira e o gate devem ser refeitos.

### Ownership

| Componente | Owner | Nao deve possuir |
|---|---|---|
| Identity | identidades, memberships, entitlements, roles/scopes por application | API keys, prompts ou execucoes de IA |
| Flow/Kanban | escritorios, regras de automacao, outbox e efeitos de dominio | descriptografacao de API key |
| AI Gateway | credenciais BYOK, agentes, providers e execucoes | permissao de negocio do card |
| Platform Web | composicao visual e clientes tipados | decisao de autorizacao ou segredo persistido |

### Limite De Confianca

```text
navegador
  -> Identity: usuario/permissoes do application_slug autenticado
  -> Platform BFF: escritorios e automacoes do Flow
  -> AI Gateway: credenciais/agentes do proprio usuario

Kanban outbox -> chamada s2s assinada -> AI Gateway -> provider externo BYOK
```

O gateway revalida `client_id`, `owner_identity_id`, `application_slug`,
status da credencial/agente e idempotency key. O Kanban continua decidindo quais
dados e efeitos de negocio sao permitidos. Nenhum provider externo recebe JWT,
cookie, database ref ou credencial interna JBoot.

ChatGPT Plan e API key sao modalidades diferentes do mesmo provider. Tokens
OAuth de plan usage ficam em cofre proprio e nao entram em `ai_credentials`;
revogacao/limite do plano falha fechado e nunca seleciona API key implicitamente.

### Modelo De Dados Proposto

```text
ai_provider_catalog
  provider, capabilities, credential_schema_version, status

ai_credentials
  id, client_id, owner_identity_id, provider,
  api_key_ciphertext, encryption_key_version, last4,
  status, validated_at, created_at, updated_at, revoked_at
  UNIQUE(client_id, owner_identity_id, provider)

ai_agents
  id, client_id, owner_identity_id, application_slug, credential_id,
  name, description, provider, model, external_reference,
  active_version, status, created_at, updated_at

ai_agent_versions
  id, agent_id, version, system_prompt_ciphertext,
  output_schema_json, content_sha256, created_by_identity_id, created_at
  UNIQUE(agent_id, version)

ai_executions
  id, client_id, requester_identity_id, agent_id, agent_version,
  application_slug, source_type, source_id, idempotency_key,
  provider, model, status, input_sha256, output_sha256,
  input_tokens, output_tokens, estimated_cost, latency_ms,
  error_code, started_at, finished_at
  UNIQUE(client_id, application_slug, idempotency_key)

module_settings_registry
  declarativo em codigo no frontend; nao e fonte de autorizacao
```

Segredos e prompts nao compartilham coluna nem finalidade. AES-256-GCM usa
chaves mestras distintas, versionadas, mantidas fora do banco. AAD inclui
`client_id`, owner, provider e ID do registro para impedir transplante de
ciphertext. `last4` e status sao os unicos metadados retornados da chave.

### Autorizacao De Usuarios E Escritorios

- `users:manage`: manager do tenant; pode administrar usuarios do modulo e
  escolher escritorios ativos do mesmo tenant.
- `flow:users:manage`: delegado do Flow; pode administrar usuario apenas no
  Flow e o backend ignora qualquer escritorio enviado, herdando todos os
  escritorios ativos do ator.
- ator delegado sem escritorio ativo recebe `403 actor_without_active_office`.
- ator, alvo ou escritorio de outro tenant retorna `404` indistinguivel.
- a UI exibe seletor editavel somente quando a capability devolvida pelo
  backend for `officeAssignmentMode = selectable`; em `inherited` mostra os
  escritorios bloqueados.
- Identity e Flow nao compartilham transacao. A facade usa command idempotente,
  estado `pending|completed|compensating|failed` e reconciliador; nao tenta
  simular atomicidade no navegador.

### Contratos HTTP Planejados

Identity:

- `GET /manager/module-permissions` — catalogo filtrado pelo contexto atual;
- `PUT /manager/users/:identityId/module-permissions` — substituicao validada
  de roles/scopes do modulo atual.

Flow facade:

- `GET /kanban/settings/users/context`;
- `POST /kanban/settings/users` com idempotency key;
- `PATCH /kanban/settings/users/:identityId`;
- `PUT /kanban/settings/users/:identityId/offices`.

AI Gateway:

- `GET/POST/PATCH/DELETE /v1/credentials`;
- `POST /v1/credentials/:id/test`;
- `GET/POST/PATCH/DELETE /v1/agents`;
- `GET /v1/agents/:id/versions`;
- `POST /v1/interactions` com JWT do usuario, resposta efemera e HTTP 200;
- `POST /v1/executions` s2s e idempotente;
- `GET /v1/executions/:id` com metadados sanitizados.

Rotas e DTOs definitivos exigem OpenAPI antes de codigo. O API Contract Graph
deve ser atualizado no mesmo change; nenhum achado pode ser aceito para ocultar
drift real.

## UI/UX Decision

```yaml
navigation:
  Configuracoes:
    global:
      - Permissoes
      - IA/Credenciais
      - IA/Agentes
    flow:
      - Google Drive
pages:
  permissions:
    pattern: ModuleUserManager evoluido
    states: [loading, empty, success, error, permission_denied]
  ai_credentials:
    pattern: platform-crud-ui
    secret: write_only
    provider_source: executable_provider_catalog
    production_rule: simuladores e providers sem adapter nao aparecem
  ai_agents:
    pattern: platform-crud-ui
    fields: [name, description, provider, credential, model, response_mode, system_prompt, output_schema, status]
    manual_interaction: modal read_only com resposta efemera e diagnostico sanitizado
  automation_action:
    selector: agentes ativos do flow autorizados ao ator
```

O registry de menu e extensivel por contribuicao. Autorizacao continua no
backend; esconder item nao concede nem revoga acesso.

## Architecture Graph

Nos planejados:

- `service:svc-jboot-ai-gateway` — owner `ai-platform`, lifecycle `in_progress`;
- `capability:ai-credential-management` — lifecycle `in_progress`; cofre e adapters reais existem, smoke OpenAI pendente;
- `capability:ai-agent-registry` — lifecycle `in_progress`; cadastro e capability por modelo implementados;
- `capability:ai-execution` — lifecycle `in_progress`; interacao manual efemera em implementacao, automacao permanece planejada;
- `capability:module-settings-registry` — lifecycle `planned`;
- `capability:flow-user-provisioning` — lifecycle `planned`.

Arestas planejadas:

- `app-jboot-next-platform -> bff-jboot-identity` (`manages_permissions`);
- `app-jboot-next-platform -> bff-jboot-platform/kanban`
  (`provisions_flow_user`);
- `app-jboot-next-platform -> svc-jboot-ai-gateway`
  (`manages_ai_configuration`);
- `app-jboot-next-platform -> svc-jboot-ai-gateway`
  (`interacts_with_ai_agent`);
- `bff-jboot-platform/kanban -> svc-jboot-ai-gateway`
  (`executes_agent_s2s`);
- `svc-jboot-ai-gateway -> external_ai_provider` (`invokes_byok`);
- `ai-agent-registry -> application` (`scoped_to_module`);
- `ai-agent-registry -> ai-credential-management` (`uses_credential`).

Provenance esperada: este gate, futuro `PROJECT_CONTRACT.md`, OpenAPI, modelo
de dados e attestation. O registry/gate do Architecture Graph continua
pendente na Sprint 4 de `docs/product/api-graph-sprints.md`; registrar estes
nodes/edges no registry assim que operacional. Ate la, nao afirmar grafo
sincronizado nem concluir as sprints.

## Seguranca E Privacidade

- threat model cobre exfiltracao de chave/prompt, confused deputy, prompt
  injection, SSRF, provider spoofing, replay, abuso de quota e resposta hostil;
- egress allowlist por adapter, TLS obrigatorio, redirects desabilitados e
  limites de payload;
- chaves descriptografadas apenas em memoria e pelo adapter selecionado;
- prompt/input/output nunca entram integralmente em log, fila, metrica, trace
  ou auditoria;
- fila transporta IDs e hashes; worker revalida todo contexto;
- ferramenta externa desabilitada por default; cada tool exige contrato e
  allowlist separados;
- conteudo produzido pela IA e nao confiavel e passa por schema e policy de
  efeito antes de tocar o dominio;
- security checklist bloqueante antes do merge.

### Security checklist — Sprint 11/fundacao estrutural (2026-10-14)

- aprovado e persistido em `docs/security/ai-gateway-foundation-security-checklist.md`;
- JWT e scope sao verificados separadamente; tenant/owner vem apenas do token;
- AES-256-GCM usa nonce aleatorio e AAD versionado com id/tenant/owner/provider;
- revogacao remove ciphertext, nonce e tag, preservando auditoria sem segredo;
- provider arbitrario/URL externa nao sao aceitos; o scaffold local validou o
  cofre, mas nao conta como provider entregue;
- suite inclui testes negativos de adulteracao, troca de tenant/owner, scope e provider;
- `npm audit --omit=dev` reporta zero vulnerabilidades.

### Security checklist — Sprint 10 (2026-10-14)

- injection: aprovado; queries parametrizadas e nenhum comando recebe input;
- access control: aprovado; JWT e scopes verificados separadamente, tenant vem
  do token, escritorios sao revalidados por `client_id` no backend;
- dados sensiveis: aprovado; payload pessoal nao e persistido no comando nem
  em log/auditoria; comparacao idempotente usa HMAC-SHA-256 com chave dedicada;
- mass assignment: aprovado; DTO com whitelist global e campos explicitos;
- rate limiting/paginacao: N/A; endpoint autenticado, mutacao singular e sem
  listagem; a idempotencia impede duplicacao por retry;
- SSRF: aprovado; URL do Identity vem apenas de configuracao operacional;
- dependencias: N/A; nenhuma dependencia adicionada;
- stack: aprovado; token nao e persistido, TLS e obrigatorio fora do runtime
  local e nenhum segredo novo entra no bundle web;
- GenAI/tools: N/A para o fluxo funcional; nenhuma saida de modelo e executada.

Evidencias: suites completas dos BFFs e frontend, builds em container,
`docker compose config`, migration aplicada no banco de desenvolvimento e
`make ai-api-graph-gate` sem erros.

## Plano De Testes

- unitarios: criptografia/AAD, rotacao, policies, catalogo, schema, custos e
  sanitizacao;
- PostgreSQL: tenant/owner/provider/module, concorrencia e idempotencia;
- contract tests por provider com fake deterministico e fixtures sem PII;
- integracao: Identity + Flow facade + escritorios, inclusive falha parcial;
- filas: outage, retry, backoff, DLQ, cancelamento e reconciliacao;
- seguranca: chave canario em resposta/log/span, prompt injection, SSRF,
  confused deputy e payload malformado;
- UI: registry, modulo atual, manager/delegado, campo bloqueado, estados e 403;
- E2E sintetico: criar credencial, agente, regra, disparar, validar ledger e
  efeito permitido sem duplicidade;
- isolamento concorrente entre dois tenants, dois usuarios e dois modulos.

## Artefatos De Contrato

- `docs/data/kanban-sprint-10-12-data-model.md`;
- `docs/api/kanban-sprint-10-12-openapi.yaml`;
- `docs/security/kanban-ai-agents-threat-model.md`.

Os artefatos estao `planned`: tornam ownership, contratos e riscos auditaveis,
mas nao representam endpoints, migrations ou providers implementados.

## Ordem De Implementacao

1. Usar branch dedicada por incremento; `openai` foi confirmado como provider
   inicial em 2026-10-15 e `anthropic` como incremento seguinte.
2. Criar contratos OpenAPI/modelo/threat model e registrar graph planned.
3. Implementar Sprint 10: Identity, facade Flow e UI; congelar APIs e commitar.
4. Criar fundacao do `svc-jboot-ai-gateway` pelo fluxo `/jboot-new-module`,
   incluindo contrato, runtime, healthcheck, observabilidade e secrets.
5. Implementar credenciais antes de agentes; agentes antes de execucoes.
6. Congelar/commitar a API s2s antes do frontend ou Kanban consumidor.
7. Implementar Sprint 12 com outbox e efeito inicialmente read-only/revisavel.
8. Executar security review, testes em containers, API Graph, Architecture
   Graph quando disponivel, `make ai-check` e `make ai-conformance`.

## Perguntas Resolvidas

- credencial por usuario + tenant + provider: confirmada;
- agente gerenciado/versionado pelo JBoot com prompt manual: confirmado;
- manager edita permissoes por modulo: confirmado;
- servico independente de IA: confirmado quando tecnicamente recomendado;
- manager escolhe escritorios; delegado herda os proprios: confirmado.
- desenvolvimento e homologacao usam adapters reais de producao; provider fake
  nao faz parte do catalogo, UI, banco ou runtime: confirmado em 2026-10-15;
- ordem de rollout corrigida e confirmada: OpenAI primeiro, Anthropic direto na
  sequencia, em 2026-10-15;
- primeiro caso de uso: interacao manual read-only; automacao somente depois do
  contrato de dados e efeitos da Sprint 12.
- ChatGPT Plus e obrigatorio como modalidade primaria; API key e opcional;
- agentes, prompts e modelos sao cadastrados/versionados no JBoot;
- automacoes usam documentos anexados e dados do card/cliente quando o contrato
  estiver fechado;
- o prompt pode solicitar uma ou mais tools tipadas do manifest versionado do
  agente; comando livre nunca ganha autoridade e cada chamada e reautorizada;
- em desenvolvimento a conta designada e a do operador do projeto; em producao
  cada tenant designa e autoriza sua propria conta responsavel.

## Bloqueios E Decisoes Pendentes

- obter aprovacao comercial da OpenAI e confirmacao de background automation;
- receber client ID, callbacks, scopes e contrato de tokens aplicavel ao SaaS;
- aprovar politica por provider: regiao, retencao, treinamento, DPA e dados
  permitidos;
- definir allowlists OpenAI/Anthropic por capability e limites de custo/quota;
- definir KMS/secret manager, rotacao e separacao de chaves por ambiente;
- fechar catalogo inicial de tools/schemas/approval policies/campos e contrato
  de card/cliente/anexos;
- Architecture Graph registry/gate ainda nao operacional. O planejamento fica
  valido, mas a entrega nao pode ser declarada concluida sem a migracao.

## Plano De Correcao Da Fundacao Simulada

### Replanejamento OpenAI-first — confirmacao e implementacao 2026-10-15

- fonte detalhada: `docs/product/kanban-ai-providers-replan.md`;
- confirmacao humana: OpenAI primeiro, Anthropic na sequencia, resposta sem
  historico de conteudo e primeiro fluxo manual read-only;
- endpoint de usuario: `POST /v1/interactions`, HTTP 200, tenant/owner/modulo
  derivados do JWT e `Idempotency-Key` igual ao `requestId`;
- replay nao cobra nova inferencia e nao recupera conteudo: devolve
  `outputAvailable=false`, pois somente hashes e metadados ficam no ledger;
- agentes versionam `response_mode`; modelos sao filtrados por capabilities
  `text-output` e `structured-output` declaradas por configuracao;
- `/v1/executions` permanece reservado ao futuro consumidor s2s e passa a
  exigir JWT curto do Identity com audience `svc:ai-gateway`; headers de tenant
  e modulo sao contexto delegado do caller autenticado, nao credenciais;
- `AI_GATEWAY_ENABLED_PROVIDERS=openai` e o default seguro; Anthropic somente e
  exposto quando habilitado explicitamente;
- graph planejado adicional: node `capability:ai-manual-interaction` e edge
  `app-jboot-next-platform -> svc-jboot-ai-gateway` (`interacts_with_ai_agent`).

Estado: `em andamento`. Implementacao e testes internos podem avancar; smoke
externo, dados reais e producao continuam bloqueados pelas pendencias acima.

Evidencia deste incremento: gateway com 32 testes, typecheck, lint e build;
Identity com 20 testes, typecheck, lint e build; frontend com 109 testes,
type-check, lint sem erros e build; tudo em container. Migration 077 aplicada
no PostgreSQL local, `docker compose config` valido, API Graph sem erros,
`make ai-check`, `make ai-diff-check` e `make ai-conformance` aprovados.
Gateway, Identity e frontend possuem zero vulnerabilidades no `npm audit`.
Identity e frontend passaram `npm ci`; seus lockfiles estao sincronizados. O
gate de dependencias que bloqueava merge foi encerrado. Producao permanece
bloqueada por smoke externo, politica de dados, KMS e controles operacionais.

### Incremento OpenAI — Preflight 2026-10-15

Checkpoint de implementacao: SDK oficial `openai 7.34.0`, registry fechado,
Models e Responses implementados; migration 076 aplicada. Incremento integrado
ao checkout local na branch `codex/ai-gateway-openai-runtime`, preservando o
trabalho pendente do Drive. Catalogo autenticado retornou HTTP 200 com
`anthropic` e `openai`; readiness HTTP 200. Gateway: 26 testes, lint, typecheck,
build e audit aprovados; frontend: 108 testes, type-check e build aprovados.
`make ai-check` passou apos registrar o gateway no catalogo implementations.
Smoke de sucesso externo OpenAI e promocao para producao continuam pendentes.

- Registro historico: este checkpoint originalmente tratou OpenAI apos
  Anthropic. O replanejamento acima substitui apenas a ordem de rollout; API
  key BYOK e escopo permanecem, sem OAuth/Plus.
- PE Decision: `cross_project`, gateway + Platform Web/kanban; sprint_artifact
  `docs/product/kanban-sprints.md`, sprint_gate este documento.
- Deployment Boundary Gate: adapter `embedded_module` do gateway existente;
  nao cria deploy, banco, worker ou application Identity.
- Stack Fit Gate: `not_applicable_inherited_from_host`, TypeScript/NestJS.
- API: mesmas rotas e DTOs; catalogo passa a conter `openai`; modelos e
  execucao resolvem o adapter pelo provider cifrado da credencial/agente.
- Plano: SDK oficial OpenAI, `GET /v1/models`, Responses API com JSON Schema,
  `store:false`, host fixo, timeout, sem redirects/retries, erros sanitizados.
- Validacoes: testes positivos/negativos internos de roteamento e isolamento,
  testes de erro HTTP, suite PostgreSQL, build/lint/typecheck/audit em container,
  API Graph e ai-conformance; smoke externo somente com chave real via UI.
- Graph: node `integration:openai-responses` e edge
  `svc-jboot-ai-gateway -> api.openai.com` (`invokes_byok`), owner ai-platform,
  lifecycle in_progress, provenance neste gate/SDK/attestation. Migracao ao
  Architecture Graph registry continua obrigatoria quando operacional.
- open_questions/blocking_status: implementacao autorizada; chave de teste e
  politica de dados OpenAI pendentes para smoke e liberacao de negocio.

Incremento executor 2026-10-15:

- integrado ao checkout `/home/projetos/jboot` na branch
  `codex/ai-gateway-runtime`, preservando alteracoes locais do Drive;
  gateway readiness e paginas de Credenciais/Agentes responderam HTTP 200;

- Messages API real pelo SDK oficial Anthropic `0.134.0`; `output_config.format`
  JSON Schema, validacao local Ajv e uso do system prompt versionado;
- SDK com TLS/origin fixos, redirects e logging desabilitados, timeout 60s e
  retries zero para evitar duplicacao de cobranca em resultado ambiguo;
- idempotencia inclui owner/agente/origem; somente metadados, hashes e tokens
  reais vao ao ledger; custo indisponivel permanece NULL;
- reserva PostgreSQL por tenant+owner: duas execucoes simultaneas, vinte
  tentativas em janela de 24h, input ate 64 KiB e output ate 4096 tokens;
- kill switch e allowlist de modelos via configuracao de runtime. Inferencia
  permanece desabilitada por default ate aprovacao da politica e smoke real;
- 21 testes gateway aprovados, incluindo concorrencia real PostgreSQL, replay,
  sanitizacao de erros SDK, limites e bloqueio de modelo/execucao;
- a suite nao possui fixture fabricada de sucesso Anthropic; teste positivo do
  contrato externo e coleta de resposta anonimizada dependem da chave via UI;
- pendencias da Sprint 11: budgets monetarios/politicas por tenant, circuit
  breaker distribuido, cancelamento/reconciliacao de execucoes interrompidas,
  KMS/rotacao, politica de dados e smoke externo. Sprint 12 permanece pendente.

Checkpoint 2026-10-15, branch `codex/ai-gateway-anthropic`:

- implementados: catalogo Anthropic real, consulta autenticada de modelos via
  `GET https://api.anthropic.com/v1/models`, validacao sem prompt/PII, erros
  sanitizados, TLS/host fixo, redirects bloqueados, timeout de 10s e limite de
  resposta de 1 MiB;
- UI consulta `/v1/providers` e `/v1/credentials/:id/models`; modelos indisponiveis
  sao rejeitados tambem pelo service de agentes;
- executor simulado removido; `POST /v1/executions` retorna
  `503 ai_execution_not_enabled` ate a entrega do executor real e sua policy;
- migracao `075_ai_gateway_anthropic_catalog.sql` registra Anthropic, revoga
  material simulado e preserva historico; migration aplicada no banco local;
- validacao concorrente compara nonce para nao ativar chave substituida ou
  ressuscitar credencial revogada;
- ainda pendentes: smoke com chave real, captura anonimizada de sucesso do
  provider, executor Claude, allowlist operacional, budgets, circuit breaker,
  politica de dados e KMS/rotacao. Este checkpoint nao conclui a Sprint 11;
- neste primeiro checkpoint o incremento existia somente no worktree
  `/home/projetos/jboot-ai-anthropic`; o incremento executor acima registra
  sua integracao posterior ao checkout usado pelos processos locais.

1. Remover `fake` do catalogo HTTP, UI e injetores de runtime.
2. Introduzir contrato de adapter de provider e transporte HTTP injetavel.
3. Implementar `AnthropicProviderAdapter` em `src/ai/providers`, com hosts e
   versao de API fixos por configuracao confiavel, nunca pelo request.
4. Validar credencial Anthropic por operacao oficial sem conteúdo de usuario;
   falha de autenticacao marca `invalid`, indisponibilidade mantem estado
   anterior e retorna erro sanitizado.
5. Obter modelos da conta Anthropic, aplicar allowlist operacional e expor ao
   formulario de agentes; modelo deixa de ser texto livre.
6. Substituir o executor simulado pelo adapter Anthropic, preservando
   idempotencia, hashes e ledger sanitizado.
7. Atualizar OpenAPI, API Graph, Architecture Graph/provenance e clientes
   tipados antes do frontend consumidor.
8. Remover dados/credenciais `fake` existentes por migracao explicita de
   saneamento; nunca reinterpretar chave simulada como chave real.
9. Executar security review, testes unitarios/contratuais/integracao, lint,
   type-check, build, audit e smoke de homologacao com credencial informada
   somente pela UI/secret do ambiente.

Nenhum item acima pode ser marcado concluido usando mock, fixture fabricada,
resposta sintetica ou somente sucesso de build como evidencia funcional.
