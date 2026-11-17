# Conector Claude Do Flow — Uso Da Assinatura Claude Pro

## Estado

```yaml
status: implemented_pending_external_smoke
review_date: 2026-10-16
branch: feature/flow-claude-connector
path_decision: confirmed_by_human_2026-10-15
architecture_decision: recommendations_approved_2026-10-15  # "pode implementar" apos as recomendacoes
lifecycle_status: functional  # nao production_ready: falta smoke com conta Claude real
blocking_status:
  - external_smoke_with_real_claude_account_pending   # exige URL publica HTTPS
  - client_validation_of_chat_in_claude_experience_pending
  - hosted_claude_cimd_host_unverified                # allowlist = claude.ai
  - routine_smoke_with_real_routine_pending           # exige conector publico HTTPS
  - commercial_use_confirmation_with_anthropic_pending
```

Decisoes da secao `Perguntas Abertas` foram aprovadas pelo usuario em
2026-10-15 ("pode implementar" sobre as recomendacoes). A escolha concreta do
authorization server foi tomada na implementacao (ver `Decisoes De
Implementacao`) e deve ser ratificada.

## Por Que O Plano Anterior Estava Errado

O pedido do cliente e usar a **conta Claude Pro dele**. O plano anterior
(`kanban-sprints.md`, Sprint 11, e `kanban-ai-providers-replan.md`) entregava
outra coisa:

1. Integrou o Claude por **chave de API do Claude Console** (BYOK no
   `svc-jboot-ai-gateway`). Essa chave e cobrada por token, em conta separada;
   a assinatura Pro nao inclui acesso a API e nao e consumida por ela.
2. Interpretou "Cloud" como provedor de nuvem e abriu a pergunta "Claude API
   direta, Amazon Bedrock ou Google Vertex". Era transcricao de "Claude"; a
   pergunta nao se aplica ao pedido.
3. Marcou "assinatura Claude.ai" como fora de escopo sem registrar o motivo
   nem oferecer alternativa, deixando o pedido real do cliente sem resposta.

## Restricoes Oficiais Verificadas (2026-10-15)

Fontes:

- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/agent-sdk/overview
- https://claude.com/docs/connectors/building/authentication
- https://claude.com/docs/connectors/custom/add-unlisted

Fatos que restringem a solucao:

- A Anthropic **nao permite** que terceiros ofereçam login Claude.ai em seus
  apps, nem roteiem requisicoes pelas credenciais Free/Pro/Max dos usuarios,
  nem coletem, guardem ou intermedeiem credenciais ou tokens de sessao do
  Claude.ai. Isso vale tambem para apps feitos com o Agent SDK.
- Nao existe programa publico "Sign in with Claude" para apps de terceiros
  (diferente do programa da OpenAI tratado em `chatgpt-plan-usage-sprints.md`).
- Limites do Pro pressupoem uso individual comum; automacao em segundo plano
  pela assinatura nao e caso suportado.
- Conectores MCP remotos ("custom connector" por URL) estao disponiveis nos
  planos Free (1 conector), Pro, Max, Team e Enterprise, no claude.ai web,
  Desktop, mobile e Claude Code. O uso do modelo sai da assinatura do usuario.

Consequencia: **nao ha caminho permitido para o JBoot enviar ao Pro um prompt
digitado em tela do JBoot.** O uso do Pro acontece com o usuario no Claude e o
Flow exposto como conector; o resultado volta ao Flow por tools.

## Alternativas Avaliadas

| Alternativa | Usa o Pro | Prompt digitado no JBoot | Permitido | Decisao |
|---|---|---|---|---|
| Chave de API no gateway (BYOK, ja implementada) | nao | sim | sim | mantida para quem aceitar cobranca por token; nao atende este cliente |
| Conector MCP remoto do Flow | sim | nao, digitado no Claude | sim | **escolhida** |
| Claude Code hospedado por usuario (binario sem modificacao, login do proprio usuario) | sim | sim | condicional: Termos Comerciais, sem intermediar uso, enquadramento a confirmar com a Anthropic | rejeitada nesta fase: zona cinzenta, sandbox por usuario, so uso interativo |
| Login Claude.ai, token `setup-token`/OAuth do Claude Code colado no JBoot | sim | sim | **nao** | proibida |
| Automacao de navegador sobre o claude.ai | sim | sim | **nao** | proibida |

