# AI Gateway Foundation — Security Checklist

Data: 2026-10-15. Escopo: catalogo de providers, cofre BYOK, agentes versionados e UI da Sprint 11.

## Resultado

- [x] SQL integralmente parametrizado; nenhuma entrada chega a shell ou SQL dinamico.
- [x] JWT valida assinatura e issuer; `client_id` e `sub` formam o escopo de toda query.
- [x] Autorizacao por recurso exige `ai:credentials:manage` ou `ai:agents:manage` sem dependencia cruzada.
- [x] Respostas sao views explicitas e nunca serializam a linha com material cifrado.
- [x] API key e write-only, nunca e logada; auditoria contem apenas ids, evento e resultado.
- [x] DTO usa allowlist de campos e ValidationPipe rejeita campos extras.
- [x] Listas possuem limite 100 e throttling global de 60 requisicoes/minuto.
- [x] Nao existe URL controlada pelo usuario; adapters OpenAI/Anthropic usam
  origem fixa e apenas providers habilitados por ambiente aparecem ativos.
- [x] AES-256-GCM usa nonce aleatorio e AAD ligado a id/tenant/owner/provider/versao.
- [x] Revogacao apaga ciphertext, nonce e tag.
- [x] `npm audit --omit=dev` sem vulnerabilidades; override transitivo fixa `js-yaml` 5.4.3.
- [x] Testes cobrem round-trip, adulteracao, troca de AAD, isolamento, provider negado,
  segredo ausente da resposta e scope obrigatorio.
- [x] Agentes usam tenant/owner/modulo derivados do JWT; payload nao aceita contexto.
- [x] Prompt e write-only, cifrado com AAD por agente/versao/contexto e nunca retornado.
- [x] Criacao de agente e versao inicial ocorre na mesma transacao PostgreSQL.
- [x] Conteudo externo continua tratado como nao confiavel e nao ha execucao de output.
- [x] Frontend obtem tenant, owner e modulo somente do JWT; payload nao permite sobrescrever o contexto.
- [x] Prompt permanece write-only na UI e a listagem exibe apenas metadados e versao ativa.
- [x] Execucao s2s exige JWT curto do Identity com audience/caller allowlisted e
  vincula headers de tenant/modulo ao payload.
- [x] Agente e credencial precisam estar ativos e pertencer ao requester, tenant e modulo informados.
- [x] Idempotencia rejeita reuso com input diferente e converge chamadas concorrentes pela constraint do banco.
- [x] Ledger persiste somente hashes e metadados; prompt, chave, input e output integrais nao sao armazenados.
- [x] Provider desconhecido falha fechado como `provider_not_supported`; nao existe fallback silencioso.
- [x] Acoes executadas permaneceram no workspace/runtime local autorizado; sem deploy/push.
- [x] Attestation nao inclui segredo nem dado pessoal.

## N/A

- Senhas de usuario: o servico nao recebe nem persiste senhas.
- Certificados customizados: N/A; SDKs usam validacao TLS padrao e origem fixa.
- Mobile/desktop: nao fazem parte desta entrega.

## Bloqueios mantidos

- smoke externo, allowlists de modelos, politica de dados/DPA e residencia
  ainda exigem decisao operacional;
- producao exige KMS/secret manager, rotacao da chave e das credenciais s2s e
  observabilidade operacional;
- timeout/retry, quota, circuit breaker, kill switch, cancelamento e expurgo permanecem bloqueios da Sprint 11.
