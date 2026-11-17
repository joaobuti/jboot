# Replanejamento — Kanban AI Providers

## Estado

```yaml
status: implementation_in_progress
decision_status: confirmed_by_human_2026-10-15
review_date: 2026-10-15
canonical_sprint_artifact: docs/product/kanban-sprints.md
canonical_sprint_gate: docs/product/kanban-sprint-10-12-gate.md
code_authorized_by_this_document: true
blocking_status:
  - external_openai_smoke_pending
  - chatgpt_plan_commercial_approval_pending
  - chatgpt_plan_background_automation_grant_pending
  - production_data_policy_kms_and_operational_controls_pending
  - architecture_graph_registry_not_operational
```

Este documento registra a revisao do planejamento existente. A recomendacao
foi confirmada integralmente pelo usuario em 2026-10-15 e esta sendo
incorporada ao artefato canonico, ao gate e aos contratos afetados. O
Architecture Graph deve receber a migracao quando o registry estiver
operacional.

## Correcao 2026-10-15 — Assinatura Claude

Assinatura Claude (Pro/Max/Team/Enterprise) nao e usada por chave de API e a
Anthropic proibe apps de terceiros de oferecer login Claude.ai ou rotear
requisicoes por credenciais Free/Pro/Max. Decisao humana de 2026-10-15: uso
interativo pelo conector MCP do Flow
(`docs/product/kanban-claude-connector-sprints.md`) e automacao pela rotina do
Claude Code disparada por API (`connectionMode = claude_routine` na Sprint 12).
O provider `anthropic` deste documento e somente Claude API direta por chave;
Bedrock/Vertex nao fazem parte do pedido.

## Diagnostico Do Estado Atual

1. A ordem de produto documentada esta invertida: o plano declara Anthropic
   como primeiro provider, mas a decisao atual e liberar OpenAI primeiro e
   Anthropic depois.
2. A fundacao provider-neutral, os cadastros de credenciais/agentes e adapters
   OpenAI/Anthropic ja existem no repositorio. Reimplementar do zero criaria
   retrabalho; o trabalho correto e reconciliar contratos, fechar lacunas e
   promover providers em ordem controlada.
3. A UI existente configura credenciais e agentes, mas nao envia uma solicitacao
   de usuario nem exibe a resposta do modelo.
4. `POST /v1/executions` nao possui consumidor modelado no API Contract Graph,
   exige autenticacao s2s, executa de forma sincrona apesar de responder `202`
   e descarta o output integral depois de gravar apenas seu hash. Assim, o
   contrato atual nao atende interacao humana e tambem nao entrega ao Kanban o
   resultado necessario para um efeito de automacao.
5. O service token estatico com contexto informado por headers/body diverge do
   padrao de token s2s curto emitido pelo Identity ja usado no repositorio.
6. O catalogo lista modelos da conta, mas nao representa de forma suficiente
   capabilities por modelo. Disponibilidade no endpoint `/models` nao prova
   suporte a JSON Schema, modalidade, custo ou politica aprovada.
7. Os checkpoints locais comprovam testes/build dos adapters, nao prontidao de
   producao: smoke externo com chave real, KMS/rotacao, politica de dados,
   budgets, circuit breaker e observabilidade produtiva continuam pendentes.
8. O plano mistura tres entregas diferentes: configuracao BYOK, interacao
   usuario-modelo e automacao de dominio. Elas precisam de gates e contratos
   separados.
9. O agent local atual do Kanban ainda afirma que o modulo nao possui feature
   de IA. Ele deve ser corrigido, com contexto derivado e conformance
   regenerados, antes de qualquer implementacao Kanban/IA.

## PO Scope Corrigido

