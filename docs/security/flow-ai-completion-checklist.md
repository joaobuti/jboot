# Security Review — Flow AI Completion — 2026-10-21

Skill: `docs/skills/security-checklist/SKILL.md`. Escopo: migration 092,
confirmacao MCP/API, movimento automatico e UI de configuracao.

- [x] SQL parametrizado; nenhuma execucao de codigo, URL, shell ou SQL da IA.
- [x] DTOs com UUID e whitelist; destino ativo, do mesmo tenant/quadro e distinto.
- [x] Criacao exige flow:admin/board_admin; executor relê entitlement, membership,
  identidade, application e database_ref ativos sem cache de autoridade.
- [x] Executor reutiliza requireVisibleCard e CardsService.move: transicao, ACL,
  checklist e WIP; WIP revalidado sob lock no commit automatico.
- [x] Modelo nao escolhe coluna/tenant/owner. Destino vem de regra administrativa.
- [x] Confirmacao estruturada estrita; false, status parcial, versao desconhecida,
  campo extra, prose, comentario isolado ou review_required nao concluem.
- [x] MCP exige escopo, conector ativo, card visivel e run dispatched do mesmo
  dono/card/tenant. Comentario com runId nao conclui mais. Reenvio nao cria evento.
- [x] API aceita confirmacao como ultima function tool autorizada; ferramentas
  desconhecidas/argumentos invalidos/falha do provider nao geram conclusao.
- [x] Conclusao e evento de disparo atomicos; receipt de movimento e card atomicos;
  claim token impede worker antigo de concluir e altera posicoes somente em transacao.
- [x] Card ja movido/arquivado ou regra desativada/alterada nao e movido novamente.
- [x] Recuperacao limitada a 100 candidatos/tenant/lote, cinco tentativas, lease
  de cinco minutos e dez saltos. Fonte/dia deduplicados por constraint unica.
- [x] Sem segredo, PII, prompt ou texto da IA no novo outbox/auditoria/evento.
  Dados novos sao IDs, estado, contadores e codigo de falha sanitizado.
- [x] Sem novos endpoints publicos, segredos, dependencias ou SDKs. Auditoria de
  dependencia/TLS/SSRF: N/A, nao ha nova comunicacao externa/provider.
- [x] Frontend usa cliente existente tipado e escaping React; sem HTML livre,
  token novo no localStorage ou autoridade enviada no body.
- [x] Arquivos recuperados continuam dados nao confiaveis; prompt so solicita
  tools allowlisted. Confirmacao nao contorna gates locais nem revisao humana.
- [x] Alteracao aditiva de manifest versionada em 2026-10-21.v1; politicas antigas
  permanecem aceitas para execucao existente. Nova tool exige opt-in do agente.

Evidencia: suites automatizadas, testes reais de PostgreSQL (sucesso, permissao
revogada, WIP/checklist, claim antigo, regra desativada, loop, reentrega,
cross-tenant e recuperacao), testes MCP e eval positivo/negativo de confirmacao.

Limite de confianca: confirmacao e declaracao do modelo, nao verificacao
independente das tarefas do prompt. O contrato do produto preserva todos os
gates deterministas e a aprovacao humana exigida por cada efeito.
