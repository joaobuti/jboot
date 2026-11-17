# Runbook — Conector Claude Do Flow

Plano e decisoes: `docs/product/kanban-claude-connector-sprints.md`.
Contrato HTTP: `docs/api/kanban-claude-connector-openapi.yaml` e, para agentes
em modo rotina, `docs/api/kanban-sprint-10-12-openapi.yaml`.

## O Que E

O usuario usa a propria assinatura Claude (Free/Pro/Max/Team/Enterprise) e
adiciona o Flow como conector MCP no Claude. A conversa acontece no Claude; o
Claude le quadros/cards e grava comentarios no Flow pelas tools. O JBoot nunca
recebe nem guarda credencial ou token do Claude.ai.

| Peca | Onde | Papel |
|---|---|---|
| Authorization server OAuth 2.1 | `bff-jboot-identity` (`src/oauth`) | CIMD, PKCE S256, codigo, tokens opacos, revogacao, introspeccao |
| Resource server MCP | `bff-jboot-platform` (`src/modules/kanban/claude-connector`) | `/kanban/mcp`, tools, mascaramento, auditoria |
| Consentimento e configuracao | `app-jboot-next-platform` | `/oauth/consentimento`, `Configuracoes -> IA -> Conector Claude` |
| Retorno pos-login | `app-jboot-identity-admin` | `?returnTo=` aceito so para o consentimento da Platform Web |

## Variaveis

| Variavel | Servico | Dev (compose) | Producao |
|---|---|---|---|
| `JBOOT_IDENTITY_OAUTH_ISSUER_URL` | Identity, BFF | `http://localhost:${JBOOT_API_PORT}` | `https://auth.jboot.com.br` |
| `JBOOT_IDENTITY_OAUTH_CONSENT_URL` | Identity | `http://localhost:${JBOOT_PLATFORM_WEB_PORT}/oauth/consentimento` | `https://app.jboot.com.br/oauth/consentimento` |
| `JBOOT_FLOW_CONNECTOR_RESOURCE_URL` | Identity, BFF | `http://localhost:${JBOOT_PDV_API_PORT}/kanban/mcp` | `https://apinode.jboot.com.br/kanban/mcp` |
| `JBOOT_IDENTITY_OAUTH_CIMD_ALLOWED_HOSTS` | Identity | `claude.ai` | `claude.ai` |
| `JBOOT_IDENTITY_OAUTH_ALLOWED_REDIRECT_URIS` | Identity | claude.ai callback + loopback | idem |
| `JBOOT_PLATFORM_SERVICE_CLIENT_SECRET` / `JBOOT_IDENTITY_PLATFORM_SERVICE_CLIENT_SECRET` | BFF / Identity | ja existentes | ja existentes |

`JBOOT_FLOW_CONNECTOR_RESOURCE_URL` precisa ser identica nos dois servicos e
igual a URL que o usuario cola no Claude: e o `resource` dos tokens.

## Producao: Pre-Requisitos

1. Migrations `081_identity_oauth_connector.sql` (jboot_identity) e
   `082_kanban_claude_connector.sql` (banco Kanban de cada tenant).
2. `https://auth.../.well-known/oauth-authorization-server`, `/oauth/*` e
   `https://apinode.../kanban/mcp` + `/.well-known/oauth-protected-resource*`
   alcancaveis a partir do egress Anthropic `160.79.104.0/21` (sem WAF/challenge).
3. Proxy reverso nao pode bufferizar nem segurar `/oauth/token` (limite do Claude:
   10 s no codigo, 30 s no refresh).
4. Limite por IP dos handlers OAuth: todo trafego do Claude sai das mesmas faixas;
   os limites ficaram altos (600/3000 por 15 min). Configurar `trust proxy` do
   Express se o proxy repassar `X-Forwarded-For`, para nao contar o proxy como IP unico.
5. Gestor de cada tenant liga o conector em `Configuracoes -> IA -> Conector Claude`
   e registra a ciencia da politica de dados.

## Testar Em Dev Com O Claude Code (Sem Tunel)

O Claude Code alcanca `localhost` e usa o proprio CIMD
(`https://claude.ai/oauth/claude-code-client-metadata`) com redirect loopback.

```bash
make code-up TARGET=kanban
claude mcp add --transport http jboot-flow http://localhost:8010/kanban/mcp
```

Em uma sessao interativa do Claude Code, rode `/mcp`, escolha `jboot-flow` e
autentique: o navegador abre o consentimento do Flow (login do JBoot se preciso).
Peca, por exemplo: "liste meus quadros do Flow e comente no card X que a
documentacao esta completa". O comentario aparece no historico com o selo
"via Claude". Para remover: `claude mcp remove jboot-flow`.