```yaml
objective: permitir que um usuario do Flow configure um agente e que interacoes manuais ou gatilhos do Kanban o executem pela OpenAI usando primariamente o plano ChatGPT autorizado
provider_rollout:
  first: openai
  second: anthropic_claude_api_byok
users_roles:
  - flow_user_with_ai_execute_scope
  - ai_configuration_owner
  - tenant_operator
in_scope_initial:
  - conexao ChatGPT Plan como modalidade primaria, condicionada a aprovacao comercial
  - credencial BYOK cadastrada e testada na aplicacao
  - agente versionado com provider, modelo e prompt de sistema
  - execucao manual read-only dentro do Flow
  - retorno de resposta ao usuario e ledger sanitizado
  - limites de uso, kill switch e diagnostico operacional
out_of_scope_initial:
  - tools externas
  - mutacao automatica de cards
  - RAG, arquivos, imagens, audio e web search
  - invocacao direta de Custom GPT por nome
  - coleta de senha, cookie ou token de sessao do ChatGPT
  - fallback silencioso entre providers
```

### Criterios De Aceite Do Primeiro Incremento

- OpenAI e o unico provider liberado no primeiro rollout; Anthropic pode
  permanecer implementado, mas fica desabilitado por configuracao e nao aparece
  como opcao utilizavel ate o segundo gate.
- No produto, `chatgpt_plan` e a modalidade primaria e obrigatoria; `api_key`
  e opcional e nunca recebe fallback automatico por limite, revogacao ou erro.
- O usuario seleciona um agente proprio do tenant/modulo e envia uma entrada na
  interface; a resposta e exibida sem expor chave, prompt de sistema ou token
  s2s.
- Tenant, owner e `application_slug` sao derivados do JWT validado, nunca do
  body da chamada de usuario.
- Provider/modelo sao resolvidos do agente versionado; a request nao escolhe
  endpoint externo nem contorna a allowlist.
- O gateway retorna o output ao chamador autorizado e grava somente metadados,
  hashes, tokens, custo conhecido, latencia e erro sanitizado, conforme a
  politica de retencao aprovada.
- Recusa, timeout, rate limit, schema invalido e provider indisponivel aparecem
  na UI com codigo estavel e nao geram retry automatico de inferencia paga.
- Smoke real OpenAI e obrigatorio antes de promover o provider; fixture
  fabricada, build ou mock nao contam como evidencia externa.

## PE Decision

```yaml
execution_mode: cross_project
delivery_type: shared_ai_integration
target_projects:
  - implementations/svc-jboot-ai-gateway
  - implementations/app-jboot-next-platform
target_module:
  - modules/kanban
conditional_target_project:
  - implementations/bff-jboot-platform
deployment_boundary_gate:
  ai_gateway: independent_unit
  provider_adapters: embedded_modules_in_ai_gateway
  interactive_ui: embedded_module_in_platform_web
  kanban_automation: embedded_module_in_platform_bff
stack_fit_gate:
  ai_gateway: already_approved_typescript_nestjs
  embedded_modules: inherited_from_host
sprint_artifact: docs/product/kanban-sprints.md
sprint_gate: docs/product/kanban-sprint-10-12-gate.md
architect_required: true
human_confirmation: confirmed_2026-10-15
```

## Deployment Boundary Gate

O `svc-jboot-ai-gateway` permanece uma unidade independente: concentra egress,
segredos BYOK, adapters, quotas e ledger compartilhados entre produtos. OpenAI
e Anthropic sao adapters embutidos nesse servico, nao novos deploys. A tela
interativa herda Next.js/React do Platform Web. Automacao de cards, quando
autorizada em sprint posterior, permanece no BFF Kanban e chama o gateway por
contrato s2s.

## Stack Fit Gate

Nao ha nova escolha de stack neste replanejamento. A decisao greenfield ja
registrada para o gateway continua valida: TypeScript/NestJS supera
Python/FastAPI e Go neste escopo transacional de contratos, providers, quotas e
observabilidade. Os adapters herdam o runtime do gateway; UI e Kanban herdam os
hosts. Uma mudanca para inferencia local/GPU exigiria novo boundary e novo
Stack Fit Gate.

