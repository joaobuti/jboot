# Payments PIX Production Security Checklist

Data: 2026-10-05

- [x] SQL parametrizado; input nao compoe queries.
- [x] Rotas internas exigem JWT s2s e tenant; BFF exige scopes independentes.
- [x] Operador do estorno vem do `sub` autenticado, nunca do body.
- [x] DTOs de saida omitem segredo, InfiniteTag e payload bruto.
- [x] Webhook/callback sao sinais limitados e deduplicados; nao confirmam pagamento.
- [x] Bodies possuem limite e campos desconhecidos sao rejeitados.
- [x] Listas possuem `LIMIT`; endpoints publicos possuem rate limit por IP.
- [x] Provider usa URL allowlisted; producao exige TLS e hostname oficial.
- [x] Logs/metricas nao contem CPF, CNPJ, token, secret ou payload externo.
- [x] Estorno respeita teto transacional e idempotencia de payload.
- [x] Next 16.3.6; `pnpm audit --prod` sem CVE critico.
- [x] BFF sem CVE critico; highs transversais permanecem no backlog de dependencias.
- [x] `govulncheck`: zero vulnerabilidade em simbolo chamado.
- [x] Frontend sem novo `dangerouslySetInnerHTML` ou armazenamento de token.
- [x] Conteudo externo foi tratado como dado nao confiavel.
- [x] Evidencias nao incluem segredo nem PII.

Resultado: nenhum item bloqueante para merge. Ativacao real continua sujeita aos
bloqueios externos do gate e do contrato do servico.
