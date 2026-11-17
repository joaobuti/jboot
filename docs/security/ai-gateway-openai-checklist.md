# Revisao OpenAI — Incremento BYOK (2026-10-15)

Escopo: cadastro, validacao, modelos e adapter Responses API. Aprovacao deste
incremento nao promove o gateway a production_ready nem libera dados reais.

- Injection: queries existentes parametrizadas; nenhuma execucao de shell com input.
- Access control: tenant/owner/JWT e scopes preservados; provider vem do registro;
  dois providers do mesmo owner mantem chaves e AAD separados.
- Dados sensiveis: API key/prompt write-only; sem logs do SDK; erros externos
  sanitizados; custos desconhecidos NULL; sem conteudo integral no ledger.
- Mass assignment: DTOs/rotas preservados; registry fechado; sem endpoint em input.
- Rate limiting: guard global, quotas PostgreSQL, timeout 10s para modelos e 60s
  para inferencia; 4096 tokens de output e 64 KiB de input.
- SSRF: `api.openai.com` fixo/TLS, sem redirects; sem organization/project de env.
- Dependencias: SDK oficial OpenAI com lockfile; npm audit omit dev sem vulnerabilidades.
- Stack: credencial apenas em memoria durante adapter; frontend nao persiste segredos.
- GenAI: JSON Schema estrito + Ajv; sem tools, output nao altera dominio; store false.
- Testes: roteamento positivo/negativo, isolamento provider, canarios em erro,
  401/403/429/500, schema invalido e ausencia de retry pago.

Pendencias de release registradas no gate: chave real/smoke/fixture de sucesso,
politica de dados, KMS, budgets monetarios e circuit breaker distribuido.
