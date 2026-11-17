# Project Contract: svc-jboot-ai-gateway

## Status

```yaml
lifecycle_status: in_progress
production_readiness: blocked
status_evidence: OpenAI-first em implementacao; BYOK opcional, catalogo, cofre, agentes versionados e interacao manual existem; ChatGPT Plan obrigatorio para o produto depende de admissao comercial, OAuth e controles produtivos
last_status_review: 2026-10-15
```

## Identificacao

| Campo | Valor |
|---|---|
| Tipo | Servico independente de integracao de IA |
| Capability | `ai-gateway` (interna; nao e application Identity) |
| Runtime | Node.js 22 + TypeScript + NestJS |
| Banco | PostgreSQL dedicado `jboot_ai_gateway` |
| Porta local | `8050` |

## Responsabilidade

Autoridade exclusiva sobre credenciais BYOK, agentes versionados, adapters de
provider e ledger de execucao. BFFs consumidores nunca recebem chave em claro.
Integracoes de IA ficam concentradas neste projeto e em `src/ai`.

## Contratos Obrigatorios

- `docs/product/flow-ai-completion-sprints.md`: tool opt-in
  `kanban.automation.complete`, declaracao estruturada de conclusao; nao move cards.

- `docs/product/kanban-sprints.md` (Sprint 11);
- `docs/product/kanban-ai-providers-replan.md`;
- `docs/product/chatgpt-plan-usage-sprints.md`;
- `docs/product/kanban-sprint-10-12-gate.md`;
- `docs/api/kanban-sprint-10-12-openapi.yaml`;
- `docs/data/kanban-sprint-10-12-data-model.md`;
- `docs/security/kanban-ai-agents-threat-model.md`.
- `docs/security/ai-gateway-foundation-security-checklist.md`.
- `docs/security/ai-gateway-openai-interaction-checklist.md`.
- `docs/product/kanban-claude-connector-sprints.md` (modo `claude_routine`).
- `docs/runbooks/flow-claude-connector.md`.
- `docs/security/flow-claude-connector-checklist.md`.
- `docs/product/ai-usage-metering-sprints.md`: consumo de IA por cliente,
  aplicacao, agente e modelo (S1 captura completa de tokens, S2 preco e custo
  estimado, S3 API de consumo agregado); somente monitoramento, confirmado em
  2026-11-14.

## Agents Locais

- `agents/ai-gateway-backend.md`.

## Skills Locais

- `skills/byok-credential-vault.md`.

## Ativacao Obrigatoria

```text
Agent Activation:
  project: implementations/svc-jboot-ai-gateway
  module: none
  using_agent:
    - implementations/svc-jboot-ai-gateway/agents/ai-gateway-backend.md
  using_skill:
    - implementations/svc-jboot-ai-gateway/skills/byok-credential-vault.md
    - docs/skills/dev-runtime-profile/SKILL.md
    - docs/skills/security-checklist/SKILL.md
  not_using:
    - frontend: servico sem UI
```

## Fronteiras E Seguranca

- credencial isolada por `client_id`, `owner_identity_id` e provider;
- AES-256-GCM, nonce unico, AAD com tenant/owner/provider/id e key version;
- chave e prompt write-only; plaintext existe apenas em memoria durante adapter;
- provider vem de catalogo fechado; URL nunca vem do usuario;
- output externo e dado nao confiavel e nunca e executado diretamente;
- executor envia system prompt versionado e input separado para Responses API
  (OpenAI, `store:false`) ou Messages API (Anthropic);
- cada versao declara `response_mode`: `text` retorna texto efemero;
  `json_schema` exige schema e valida localmente com Ajv draft-07;
- limites iniciais: input 64 KiB, output 4096 tokens, timeout 60s, duas chamadas
  concorrentes e vinte tentativas/24h por tenant+owner; reserva transacional
  compartilhada entre replicas no PostgreSQL;
- idempotencia vincula todo o comando (owner, agente, modulo, origem e input);
  falha/timeout nunca dispara retry automatico de inferencia paga;
- custo desconhecido e `NULL`; tokens sao os informados pelo SDK, sem estimativa
  por tamanho do texto;
- logs/auditoria nao recebem API key, prompt, input ou output integral;
- providers simulados sao proibidos no catalogo, banco, UI e runtime;
- mocks sao permitidos somente em testes unitarios e nao contam como evidencia
  de integracao;
- `openai` e o primeiro provider habilitado por default, confirmado em
  2026-10-15; usa SDK oficial, modelos da conta e Responses API. Sem login
  ChatGPT no adapter BYOK. Para o produto, `chatgpt_plan` e a modalidade
  primaria obrigatoria e `api_key` e opcional; OAuth/plan usage usa cofre e
  adapter de autenticacao separados, sem fallback automatico, e permanece
  bloqueado ate aprovacao comercial e contrato oficial.
- conexao ChatGPT Plan e isolada por tenant e identidade designada. Em
  desenvolvimento o operador usa sua propria conta; em producao cada cliente
  designa e autoriza uma identidade responsavel. Grant revogado/invalido pausa
  automacoes e nunca migra silenciosamente para API key.
