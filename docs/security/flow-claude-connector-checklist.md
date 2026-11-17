# Revisao De Seguranca — Conector Claude Do Flow (2026-10-15)

Skill: `docs/skills/security-checklist/SKILL.md`. Escopo: diff da branch
`feature/flow-claude-connector` (Identity `src/oauth`, BFF
`kanban/claude-connector`, telas de consentimento/configuracao, retorno
pos-login do Identity Admin) e, em 2026-10-16, o modo `claude_routine` da
Sprint 12 (gateway, outbox Kanban, telas de agente e automacao). Nao promove
nada a `production_ready`.

## 1. Injection

- [x] Todo SQL novo e parametrizado (`oauth.repository.ts`,
  `claude-connector-settings.repository.ts`, `findRecentConnectorComment`).
- [x] Nenhuma execucao de comando; output do Claude nao e executado.

## 2. Access Control

- [x] Identidade, tenant e `database_ref` do MCP vem so da introspeccao; o body
  JSON-RPC nunca escolhe tenant/usuario.
- [x] Tools reutilizam `requireMember`/`requireVisibleCard`/`requireRole`:
  conector ve o mesmo que a UI. Dedupe de comentario roda depois de
  `requireVisibleCard` (guard estatico `card-visibility.static.spec.ts`).
- [x] Scopes do conector (`flow:connector:read|comment`) checados por tool,
  alem dos scopes Flow do usuario.
- [x] Token do conector e opaco: nao passa no `KanbanAuthGuard` (que valida JWT
  so por assinatura). Verificado no E2E (REST com token do conector = 401).
- [x] Consentimento, lista e revogacao exigem JWT Flow e destino Flow ativo;
  conexao de outro usuario/tenant responde 404.
- [x] Introspeccao exige token s2s `platform-api` com audience
  `svc:identity-oauth`; outras audiences/usuarios recusados (teste).
- [x] DTOs de saida explicitos (`AuthorizationRequestView`, `GrantView`,
  `ClaudeConnectorSettingsView`, payload das tools).

## 3. Dados Sensiveis

- [x] Codigos, access e refresh tokens: 256 bits de `crypto.randomBytes`, so
  hash SHA-256 persistido; nenhum log/auditoria contem token ou codigo.
- [x] Auditoria de tool sem conteudo (teste verifica as chaves do payload).
- [x] Mascaramento de CPF/CNPJ/e-mail/telefone ligado por default; `sourcePayload`,
  anexos e payload de evento de sistema nunca vao ao Claude.
- [x] Ligar o conector exige aceite registrado do gestor (dados vao para a
  conta Claude pessoal do usuario, sob os termos dela).
- [x] Nenhum segredo novo hardcoded; URLs/allowlists por ambiente.

## 4. Mass Assignment

- [x] DTOs com `class-validator` e `whitelist/forbidNonWhitelisted` globais;
  tools com schemas zod estritos (ids GUID, texto 1..10000, limites de pagina).

## 5. Rate Limiting E Paginacao

- [x] Handlers OAuth do SDK com rate limit por IP (600/3000 por 15 min,
  dimensionado para o egress compartilhado da Anthropic).
- [x] Tools paginadas (`limit` <= 50, quadros <= 100, ultimas 20 atividades).
- [x] Rate limit por conexao no MCP: 120 requisicoes/min por grant, `429` com
  `Retry-After` (`connector-rate-limiter.ts`, por processo; com varias
  instancias o teto efetivo multiplica, registrado em Pendencias De Release).

## 6. SSRF

- [x] Unica URL derivada de input externo: `client_id` CIMD. So HTTPS, host em
  allowlist (`claude.ai`), sem porta/credenciais/fragmento, `redirect: 'error'`,
  timeout 5 s, 16 KiB. Redirect URIs filtrados por allowlist propria.
- [x] Avisos do API Graph em `cimd-client.resolver.ts` e `claude-routine-fire.adapter.ts` (fetch dinamico) sao esperados.

## 7. Dependencias

- [x] `@modelcontextprotocol/sdk` 1.32.1 e `zod` com lockfile.
- [x] `npm audit --omit=dev`: `fast-uri` (via `ajv` do SDK) atualizado para
  3.1.8; os demais achados sao identicos a linha de base do checkout principal
  (nenhum introduzido por este change).

## 8. Stack-specific

- [x] TLS: producao exige HTTPS publico (issuer, MCP, consentimento).
- [x] Frontend: nenhum token novo em `localStorage`; consentimento usa o token
  Flow ja existente em cookie; sem `dangerouslySetInnerHTML`.
- [x] `returnTo` do Identity Admin aceito so para sessao Flow e rota exata de
  consentimento da Platform Web (sem open redirect).
- [x] Consentimento identifica o app pelo host do `client_id` e alerta redirect
  loopback (spec MCP de autorizacao).

## 9. Agentes E GenAI

- [x] Conteudo de card tratado como dado: instrucoes do servidor MCP avisam o
  modelo; a unica escrita e comentario em nome do usuario, revisavel no feed.
- [x] Resposta do Claude nao altera permissao, coluna, status nem documento.
- [x] Nenhuma credencial/sessao do Claude.ai coletada (politica da Anthropic).

## 10. Modo Rotina (`claude_routine`)

- [x] SSRF: URL de fire so aceita `https://api.anthropic.com/v1/claude_code/routines/trig_*/fire`
  (DTO, adapter e CHECK `083` com `COALESCE`, testado com NULL); fetch sem
  seguir redirect.
- [x] Token da rotina e write-only, cifrado AES-256-GCM no cofre de credenciais
  com AAD (agent, tenant, owner, provider `claude_routine`); API, logs e ledger
  expoem so `last4`. Falha de decifragem vira `routine_token_unreadable`.
- [x] Minimizacao: o texto do disparo leva so pares escalares (`run_id`,
  `board_id`, `card_id`, `trigger`), quebras de linha removidas e nomes
  sanitizados; snapshot do card nao sai do Flow. A rotina le o card pelo
  conector com a ACL do dono.
- [x] Confused deputy: `runId` so conclui run `dispatched` do mesmo dono e
  card; outro `runId` e ignorado.
- [x] Retry sem duplicar custo/efeito ambiguo: chave por tentativa, so 429/503
  reagendam (ate 5); 500/rede nao reenviam.
- [x] Console manual recusa rotina (`ai_agent_mode_not_interactive`), sem linha
  no ledger.
- [x] Rolling deploy: worker antigo (codigo fora deste change) marca linhas
  `claude_routine` como `ai_action_policy_mismatch`, sem reprocessamento. Falha
  fechada (nada dispara, nenhum dado sai); mitigacao e a ordem de deploy do
  runbook, acompanhada em Pendencias De Release.

## Pendencias De Release

- Smoke com conta Claude real e confirmacao do host CIMD do Claude hospedado.
- `trust proxy` e WAF liberando `160.79.104.0/21` em producao.
- Rate limit por grant distribuido (hoje por processo).
- Expurgo periodico de `oauth_authorization_requests`/codigos/tokens expirados.
- Smoke com rotina real e confirmacao de uso comercial com a Anthropic.
- Deploy do BFF (worker) antes de liberar regras `claude_routine`; sem isso o
  disparo se perde (`ai_action_policy_mismatch`).