## Decisao Humana Registrada

```yaml
date: 2026-10-15
claude_subscription_path: mcp_connector
api_key_path: kept_in_svc-jboot-ai-gateway
client_requires_pro: true
client_accepts_api_billing: false
consequence: >
  para este cliente, o prompt e digitado no Claude (web, Desktop, mobile ou
  Claude Code) com o conector do Flow ativo; o retorno e gravado no card do
  Flow. Nao havera tela de chat no JBoot consumindo o Pro.
```

Pendente de comunicacao ao cliente: a mudanca de "digitar no sistema" para
"digitar no Claude com o Flow conectado" altera a experiencia contratada e
deve ser validada com ele antes da Sprint C2.

## PO Scope

```yaml
objective: >
  usuario do Flow com assinatura Claude conecta o Flow ao proprio Claude e,
  pelo Claude, consulta cards e grava no card o resultado gerado
users_roles:
  - flow_user_with_active_membership: conecta, usa e revoga a propria conexao
  - tenant_manager: habilita/desabilita o conector para o tenant e aceita a politica de dados
in_scope_initial:
  - conector desligado por default; habilitacao explicita por tenant
  - conexao OAuth iniciada no Claude, com login e consentimento em tela do JBoot
  - tools de leitura: listar boards, buscar cards, ler card
  - tool de escrita unica: comentar no card com origem identificada
  - Configuracoes -> Claude no Flow: URL do conector, instrucoes, conexoes ativas, revogar
  - auditoria por chamada de tool sem conteudo integral
out_of_scope_initial:
  - mover card, editar campos, aprovar/excluir qualquer coisa
  - conteudo binario de anexos e documentos
  - automacoes sem usuario presente (Sprint 12 segue pelo gateway com API key)
  - chat dentro do JBoot consumindo o Pro
  - listagem no Connectors Directory da Anthropic
```

### Criterios De Aceite

- O usuario adiciona o conector no Claude pela URL publicada, faz login no
  JBoot, consente e o Claude lista as tools do Flow.
- O token emitido vale somente para o recurso do conector (audience = URL do
  MCP), carrega tenant, identidade, `application_slug = flow` e scopes do
  conector; nao e aceito pelas rotas REST do BFF nem por outro modulo.
- Toda tool reaplica a policy existente do Kanban (membresia ativa, ACL por
  coluna/perfil, visibilidade por escritorio). O conector nunca ve mais do que
  a tela mostraria ao mesmo usuario.
- Entitlement `flow` e habilitacao do tenant sao verificados a cada chamada,
  nao apenas na emissao do token.
- Tenant com conector desligado recebe erro estruturado; revogacao no JBoot
  invalida refresh token e faz a proxima chamada falhar com `401`.
- Comentario gravado tem autor = usuario conectado e origem
  `claude_connector`, visivel no feed do card.
- Logs, traces, metricas e auditoria nao contem token, codigo OAuth nem
  conteudo integral de card ou comentario.
- E2E real com conta Claude Pro adicionando o custom connector; respostas reais
  capturadas e anonimizadas servem de fixture. Mock ou fixture escrita a mao
  nao conta como evidencia.

## PE Decision

```yaml
execution_mode: cross_project
delivery_type: external_agent_connector
target_projects:
  - implementations/bff-jboot-identity          # authorization server OAuth 2.1
  - implementations/bff-jboot-platform          # MCP resource server + tools
  - implementations/app-jboot-next-platform     # consentimento + Configuracoes -> Claude
target_module: modules/kanban
not_affected:
  - implementations/svc-jboot-ai-gateway        # conector nao chama provider; nao usa BYOK
sprint_artifact: docs/product/kanban-claude-connector-sprints.md
sprint_gate: docs/product/kanban-claude-connector-sprints.md#gate-de-liberacao
architect_required: true
human_confirmation:
  path: confirmed_2026-10-15
  architecture: pending
```

