# Payments Foundation Runbook

## Subir

```bash
make code-up TARGET=payments
```

## Validar

```bash
docker compose exec -T jboot bash -lc \
  'cd implementations/svc-jboot-payments && /usr/local/go/bin/go test ./... && /usr/local/go/bin/go vet ./...'
curl -fsS http://localhost:8040/health
curl -fsS http://localhost:8040/ready
```

## Parar Ou Reiniciar

```bash
make code-down TARGET=payments
make code-restart TARGET=payments
```

## Resultado Incerto

Nunca criar segunda cobranca automaticamente. Consultar attempt/outbox,
preservar `creation_outcome_unknown` e encaminhar para reconciliacao.

O dispatcher `PAYMENTS_OUTBOX_MODE=log` e exclusivamente local: ele prova claim,
lease e marcacao transacional do outbox, mas nao entrega eventos a consumidores
externos. Producao exige transporte duravel escolhido por gate tecnico e teste
de entrega/replay antes de remover esse bloqueio.

## PIX InfinitePay

- callback e webhook sao apenas sinais; somente `payment_check` positivo e
  correlacionado por tenant, valor, NSU e slug pode marcar `received`;
- o worker usa lease, `SKIP LOCKED` e backoff de 15 segundos a 30 minutos;
- consultar `/pdv/pagamentos` para pendencias e proxima verificacao;
- nunca criar outra cobranca automaticamente por falha do provider;
- estorno e registrado no JBoot, executado no app InfinitePay e encerrado no
  JBoot com operador e evidencia. Nunca concluir por inferencia.

Metricas: `payments.pix.callback_signal`, `payments.pix.verification_attempt`,
`payments.pix.reconciliation_confirmed`, `payments.pix.reconciliation_deferred`,
`payments.pix.refund_requested` e `payments.pix.refund_completed`.

Producao exige `PAYMENTS_ENVIRONMENT=production`, JWT secret com ao menos 32
caracteres, `PAYMENTS_PUBLIC_BASE_URL` HTTPS em DNS publico e o endpoint oficial
`https://api.checkout.infinitepay.io`. Configuracao insegura impede o startup.

## Recuperacao

- restaurar PostgreSQL ate RPO zero para confirmacoes commitadas;
- reiniciar API e worker;
- reprocessar inbox/outbox por chave idempotente;
- confirmar backlog, idade do evento mais antigo e cobrancas em reconciliacao;
- RTO alvo: 4 horas.

Teste local reproduzivel de backup/restore:

```bash
docker compose exec -T postgres pg_dump -U jboot -Fc jboot_payments -f /tmp/jboot_payments.dump
docker compose exec -T postgres createdb -U jboot jboot_payments_restore_test
docker compose exec -T postgres pg_restore -U jboot -d jboot_payments_restore_test /tmp/jboot_payments.dump
docker compose exec -T postgres psql -U jboot -d jboot_payments_restore_test -c 'SELECT version FROM schema_migrations ORDER BY version'
docker compose exec -T postgres dropdb -U jboot jboot_payments_restore_test
docker compose exec -T postgres rm -f /tmp/jboot_payments.dump
```

Evidencia de 2026-10-05: restore isolado recuperou 3 migrations e 8 tabelas.
Carga local: 1.000 requests em `/health`, concorrencia 20, zero falhas, 0,58 s.
Isto nao e SLO nem promessa de capacidade; trafego real deve ser medido.

## Rollback

Desabilitar capability `payments` para impedir novas cobrancas, manter API de
consulta/reconciliacao e reverter somente binario; migrations sao aditivas.