## Testar No Claude.ai (Site/Desktop/Celular)

O Claude.ai so alcanca URL publica HTTPS. Em homologacao, use os dominios
publicos; para teste pontual de dev, um tunel temporario (ex.: `cloudflared
tunnel --url http://localhost:8010` para o BFF e outro para o Identity) e
ajuste as tres URLs acima para os enderecos do tunel antes de subir os servicos.
Desligue o tunel ao terminar. Depois: Claude -> Configuracoes -> Conectores ->
Adicionar conector personalizado -> URL do MCP.

Pendente de validacao real: o host do documento CIMD usado pelo Claude
hospedado. A allowlist aceita `claude.ai`; se o consentimento nao abrir e o log
do Identity mostrar `CIMD fetch failed for host <outro>`, avaliar o host e so
entao inclui-lo em `JBOOT_IDENTITY_OAUTH_CIMD_ALLOWED_HOSTS`.

## Automacao Por Rotina (Sprint 12, `claude_routine`)

Card entra/sai de coluna -> regra "Executar agente" -> outbox do Kanban ->
`svc-jboot-ai-gateway` dispara a rotina do Claude Code do dono do agente ->
a rotina roda na assinatura dele, le o card e registra seus resultados.
Desde 2026-10-21, somente `flow_complete_automation`, com confirmacao integral
explicita, conclui o run; comentario com `run_id` nao o conclui. O gateway nao
chama modelo nem envia conteudo do card: o disparo contem IDs, gatilho e
instrucoes do protocolo de conclusao (`docs/runbooks/flow-ai-completion.md`).

Pre-requisitos:

1. Conector publico em HTTPS e ligado no tenant (secoes acima): a rotina roda na
   nuvem da Anthropic e nao alcanca `localhost`.
2. Migrations `083_ai_gateway_routine_agents.sql` (banco do gateway) e
   `084_kanban_ai_routine_dispatch.sql` (banco Kanban de cada tenant).
3. Gateway com `AI_GATEWAY_EXECUTION_ENABLED=true` e egress HTTPS para
   `api.anthropic.com`; BFF com `JBOOT_AI_GATEWAY_SERVICE_URL`.
4. Ordem de deploy: BFF (worker da fila) antes de qualquer regra
   `claude_routine`. Worker antigo que consumir a fila compartilhada marca a
   linha como `ai_action_policy_mismatch` e o outbox de IA nao tem
   reprocessamento: esse disparo se perde e o card precisa ser movido de novo.

Configuracao pelo usuario (conta Pro/Max/Team/Enterprise):

1. Em claude.ai/code -> Routines, criar a rotina e adicionar o conector do Flow.
   Usar como prompt o modelo de `Configuracoes -> IA -> Agentes -> Novo agente
   -> Assinatura Claude (rotina) -> Instrucoes -> Copiar` e completar a tarefa.
2. Adicionar gatilho de API, copiar a URL `.../routines/trig_.../fire` e gerar o
   token `sk-ant-oat01-...` (exibido uma vez).
3. No Flow, salvar o agente em modo rotina com URL e token; o token fica
   cifrado e so os 4 ultimos caracteres aparecem.
4. Na automacao da coluna: acao "Executar agente" com esse agente.

Pendente de validacao real: se a criacao da rotina exige repositorio GitHub
conectado e o comportamento da rotina com o conector (`routine-fire-payload`).

Limites da Anthropic: 30 disparos/h por rotina e 100/h por conta. O disparo nao
e idempotente: 429/503 reagendam (ate 5 tentativas, respeitando
`Retry-After`); 500/timeout ficam `routine_dispatch_ambiguous` e nao reenviam,
porque a rotina pode ter rodado.

## Validacao De Cadastro (ADR 017 e 018)

Botao "Validar dados" do cliente -> rotina Claude da **conta do escritorio** do
cliente (ou da conta principal, quando o escritorio nao tem rotina propria) ->
tools `flow_get_customer_validation_request`, `flow_get_customer_document` e
`flow_submit_customer_validation` -> parecer na ficha -> confirmacao humana por
quem tem "Aprovar parecer da validacao" (`flow:validation:approve`).

Uma vez por empresa:

1. Gestor liga o conector e "Permitir que o Claude leia os documentos da ficha"
   (aceite proprio) em Configuracoes -> IA -> Conector Claude.
2. Conta principal (reserva): com a conta principal, criar a rotina com o prompt
   de Configuracoes -> IA -> Validacao de cadastro (conector do Flow incluido,
   gatilho de API, sem repositorio), cadastrar o agente em modo rotina e escolhe-lo
   em "Conta principal".