## Deployment Boundary Gate

| Componente | Classificacao | Host | Motivo |
|---|---|---|---|
| MCP resource server e tools | `embedded_module` | `bff-jboot-platform/modules/kanban` | tools sao um novo adaptador de transporte sobre os services do Kanban, como um controller; servico separado duplicaria policy, auth e acesso a dados |
| Authorization server OAuth | `embedded_module` | `bff-jboot-identity` | Identity ja e dono de login, JWT, entitlements e revogacao; um segundo plano de identidade fragmentaria o controle |
| Consentimento e configuracao | `embedded_module` | `app-jboot-next-platform` | herda Next.js, preset e login existentes |

Stack Fit Gate: `not_applicable` — todos os componentes herdam o host
(TypeScript/NestJS e Next.js). MCP usa o SDK oficial TypeScript do Model
Context Protocol, transporte Streamable HTTP.

Alternativa que o Architect deve comparar antes de confirmar: authorization
server pronto (ex.: Ory Hydra, Keycloak) delegando login/consentimento ao
Identity. Ganha maturidade de protocolo; custa novo runtime operado. Se o AS
for implementado no Identity, usar biblioteca madura e verificar suporte a
CIMD antes de decidir; nao escrever OAuth do zero.

## Arquitetura

```text
Claude (claude.ai / Desktop / mobile / Claude Code)
  -- MCP Streamable HTTP + Bearer --> apinode.jboot.com.br/kanban/mcp   (resource server)
       sem token: 401 + WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"
  -- descoberta --> auth.jboot.com.br/.well-known/oauth-authorization-server
  -- /oauth/authorize --> login + consentimento em app.jboot.com.br
  -- /oauth/token (code + PKCE, refresh com rotacao) --> auth.jboot.com.br
  tools --> services do Kanban (mesma policy da UI) --> Postgres do tenant
```

Requisitos do cliente OAuth do Claude (fonte oficial acima):

- `401` obrigatorio para iniciar sign-in; Claude ignora `WWW-Authenticate` em
  `200`.
- Protected resource metadata (RFC 9728): `resource` igual a URL exata do MCP;
  primeira entrada de `authorization_servers` = issuer do Identity (as demais
  sao ignoradas).
- Authorization server metadata (RFC 8414) em `/.well-known/`.
- Registro do cliente: **CIMD** (recomendado; anunciar
  `client_id_metadata_document_supported: true` e `none` em
  `token_endpoint_auth_methods_supported`). DCR apenas se houver motivo; ele
  cria um cliente por conexao.
- PKCE `S256` obrigatorio e anunciado em `code_challenge_methods_supported`.
- Redirect URIs: `https://claude.ai/api/mcp/auth_callback` e loopback
  `http://localhost/callback` / `http://127.0.0.1/callback` com porta ignorada
  (Claude Code). Tela de consentimento mostra o hostname do redirect e aviso
  extra para loopback.
- `/oauth/token` aceita `application/x-www-form-urlencoded`; refresh invalido
  responde `invalid_grant`; refresh token rotacionado na mesma resposta.
- Latencia: discovery/registro/token < 10 s, refresh < 30 s.
- Sem `client_credentials`: todo token tem usuario no loop.
- Rede: MCP e endpoints OAuth alcancaveis a partir de `160.79.104.0/21`
  (egress Anthropic); revisar WAF/proxy do Configr.

### Tools Iniciais

| Tool | Efeito | Anotacao MCP | Regra |
|---|---|---|---|
| `flow_list_boards` | leitura | `readOnlyHint` | somente boards com membresia ativa |
| `flow_search_cards` | leitura | `readOnlyHint` | paginada, limite fixo, filtra por ACL/escritorio |
| `flow_get_card` | leitura | `readOnlyHint` | campos, status do checklist e ultimas N atividades; sem binario |
| `flow_add_card_comment` | escrita | nao destrutiva | `CardActivity` tipo `comment`, origem `claude_connector`, tamanho maximo, idempotencia |

