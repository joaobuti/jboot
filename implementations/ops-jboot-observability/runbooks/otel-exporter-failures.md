# Runbook: OpenTelemetry Exporter Failures

## Impacto

Perda ou atraso de métricas, traces ou logs. Produtos podem continuar funcionais,
mas diagnóstico, alertas e evidência operacional ficam incompletos.

## Diagnóstico

1. Identificar o exporter e o sinal no painel `Falhas de exportação — 15 min`.
2. Verificar `otel-gateway`, backend correspondente e MinIO.
3. Conferir fila, retries, throttling, quotas do tenant e espaço disponível.
4. Não imprimir payloads, headers de autorização ou credenciais durante a análise.

```bash
make observability-ps
implementations/ops-jboot-observability/bin/compose.sh logs --tail=200 otel-gateway
```

## Mitigação

- recuperar o backend indisponível antes de reiniciar o gateway;
- preservar volumes e filas;
- reduzir ingestão não crítica somente com decisão operacional registrada;
- não desabilitar redaction, tenancy ou limites para aliviar o incidente.

## Recuperação

Executar `make observability-smoke` e confirmar que o contador de falhas parou de
crescer. Registrar período potencial de perda e tenants afetados.

## Escalonamento

Owner: `platform-sre`. Escalar imediatamente para segurança se houver suspeita de
vazamento de tenant, PII, segredo ou acesso indevido ao object storage.

