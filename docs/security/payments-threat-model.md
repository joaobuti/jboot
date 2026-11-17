# Payments Threat Model

## Ativos

- identidade de tenant e caller s2s;
- idempotency keys e referencias comerciais;
- conexoes BYOA e secret references;
- estados, valores, inbox e outbox financeiros.

## Trust Boundaries

| Borda | Confianca | Controle |
|---|---|---|
| BFF -> Payments | autenticada, nao irrestrita | JWT audience/type/caller + tenant UUID + capability |
| Provider -> webhook | nao confiavel | inbox, dedupe, limites e verificacao server-to-server |
| Payments -> provider | externa | URL fixa, timeout, resultado estruturado e circuit breaker |
| Worker -> banco | privilegiada | role minima e queries parametrizadas |

## Ameacas E Mitigacoes

- cross-tenant: toda consulta usa `client_id`; 404 em ownership divergente;
- replay: idempotencia de comando e unique constraint de evento;
- duplicacao externa: timeout de criacao vira resultado incerto, sem retry cego;
- callback forjado: nunca autoriza `received`;
- SSRF: nenhum URL de request externo vem do caller;
- vazamento: logs sem token, handle, receipt URL, PII ou payload bruto;
- supply chain: dependencias fixadas, `govulncheck` antes de producao;
- indisponibilidade: backpressure, reconciliacao e outbox duravel.