Conteudo de card e dado nao confiavel para o Claude (prompt injection). A
unica escrita e comentario; a confirmacao de tool no cliente Claude nao
substitui a autorizacao no servidor. Rate limit por token e por tenant.

### Politica De Dados

Com o Pro, o conteudo lido pelas tools vai para a conta **pessoal** do usuario
na Anthropic, sob os Termos de Consumidor (configuracao de treinamento depende
da conta dele). Planos Team/Enterprise ficam sob Termos Comerciais. Por isso:

- o conector nasce desligado e o manager do tenant aceita a politica ao ligar;
- a decisao sobre mascarar PII (CPF, telefone, e-mail de cliente final) nas
  respostas das tools e bloqueante antes de dados reais.

## Sprints

### Sprint C0 — Correcao Do Planejamento

Estado: `concluida` (2026-10-15).

### Sprint C1 — Authorization Server OAuth 2.1 No Identity

Estado: `concluida` (2026-10-15; codigo, testes unitarios e de integracao
PostgreSQL/Valkey).

- metadata RFC 8414, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`;
- CIMD, PKCE S256, redirect allowlist (claude.ai + loopback), `state` de uso
  unico com TTL;
- consentimento em `app-jboot-next-platform` reaproveitando o login existente;
- tokens com audience do recurso, scopes `flow:connector:read` e
  `flow:connector:comment`, refresh cifrado com rotacao e deteccao de reuso;
- registro de conexoes por usuario/tenant e revogacao.

Aceite: testes de PKCE ausente/errado, redirect fora da allowlist, `state`
reutilizado/expirado, refresh reutilizado, audience errada, tenant/usuario
cruzados e revogacao; nenhum segredo em log; build/test no container.

### Sprint C2 — MCP Resource Server E Tools De Leitura

Estado: `concluida` (2026-10-15).

- endpoint Streamable HTTP em `bff-jboot-platform`, protected resource metadata;
- habilitacao do conector por tenant (default desligado);
- tools de leitura reutilizando services/policies do Kanban;
- auditoria por chamada e rate limit.

Aceite: matriz de visibilidade igual a da UI (membro inativo, coluna sem
permissao, outro escritorio, outro tenant); tenant desligado; token de REST
recusado no MCP e vice-versa; teste com custom connector real em conta Pro.

### Sprint C3 — Comentario, Configuracao E E2E

Estado: `em andamento` — codigo, telas, testes, build e E2E local concluidos;
falta o smoke com conta Claude real (Claude Code local ou claude.ai via URL
publica), conforme `docs/runbooks/flow-claude-connector.md`.

- `flow_add_card_comment` com origem `claude_connector` e idempotencia;
- `Configuracoes -> Claude` no Flow: URL, passo a passo, conexoes do usuario,
  revogar; manager liga/desliga e aceita politica;
- E2E real: adicionar conector, consentir, pedir analise de um card no Claude,
  comentario aparece no feed; revogar e ver a proxima chamada falhar.

Aceite: type-check/build frontend e backend no container, API Graph gate,
security review e `make ai-conformance` aprovados.

### Continuacao — Automacao Por Rotina (Sprint 12)

Estado: `em andamento` — codigo, testes e E2E local concluidos; falta o smoke
com rotina real (exige conector publico em HTTPS).

Decisao de 2026-10-15: automacoes do Kanban executam agents em dois modos,
`api_key` (BYOK no gateway, desenho da Sprint 12 em `kanban-sprints.md`) e
`claude_routine` (rotina do Claude Code na conta do usuario, disparada por API
e usando este conector para ler o card e comentar). Em 2026-10-15 a Sprint 12
`api_key` foi entregue em paralelo na base (`1873c4d21`); por decisao humana
("Base deles + portar rotina") o desenho da base foi mantido (outbox
`kanban_ai_automation_outbox`, scheduler, BullMQ, tool calls) e o modo rotina
foi portado sobre ele, descartando a automacao propria deste worktree.

- Agent (`svc-jboot-ai-gateway`): `execution_mode` `api | claude_routine`,
  imutavel. Rotina guarda URL `.../routines/trig_*/fire` e token
  `sk-ant-oat01-*` cifrado como credencial (AAD ligado ao agent e ao dono, so
  `last4` exposto); sem credencial, modelo, schema nem tools. O prompt fica na
  rotina do Claude; o texto salvo no agent e referencia versionada.
- Execucao: modo rotina nao chama modelo. `POST .../fire` com texto de pares
  escalares do input (`run_id`, `board_id`, `card_id`, `trigger`); snapshot do
  card nunca sai do Flow. Ledger com `execution_mode`, status `dispatched` e
  `external_session_url`. Console manual recusa rotina
  (`ai_agent_mode_not_interactive`): uso interativo pela assinatura e o
  proprio conector.
- Outbox (`084`): status `dispatched`, `dispatch_attempt` (1..10) e
  `external_session_url`. Chave de idempotencia
  `kanban-ai-<outbox>:routine:<attempt>`: o endpoint de fire nao e idempotente,
  entao so 429/503 (com `Retry-After`) geram nova tentativa, ate 5; 500/rede
  sao ambiguos e falham sem reenvio.
- Fechamento: `flow_add_card_comment` aceita `runId`; o comentario do mesmo
  dono, no mesmo card, conclui o run `dispatched` (`completeDispatched`).
- Regra de automacao: `actionConfig.connectionMode = 'claude_routine'` exige
  `toolPolicyVersion = 'claude_routine.v1'`; `api_key` segue
  `2026-10-15.v1`.
- Risco de deploy: worker antigo (sem o modo rotina) que consumir a fila
  compartilhada marca a linha como `ai_action_policy_mismatch`, sem
  reprocessamento no outbox de IA. Publicar BFF antes de criar regras
  `claude_routine` (ver runbook).

## Gate De Liberacao

- [x] Arquitetura confirmada (AS no Identity com handlers do SDK MCP; CIMD; tools iniciais).
- [ ] Cliente validou a experiencia "digitar no Claude com o Flow conectado".
- [x] Politica de dados: conector desligado por default, aceite do gestor por tenant, mascaramento de PII ligado por default.
- [x] Branch dedicada (`feature/flow-claude-connector`); contratos do Identity e do modulo atualizados.
- [ ] Endpoints publicos alcancaveis a partir do egress Anthropic (homologacao/producao).
- [ ] E2E com conta Claude real. Fixture real ja usada: documento CIMD do Claude Code capturado em 2026-10-15.
- [x] API Graph sem erro, security review (`docs/security/flow-claude-connector-checklist.md`) e conformance no diff.

## Perguntas Abertas

| # | Pergunta | Decisao (2026-10-15) | Estado |
|---|---|---|---|
| 1 | AS no Identity ou produto pronto (Hydra/Keycloak)? | Identity, com os handlers OAuth do SDK MCP oficial (ver abaixo) | resolvida; ratificar |
| 2 | Registro do cliente: so CIMD ou CIMD + DCR? | So CIMD; sem `registration_endpoint` | resolvida |
| 3 | Mascarar PII nas tools? | Ligado por default; gestor pode desligar | resolvida |
| 4 | Escrita inicial? | So comentario, com origem `claude_connector` | resolvida |
| 5 | Cada usuario precisa da propria assinatura Claude; o cliente sabe? | Comunicar junto com a mudanca de experiencia | aberta (nao bloqueia codigo) |
| 6 | Listar no Connectors Directory? | Depois; inicio como custom connector | adiada |
| 7 | Host do CIMD do Claude hospedado (web/Desktop) | Allowlist `claude.ai`; confirmar no smoke real | aberta |

## Decisoes De Implementacao

- **Authorization server**: `bff-jboot-identity/src/oauth`. Protocolo pelos
  handlers do `@modelcontextprotocol/sdk` 1.32.1 (authorize, token, revoke,
  metadata: PKCE S256, matching de redirect loopback, formato de erro). A
  verificacao de suporte a CIMD em `oidc-provider` nao foi confirmada, entao nao
  foi usado; o SDK nao anuncia CIMD, entao o metadata (RFC 8414) e proprio e a
  resolucao CIMD e feita em `CimdClientResolver` (HTTPS, host allowlisted, sem
  redirect, 16 KiB, `client_id` igual a URL, redirects filtrados por allowlist).
- **Tokens opacos** (256 bits, so hash SHA-256 no banco), access 1 h, refresh 30
  dias com rotacao; reuso de refresh ou de codigo revoga a conexao inteira.
  Opaco de proposito: o guard REST do Kanban valida JWT so por assinatura, entao
  um JWT do conector com o mesmo segredo seria aceito nas rotas REST.
- **Introspeccao s2s sem cache** (`POST /oauth/introspect`, token de servico
  `platform-api` com audience `svc:identity-oauth`): revogacao e remocao de
  entitlement valem na chamada seguinte; o contexto Kanban (tenant, database_ref,
  scopes Flow) vem so da introspeccao.
- **Resource server**: `POST /kanban/mcp` stateless (um `McpServer` por
  requisicao), `401` com `WWW-Authenticate: Bearer resource_metadata=...`,
  metadata RFC 9728 no caminho com sufixo e na raiz.
- **Tools** reutilizam os services do Kanban (mesma policy da UI). Erro de
  dominio vira codigo estavel; auditoria por chamada sem conteudo; reenvio
  identico de comentario em 2 min devolve o mesmo comentario; 120
  requisicoes/min por conexao.
- **Consentimento** na Platform Web (`/oauth/consentimento`), identificando o
  app pelo host do `client_id` (nome do CIMD e autodeclarado) e com alerta para
  redirect loopback. Sem sessao Flow, leva ao login do Identity Admin com
  `returnTo` aceito somente para essa rota.

## UIUX Decision

```yaml
objective: conectar o Claude ao Flow (consentimento) e administrar o conector
target_project: implementations/app-jboot-next-platform
target_module: modules/kanban
scenario_classification:
  settings_page: covered_by_template   # mesmo padrao da tela Google Drive (cards, switches, tabela)
  consent_page: new_pattern_required