## Architecture Recommendation

### Fronteiras De Execucao

| Fluxo | Fronteira recomendada | Motivo |
|---|---|---|
| Configurar credencial/agente | Browser -> AI Gateway com JWT de usuario | owner/tenant/modulo derivados do token |
| Solicitar resposta manual | Browser -> AI Gateway com JWT de usuario | fluxo read-only, sem autoridade de dominio |
| Automatizar card | Kanban BFF/worker -> AI Gateway com token s2s Identity | policy de dados e efeito pertencem ao Kanban |
| Chamar provider | AI Gateway -> endpoint oficial fixo | segredo e egress ficam em uma unica autoridade |

Para s2s, substituir o segredo bearer estatico pelo token curto emitido pelo
Identity, com `iss`, `aud=svc:ai-gateway`, `sub/client_id`, `typ`, `exp` e
allowlist de caller. Contexto delegado deve ser validado separadamente; headers
arbitrarios nao constituem identidade.

### Contrato De Resposta

O contrato precisa separar:

- `interaction`: sincrona, read-only, `200`, retorna output ao usuario;
- `execution`: assincrona, `202`, destinada a automacao, outbox e worker;
- `ledger`: metadados e hashes duraveis;
- `execution_payload`: input/output cifrados com TTL apenas se automacao ou
  historico aprovado exigirem recuperacao posterior.

Nao manter um endpoint sincrono que responde `202` e elimina o output. Para o
primeiro incremento, a recomendacao e interacao efemera sem historico de
conteudo: a resposta viaja apenas na resposta HTTP e o ledger guarda metadados.
Se o usuario exigir historico/replay, o output deve ser cifrado, ter retencao
curta configuravel e expurgo testado; nunca ser gravado em claro no ledger.

### Contrato De Provider

Cada adapter deve implementar contratos tipados independentes para:

- validar credencial sem inferencia;
- listar modelos e capabilities observadas;
- executar `text` e/ou `json_schema` somente quando o modelo e o ambiente
  suportarem a capability;
- normalizar usage, finish reason, recusa e erros;
- respeitar timeout/cancelamento, egress fixo e zero retry automatico para
  inferencia de resultado ambiguo.

O modelo selecionavel e a intersecao entre catalogo real da conta, allowlist do
ambiente e capability exigida pelo agente. O endpoint de modelos sozinho nao e
allowlist operacional.

## UIUX Decision

```yaml
objective: permitir teste/uso manual de um agente configurado e exibir a resposta
target_project: implementations/app-jboot-next-platform
target_module: modules/kanban
scenario_classification:
  credential_and_agent_crud: covered_by_platform_crud_ui
  interaction_console: new_pattern_required
template_sources_checked:
  - implementations/templates/original/Next-TS
  - implementations/app-jboot-identity-admin
  - implementations/app-jboot-next-platform/skills/platform-crud-ui.md
flow:
  empty: orientar selecao/criacao de agente sem permitir envio
  loading: bloquear novo envio e exibir progresso/cancelamento quando suportado
  error: codigo sanitizado, retry manual quando seguro e diagnostico copiavel
  success: resposta, provider/modelo, tokens, latencia e execution_id
  permission_denied: estado explicito sem esconder silenciosamente a causa
information_hierarchy:
  - agente e modelo efetivos
  - entrada do usuario
  - resposta
  - metadados operacionais
primary_action: Enviar
new_component:
  name: AiInteractionConsole
  classification: excecao_isolada
  rationale: fluxo transacional read-only, nao e CRUD nem board drag-and-drop
navigation_impact: acao Testar em Agentes; rota dedicada somente se o fluxo exigir historico
decision_status: confirmed_2026-10-15
```

A UI deve reutilizar o preset, componentes e client tipado existentes. O novo
padrao nao deve ser promovido para `platform-crud-ui` sem evidencias de reuso em
outros modulos.

## Plano De Entrega Corrigido

### Incremento 0 — Reconciliacao Da Fundacao Existente