- prompt descreve o objetivo e pode selecionar/sequenciar somente function tools
  do manifest versionado do agente. Gateway valida schema estrito; owner do
  dominio reautoriza e executa. Output do modelo nunca e autoridade.
- interacao manual usa JWT de usuario e devolve output somente na resposta;
  replay consulta o ledger sem repetir inferencia e nao recupera conteudo.
- execucao s2s exige JWT curto emitido pelo Identity para
  `aud=svc:ai-gateway`, `typ=service_access` e caller allowlisted; segredo
  bearer estatico nao e aceito.
- registry fechado resolve metadados e execucao por provider; sem fallback
  silencioso. Erro OpenAI 403 indica permissao insuficiente e nao invalida chave.
- agente tem `execution_mode` imutavel: `api` (BYOK, acima) ou
  `claude_routine` (decisao humana de 2026-10-15). Rotina nao chama modelo:
  guarda URL `https://api.anthropic.com/v1/claude_code/routines/trig_*/fire`
  (padrao fixo, nunca outro host) e token `sk-ant-oat01-*` cifrado com o
  mesmo cofre das credenciais (AAD com agent, tenant, owner e provider
  `claude_routine`); so `last4` sai do servico. Sem credencial, modelo,
  schema ou tools.
- disparo de rotina envia so pares escalares do input em texto (`run_id`,
  `board_id`, `card_id`, `trigger`), ate 4 KiB; snapshot e objetos aninhados
  nunca saem. Ledger `dispatched` com `external_session_url`. O fire nao e
  idempotente: so 429/503 devolvem `retryAfterSeconds`; 500/rede/resposta
  inesperada ficam `routine_dispatch_ambiguous`. Interacao manual com rotina e
  recusada (`ai_agent_mode_not_interactive`).
- nome de agente e unico por owner e modulo inclusive entre inativos; colisao
  responde `409 ai_agent_name_taken`.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:ai-gateway`
  - purpose: desenvolver e validar a API de credenciais/agentes contra adapters reais usados em producao.
  - containers:
    - required: `postgres`, `jboot`.
    - optional: `otel-collector`.
    - forbidden_by_default: `mongodb`, `valkey`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `gotenberg`, `jboot-fiscal`.
  - app_processes:
    - required: `ai-gateway-api`.
  - optional: `identity-api` para smoke de JWT de usuario; egress Anthropic/OpenAI
    somente quando o teste de integracao for explicitamente habilitado. Modo
    rotina exige egress para `api.anthropic.com` e conector Flow publico.
    - forbidden_by_default: frontends e workers nao relacionados.
  - ports: `8050`.
  - healthchecks: `GET /health`, `GET /ready`.
  - seed_dependencies: banco `jboot_ai_gateway`, migrations `075_ai_gateway_anthropic_catalog.sql`, `076_ai_gateway_openai_catalog.sql`, `077_ai_gateway_interactions.sql` e `083_ai_gateway_routine_agents.sql`, capability interna `ai-gateway` e scope `ai:execute` no entitlement Flow; o gateway continua capability interna, nao application Identity.
  - expected_resource_profile: baixo; uma API NestJS e PostgreSQL, sem broker.

### Rules

- testes, lint, type-check e build somente dentro do container `jboot`;
- `code-down:ai-gateway` encerra o processo e remove logs temporarios;
- testes de integracao externos sao opt-in para controlar custo e evitar uso
  acidental de credencial; o adapter real e parte obrigatoria do runtime.
- `AI_GATEWAY_EXECUTION_ENABLED=false` e kill switch padrao;
- `AI_GATEWAY_ENABLED_PROVIDERS=openai` e o default; cada ambiente habilita
  providers explicitamente.
- `AI_GATEWAY_SERVICE_AUDIENCE=svc:ai-gateway` e
  `AI_GATEWAY_CALLER_ALLOWLIST=platform-api` protegem chamadas s2s.
  `AI_GATEWAY_ANTHROPIC_ALLOWED_MODELS` recebe IDs separados por virgula. A
  promocao exige aprovacao de dados e allowlist explicita antes de habilitar.
- `AI_GATEWAY_OPENAI_ALLOWED_MODELS` recebe IDs OpenAI aprovados separados por
  virgula; consulta do catalogo nao executa inferencia nem prova saldo/quota ou
  suporte a JSON Schema por todo modelo listado.

## Bloqueios De Producao

- aprovacao da OpenAI para ChatGPT Plan em aplicacao comercial hospedada,
  incluindo automacao server-side, client ID, scopes e callbacks;
- smoke externo OpenAI e, no incremento seguinte, Anthropic;
- allowlists de modelo por modo de resposta e contratos oficiais;
- politica de dados/DPA e residencia;
- KMS/secret manager produtivo e processo de rotacao;
- quotas, custos, circuit breaker e observabilidade produtiva;
- Architecture Graph registry/gate ainda indisponivel.
- modo `claude_routine`: smoke com rotina real (conector publico HTTPS),
  confirmacao de uso comercial com a Anthropic e verificacao se a rotina exige
  repositorio GitHub.