template_sources_checked:
  - implementations/app-jboot-next-platform/src/modules/kanban/components/drive/GoogleDriveSettingsPage.tsx
  - implementations/app-jboot-next-platform/src/app/(auth)/login/page.tsx
  - implementations/app-jboot-next-platform/skills/platform-crud-ui.md
flow:
  states:
    empty: sem conexoes -> instrucao para conectar pelo Claude
    loading: spinner centralizado
    error: alerta com "Tentar novamente"; consentimento expirado orienta reconectar no Claude
    success: alerta de confirmacao; consentimento redireciona ao Claude
    permission_denied: usuario sem Flow (403) e sem sessao (pede login)
  information_hierarchy:
    - estado do conector (Ligado/Desligado)
    - URL e passo a passo de conexao
    - politica da empresa (so flow:admin)
    - minhas conexoes e revogacao
  primary_actions: [Copiar URL, Salvar, Revogar, Autorizar]
reused_components: [reactstrap Card/Alert/Badge/Table/Input switch, auth-page-wrapper, NonAuthLayout]
new_components:
  - component: ClaudeConsentPage
    justification: consentimento OAuth nao existe no template; fluxo transacional fora do layout com menu
    classification: excecao_isolada
navigation_impact: Configuracoes -> IA -> Conector Claude (registry module-settings, scope flow:read)
local_agent: implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
local_skill: implementations/app-jboot-next-platform/skills/api-client.md
usability_risks:
  - preloader do template (RightSidebar) intercepta clique em automacao headless; comportamento preexistente, nao alterado
