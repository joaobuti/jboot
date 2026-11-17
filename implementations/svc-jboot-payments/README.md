# svc-jboot-payments

Fundacao provider-neutral de pagamentos JBoot em Go e PostgreSQL.

```bash
make code-up TARGET=payments
docker compose exec -T jboot bash -lc \
  'cd implementations/svc-jboot-payments && /usr/local/go/bin/go test ./... && /usr/local/go/bin/go vet ./...'
```

Rotas internas: `/health`, `/ready`, `POST /v1/charges` e
`GET /v1/charges/{id}`. Rotas de dominio exigem JWT s2s `svc:payments`, tenant
header e capability ativa.

Esta sprint nao possui adapter InfinitePay operacional.
O modo de outbox `log` existe somente para o runtime local e nao constitui
transporte de producao.