Estado: `concluido` em 2026-10-15.

- congelar OpenAPI/DTOs antes de frontend e registrar impacto no API Graph;
- corrigir a ordem de rollout nos documentos: OpenAI primeiro, Anthropic depois;
- separar capabilities `credential-test`, `model-catalog`, `text-output` e
  `structured-output`;
- corrigir semantica de `interaction` versus `execution`;
- trocar autenticacao s2s estatica pelo padrao Identity;
- atualizar o agent local Kanban que ainda proibe feature de IA;
- manter Anthropic desabilitado no ambiente ate o segundo incremento;
- atualizar threat model, security checklist, testes de regressao e attestation.

### Incremento 1 — OpenAI Vertical Slice

Estado: `concluido como checkpoint BYOK opcional`; nao libera o produto sem a
modalidade ChatGPT Plan confirmada pelo usuario.

- adapter oficial OpenAI/Responses com `store:false`, host fixo e modelo
  permitido por capability;
- credencial BYOK write-only e validacao sem inferencia;
- agente com modo de resposta explicito: `text` ou `json_schema`;
- endpoint user-authenticated de interacao, derivando tenant/owner/modulo do
  JWT e retornando output somente ao chamador;
- tela no Flow para selecionar agente, enviar solicitacao, acompanhar estado e
  ver resposta/erro sanitizado;
- quotas e concorrencia configuraveis por tenant/owner, kill switch, metricas,
  traces sem conteudo e custo quando houver tabela de preco versionada;
- smoke externo com chave real informada pela UI, resposta anonimizada como
  fixture e evidencias executaveis.

### Incremento 1B — ChatGPT Plan Primario

Estado: `bloqueado por admissao externa`.

- obter aprovacao da OpenAI para aplicacao comercial remotamente hospedada;
- confirmar expressamente automacoes server-side sem usuario presente;
- implementar OAuth/OIDC com PKCE, state, nonce, callback allowlisted e cofre
  de access/refresh tokens somente depois de receber client ID e contrato real;
- separar conexao `chatgpt_plan` de credencial `api_key`, sem reaproveitar
  token OAuth como API key ou fazer fallback silencioso;
- executar Responses API no contrato aprovado, incluindo streaming/store false
  quando exigidos, e apresentar uso/limites do plano na UI;
- cobrir revogacao, refresh concorrente, limite compartilhado e isolamento
  tenant/owner com E2E real.

### Incremento 2 — Anthropic

- canal confirmado: Claude API direta com chave do Claude Console (Messages
  API, Models API; `anthropic-workspace-id` opcional). Nao usa nem substitui a
  assinatura Claude, atendida pelo conector MCP e pela rotina;
- recusar na validacao tokens de assinatura (OAuth do Claude Code) colados no
  lugar da chave; a tela informa que a chave e cobrada por token;
- Bedrock/Vertex so se um cliente pedir explicitamente, como adapter proprio;
- repetir o Definition of Done do OpenAI e liberar no catalogo apenas depois de
  smoke real e politica aprovada.

### Incremento 3 — Automacao Kanban

- manter fora do primeiro rollout;
- outbox transacional, worker, DLQ, idempotencia e token s2s Identity;
- payload cifrado com TTL para transportar o resultado ate o efeito;
- registry inicial de tools e approval policies confirmado antes dos handlers;
- resposta de IA nunca amplia permissao nem muta dominio sem policy local.

## Validacao Obrigatoria

- testes unitarios positivos/negativos por adapter e capability;
- contract tests com transporte injetavel e fixtures reais anonimizadas;
- testes PostgreSQL de tenant/owner/idempotencia/concorrencia;
- testes de auth user e s2s, confused deputy, replay, SSRF e exfiltracao;
- testes de UI do fluxo completo e estados de falha;
- smoke externo opt-in por provider;
- dentro dos containers: test, lint, type-check, build e audit;
- `make ai-api-context`, `make ai-api-impact`, `make ai-api-graph-gate`,
  `make ai-check` e `make ai-conformance`;