Para cada escritorio:

1. Em Escritorios -> Usuarios, marcar o **responsavel** do escritorio (pode haver
   mais de um).
2. Na conta Claude do escritorio, adicionar o conector do Flow e autoriza-lo
   entrando no Flow **com o usuario responsavel**.
3. Na mesma conta, criar a rotina com o mesmo prompt, conector do Flow e gatilho
   de API; copiar URL e token.
4. O `flow:admin` cadastra o agente de rotina com essa URL e token
   (IA -> Agentes) e o escolhe na linha do escritorio em
   IA -> Validacao de cadastro -> "Contas Claude dos escritorios".

Cliente com varios escritorios: quem valida escolhe o escritorio na etapa
Validacao. So um responsavel do escritorio escolhido consegue registrar o
parecer; o dono do agente nao responde por escritorio.

Diagnostico: run `failed` com `validation_agent_not_routine` (agente por chave de
API), `ai_execution_not_enabled` (gateway desligado), `routine_*` (rotina);
`expired` com `routine_not_reached` quando a rotina nao leu o pedido em 5 minutos
(tunel caido, conector antigo na rotina, autorizacao revogada ou conector
autorizado com um usuario que nao e responsavel do escritorio: a tool responde
`not_found`); `expired` com `routine_no_answer` quando a rotina leu o pedido e
ficou 15 minutos sem chamar o conector. Nos dois casos o botao Validar libera
sozinho.

## Analise De Acoes (Automacao Da Conta Principal, ADR 018)

A coluna (ex.: "Analise de Acoes") usa a acao "Executar agente" com o agente de
rotina da conta principal; a regra precisa ser criada logado com o usuario da
conta principal (a rotina disparada e a de quem criou a regra). No prompt da
rotina, para ler o cliente do card:

- `flow_get_card_customer` com o `run_id`: ficha, parecer aprovado e documentos
  validados;
- `flow_get_card_customer_document` com `run_id`, `documentType` (ex.:
  `extrato_beneficio`) e `page`: pagina do documento como imagem.

So funcionam para cliente com validacao aprovada por uma pessoa
(`customer_not_validated`) e card com cliente vinculado
(`card_without_customer`).

## Diagnostico

| Sintoma | Causa provavel | Acao |
|---|---|---|
| Claude: "Couldn't reach the MCP server" | MCP sem `401`/metadata ou bloqueado por rede | `curl -i -X POST <mcp>` deve dar `401` com `WWW-Authenticate: Bearer resource_metadata=...`; checar egress Anthropic |
| Consentimento nao abre (`invalid_client`) | `client_id` fora da allowlist CIMD ou documento invalido | log `CimdClientResolver` no Identity |
| `invalid_target` no redirect | URL colada no Claude diferente de `JBOOT_FLOW_CONNECTOR_RESOURCE_URL` | alinhar a URL exata (com path) |
| Tool responde `claude_connector_disabled` | tenant nao ligou o conector | gestor liga em Configuracoes -> IA -> Conector Claude |
| `503 temporarily_unavailable` no MCP | BFF nao alcanca o Identity ou segredo s2s ausente | `JBOOT_IDENTITY_SERVICE_URL`, `JBOOT_PLATFORM_SERVICE_CLIENT_SECRET` |
| Run `failed` com `routine_token_invalid` / `routine_not_found` | token regenerado ou rotina/gatilho removido | atualizar URL/token no agente |
| Run `failed` com `routine_rate_limited` apos 5 tentativas | limite horario da rotina/conta | reduzir regras ou dividir em rotinas |
| Run fica `dispatched` | rotina nao confirmou todas as tarefas por `flow_complete_automation` | revisar as pendencias e o prompt conforme `flow-ai-completion.md` |
| Usuario precisa reconectar | refresh/codigo reapresentado (revogacao por reuso), entitlement Flow removido ou revogacao manual | `audit_events` do Identity: `oauth_grant_revoked` com `reason` |

## Revogacao E Auditoria

- Usuario: `Configuracoes -> IA -> Conector Claude -> Minhas conexoes -> Revogar`.
  A proxima chamada do Claude recebe `401` (introspeccao sem cache).
- Remover o entitlement Flow do usuario no Identity encerra a conexao na proxima
  chamada ou refresh (`reason = entitlement`).
- Identity: `audit_events` `oauth_grant_created`, `oauth_consent_denied`,
  `oauth_grant_revoked` (sem tokens).
- Kanban: `kanban_audit_events` `claude_connector.tool_called` (tool, grant,
  card, resultado; sem conteudo) e `claude_connector.settings_updated`.