decision_status: applied_pending_human_review
```

## Evidencias (2026-10-16, worktree feature/flow-claude-connector sobre `1873c4d21`)

- Identity: 27 testes + 6 de integracao OAuth (`JBOOT_OAUTH_IT=1`, PostgreSQL e
  Valkey reais): fluxo completo, reuso de refresh/codigo, PKCE/redirect/resource
  invalidos, isolamento entre usuarios/tenants, introspeccao s2s. CIMD validado
  contra o documento real do Claude Code.
- BFF: 589 testes (conector, outbox rotina com PostgreSQL real, processor,
  regras), build e lint.
- AI Gateway: 46 testes (adapter de fire, execucao rotina, agent rotina com
  PostgreSQL real, CHECK com NULL, nome de agent removido devolve 409), lint e
  build.
- Platform Web: 117 testes, type-check, lint e `next build`.
- Identity Admin: 4 testes e type-check; lint sem erro novo.
- E2E local (servicos do worktree em 8100/8110/8150/3102): login real, OAuth com
  o `client_id` CIMD real do Claude Code buscado ao vivo em claude.ai,
  consentimento no navegador, tools via cliente MCP do SDK, comentario com
  origem no banco e selo "via Claude" no historico, token do conector recusado
  no REST, revogacao pela tela derruba a chamada seguinte, refresh
  pos-revogacao `invalid_grant`.
- E2E rotina: card movido -> outbox -> gateway -> `POST` real em
  `api.anthropic.com` com token invalido -> 401 da Anthropic -> outbox `failed`
  (`routine_token_invalid`) e ledger `claude_routine` falho; console manual 400
  `ai_agent_mode_not_interactive` sem linha no ledger. Tela: agent rotina salvo
  pelo formulario (aba Ferramentas oculta, salvar exige token valido) e listado
  no seletor "Executar agente" da automacao.
- `make ai-api-graph-gate` sem erro; avisos aceitos por desenho: fetch dinamico
  do CIMD (`cimd-client.resolver.ts`) e da URL de fire da rotina
  (`claude-routine-fire.adapter.ts`), ambos restritos por allowlist/padrao fixo
  antes do fetch.
- `npm audit --omit=dev`: `fast-uri` trazido pelo SDK corrigido para 3.1.8; demais
  achados identicos a linha de base do checkout principal.

## Architecture Graph

Registrado em `docs/architecture-graph/registry.yaml` (2026-10-16, apos o merge
da Sprint 4 do Architecture Graph), com `make ai-architecture-graph-gate` sem
findings:

- nodes: `capability:flow-claude-connector` (owner kanban),
  `capability:identity-oauth-authorization-server` (owner identity),
  `capability:claude-routine-dispatch` (owner ai-gateway) e
  `external_system:anthropic-claude`;
- edges: kanban `contains` conector; identity `contains` AS; gateway
  `contains` disparo de rotina; conector `depends_on` AS; Claude `consumes`
  conector; AS `integrates_with` Claude; disparo `calls` Claude; kanban
  `depends_on` disparo; conector `evidenced_by` a attestation de 2026-10-16.

## Agent Activation

Exibida na sessao de implementacao somente depois de iniciado o codigo; registro
em `docs/ai-governance/records/non-conformities/2026-10-15-agent-activation-late-claude-connector.md`.

```yaml
using_agent:
  - docs/agents/orchestration/architect.md
  - docs/agents/orchestration/ui-ux.md
  - implementations/bff-jboot-identity/agents/backend-node-typescript.md
  - implementations/bff-jboot-identity/agents/postgres-identity.md
  - implementations/bff-jboot-platform/modules/kanban/agents/kanban-board-domain.md
  - implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
  - implementations/app-jboot-identity-admin/agents/frontend-web.md
  - implementations/svc-jboot-ai-gateway/agents/ai-gateway-backend.md   # modo rotina (Sprint 12)
using_skill:
  - docs/skills/ai-first-governance/SKILL.md
  - docs/skills/security-checklist/SKILL.md
  - docs/skills/dev-runtime-profile/SKILL.md
  - implementations/app-jboot-next-platform/skills/api-client.md
referenced_only:
  - implementations/app-jboot-next-platform/skills/platform-crud-ui.md
not_using: []
```

O agent local `kanban-board-domain` foi atualizado: o conector nao usa `src/ai`
e vive em `src/modules/kanban/claude-connector`.
