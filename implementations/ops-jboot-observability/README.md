# ops-jboot-observability

Plataforma operacional interna de observabilidade do JBoot. Centraliza OTLP e
persiste métricas no Mimir, traces no Tempo e logs no Loki, com visualização no
Grafana.

## Início local

```bash
cp implementations/ops-jboot-observability/.env.example \
  implementations/ops-jboot-observability/.env
make observability-up
make observability-smoke
make observability-root-smoke
```

Grafana: `http://localhost:3300`.

Use `OBS_GRAFANA_ADMIN_USER` e `OBS_GRAFANA_ADMIN_PASSWORD` definidos no `.env`
para o primeiro acesso. Como PostgreSQL e Grafana persistem estado, alterar a
senha no `.env` depois da primeira inicialização não rotaciona automaticamente a
credencial já gravada; use o procedimento de rotação do Grafana.

Os valores de `.env.example` são placeholders. Defina senhas locais antes de
subir a stack. O arquivo `.env` não deve ser versionado.

## Operação

```bash
make observability-ps
make observability-logs
make observability-down
make observability-validate
```

`observability-down` preserva volumes. Não existe reset destrutivo implícito.

## Limite do runtime local

O Compose usa modo monolítico para validar contratos e o fluxo ponta a ponta.
Produção distribuída, autenticação do gateway, mTLS e object storage gerenciado
dependem do ambiente de deploy e estão documentados no roadmap e ADR.
