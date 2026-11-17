# Threat Model — Permissoes, BYOK E Agentes Do Kanban

```yaml
date: 2026-10-15
status: in_progress
scope: module permissions, Flow user provisioning, BYOK credentials, AI agents and automation executions
data_classification: sensitive
source_gate: docs/product/kanban-sprint-10-12-gate.md
```

## Ativos E Autoridades

| Ativo | Autoridade |
|---|---|
| identidade, membership, entitlement e scopes | Identity |
| escritorio e vinculo de usuario Flow | Kanban |
| API key BYOK e prompt versionado | AI Gateway |
| regra, evento, input permitido e efeito | Kanban |
| resposta do provider | dado externo nao confiavel |

## Fronteiras

1. navegador autenticado para Identity/Platform/AI Gateway;
2. Platform BFF para Identity durante provisionamento reconciliavel;
3. Kanban para AI Gateway por token s2s allowlisted;
4. AI Gateway para hosts fixos dos providers;
5. worker/fila contendo apenas IDs, hashes e versoes.

## Ameacas E Controles Planejados

| Ameaca | Controle bloqueante |
|---|---|
| manager altera permissao de outro modulo | application derivada do JWT; catalogo e mutacao filtrados server-side |
| delegado vincula usuario a outro escritorio | escritorios recalculados do ator; payload ignorado; FK composta e testes negativos |
| falha parcial Identity/Flow | command idempotente, estados persistidos, compensacao e reconciliador |
| chave cross-tenant/owner/provider | filtros compostos, AAD criptografica, 404 indistinto e testes concorrentes |
| chave/prompt em resposta ou observabilidade | DTO write-only, redaction, captura de headers/content desligada e canario automatizado |
| troca de ciphertext entre registros | AES-GCM com AAD incluindo tenant, owner, provider e ID |
| servidor vira SSRF/open proxy | adapters fechados, hosts/paths fixos, TLS, sem redirect e sem URL do usuario |
| confused deputy s2s | token curto com audience/scope por caller; gateway revalida tenant, owner, modulo e agente |
| replay duplica custo/efeito | idempotency key unica e outbox duravel ponta a ponta |
| replay manual perde output | conteudo nao e persistido; replay nao reinfere e declara `outputAvailable=false` |
| resposta manual vaza entre usuarios | tenant, owner e modulo derivados somente do JWT; ledger e agente usam filtros compostos |
| prompt injection por card/documento | separacao system/input, delimitacao, schema fechado e nenhuma tool por default |
| resposta hostil altera dominio | output tratado como dado, schema+policy de efeito e revisao humana |
| modelo tenta usar agent apenas pelo nome | execucao usa prompt versionado JBoot; nome nao concede comportamento |
| abuso de quota/custo | limite por owner/tenant/provider, rate limit, budget, circuit breaker e kill switch |
| credencial revogada em job antigo | resolucao e validacao no momento da execucao; segredo nunca na fila |
| provider retorna entrada em erro | corpo externo nunca logado/ecoado; mapeamento para codigo estavel |
| agente de outro modulo aparece no Flow | filtro composto por owner, tenant e `application_slug`; backend nao confia no menu |

## Regras De Dados

- PII/documento e bloqueado por default. Cada input policy declara campos,
  finalidade, base legal, provider, regiao e retencao antes de habilitar.
- Prompt do usuario pode conter propriedade intelectual e recebe protecao
  equivalente a segredo; apenas hash/versao entra em auditoria.
- Nenhuma chave, prompt, input ou output integral entra em log, fila, metrica,
  trace, evento ou mensagem de erro.
- Provider e suboperador externo; dados reais permanecem bloqueados ate DPA,
  residencia, retencao e uso para treinamento serem aprovados.

## Testes De Seguranca Obrigatorios

- canarios distintos para API key, prompt, input e output em HTTP/log/span/fila;
- tenant/owner/provider/module cruzados, inclusive concorrencia;
- AAD incorreta, ciphertext truncado, versao de chave desconhecida e rotacao;
- SSRF por provider/model/external reference e redirects;
- prompt injection pedindo segredo, tool, mudanca de tenant ou bypass de schema;
- replay, timeout, 429, 401/403, quota, DLQ, cancelamento e credencial revogada;
- manager versus delegado, sem escritorio, varios escritorios e escritorio
  inativo;
- payload manual tentando alterar `application_slug`, `client_id`, owner e
  `officeIds` herdados.

## Riscos E Bloqueios

- rollout escolhido: OpenAI primeiro e Anthropic na sequencia; allowlists por
  ambiente/capability e smoke externo ainda pendentes;
- politica de regiao, retencao, treinamento, DPA e dados permitidos pendente;
- primeiro efeito de dominio da resposta ainda nao definido;
- Architecture Graph sem registry/gate operacional: nodes/edges planejados no
  gate, migracao obrigatoria antes de concluir;
- security checklist precisa estar preenchido e sem item aberto antes do merge.