- Architecture Graph: registrar nodes/edges quando o gate existir; ate la,
  manter o debito de migracao explicito e nao declarar sincronizacao.

## Agent Activation Planejada

```yaml
using_agent:
  - docs/agents/orchestration/product-owner.md
  - docs/agents/orchestration/product-engineer.md
  - docs/agents/orchestration/architect.md
  - docs/agents/orchestration/ui-ux.md
  - implementations/svc-jboot-ai-gateway/agents/ai-gateway-backend.md
  - implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
  - implementations/bff-jboot-platform/modules/kanban/agents/kanban-board-domain.md
using_skill:
  - docs/skills/ai-first-governance/SKILL.md
  - docs/skills/security-checklist/SKILL.md
  - docs/skills/dev-runtime-profile/SKILL.md
  - implementations/svc-jboot-ai-gateway/skills/byok-credential-vault.md
  - implementations/app-jboot-next-platform/skills/platform-crud-ui.md
  - implementations/app-jboot-next-platform/skills/api-client.md
  - implementations/app-jboot-next-platform/skills/platform-design-system.md
referenced_only:
  - implementations/app-jboot-next-platform/modules/kanban/skills/kanban-board-ui.md
```

Os paths locais acima devem ser verificados novamente depois da confirmacao;
nenhum agent/skill inexistente pode ser declarado como ativado.

## Decisoes Humanas Necessarias

As decisoes 1–4 abaixo foram confirmadas em conjunto em 2026-10-15. Em decisao
posterior no mesmo dia, ChatGPT Plus foi definido como obrigatorio e BYOK como
opcional. A decisao 5 permanece bloqueante antes dos efeitos da automacao.

1. `primary_interaction` — recomendado: interacao manual read-only no Flow
   primeiro; automacao Kanban fica para incremento posterior.
2. `anthropic_channel` — resolvida em 2026-10-15: Claude API direta por chave.
   Assinatura Claude pelo conector MCP e pela rotina, nao por este provider.
3. `output_retention` — recomendado inicialmente: resposta efemera, sem
   historico de conteudo; apenas ledger sanitizado. Historico exige cifra+TTL.
4. `working_tree_isolation` — a branch atual contem alteracoes nao commitadas de
   Google Drive. Antes do codigo, autorizar um checkout/worktree limpo ou
   concluir/isolar essas alteracoes; nao misturar features.
5. `first_domain_effect` — pode ser decidido depois se automacao ficar fora do
   primeiro incremento; torna-se bloqueante antes do Incremento 3.
6. `openai_auth_priority` — confirmado: `chatgpt_plan` primario obrigatorio;
   `api_key` opcional, sem fallback automatico.
7. `agent_ownership` — confirmado: agentes/prompt/modelo pertencem ao JBoot;
   Custom GPT salvo no ChatGPT nao e dependencia.
8. `automation_payload` — documentos anexados e dados de card/cliente serao
   fontes futuras, com contrato ainda em desenvolvimento.
9. `automation_effect` — confirmado: o prompt pode escolher e encadear uma ou
   mais tools do capability manifest versionado; cada chamada e estrita,
   reautorizada e idempotente. Catalogo/schemas continuam bloqueantes.
10. `plan_connection_owner` — confirmado: em desenvolvimento a identidade do
    operador do projeto designa a propria conta; em producao cada tenant designa
    e autoriza sua conta responsavel, sem compartilhamento entre tenants.

## Recomendacao Para Confirmacao

Confirmar em conjunto:

```yaml
primary_interaction: manual_read_only
anthropic_channel: direct_claude_api
output_retention: ephemeral_no_content_history
provider_rollout: openai_then_anthropic
openai_auth_priority: chatgpt_plan_then_explicit_api_key
kanban_automation: later_increment
working_tree_isolation: clean_dedicated_checkout
```

