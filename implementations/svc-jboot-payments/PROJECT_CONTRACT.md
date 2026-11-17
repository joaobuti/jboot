# Project Contract: svc-jboot-payments

## Status

```yaml
lifecycle_status: in_progress
production_readiness: blocked
status_evidence: PIX endurecido, reconciliacao e estorno auditado executaveis; ativacao produtiva bloqueada por dependencias externas
last_status_review: 2026-10-05
```

## Identificacao

| Campo | Valor |
|---|---|
| Projeto | `implementations/svc-jboot-payments` |
| Tipo | Servico interno s2s independente |
| Capability | `payments` |
| Application Identity | Nao se aplica |
| Runtime | Go 1.25.13+ dentro da linha 1.25 |
| Banco | PostgreSQL dedicado `jboot_payments` |
| Porta local | `8040` |

## Responsabilidade

Criar e acompanhar cobrancas provider-neutral para produtos JBoot. O servico
mantem isolamento por tenant, idempotencia, maquina de estados, inbox/outbox e
fatos objetivos de pagamento. Recursos financeiros fluem diretamente do
provider para a conta BYOA do tenant; o JBoot nao custodia, divide ou repassa
fundos.

Sprint 2 acrescenta a PoC do adapter InfinitePay Checkout Pix e a integracao
web do PDV. Nao declara producao pronta, nao faz deploy e nao aplica cobranca
comercial.

## Stack Fit Gate

- Go + PostgreSQL: confirmado pelo usuario e ADR 011;
- Java/Spring: rejeitado por footprint e complexidade operacional maiores;
- NestJS: rejeitado para este servico concorrente e independente;
- incorporacao ao PDV/BFF: rejeitada por acoplamento a um consumidor.

## Fronteiras

- API e worker pertencem ao mesmo deploy unitario;
- core nao importa DTO, SDK ou HTTP de provider;
- providers implementam portas explicitas;
- BFFs consumidores nao recebem credenciais BYOA;
- Identity emite JWT s2s com audience `svc:payments`;
- tenant vem de contexto explicito e toda query inclui `client_id`;
- capability `payments` e verificada antes de aceitar nova cobranca;
- webhook/callback externo e nao confiavel e somente dispara verificacao.

## Contratos Obrigatorios

- `docs/architecture/decisions/011-payments-service-go.md`;
- `docs/architecture/decisions/012-infinitepay-pilot.md`;
- `docs/product/payments-sprints.md`;
- `docs/product/payments-sprint-0-gate.md`;
- `docs/product/payments-sprint-0-final-review.md`;
- `docs/product/payments-sprint-2-gate.md`;
- `docs/product/payments-pix-production-gate.md`;
- `docs/api/payments-sprint-1-openapi.yaml`;
- `docs/data/payments-sprint-1-data-model.md`;
- `docs/security/payments-threat-model.md`;
- `docs/security/payments-sprint-1-security-checklist.md`;
- `docs/security/payments-sprint-2-security-checklist.md`;
- `docs/security/payments-pix-production-security-checklist.md`;
- `docs/runbooks/payments-foundation.md`.

## Agents Locais

- `agents/payments-service.md`;
- `agents/payments-integrations.md`.

## Skills Locais

- `skills/payments-contracts.md`;
- `skills/payments-risk-review.md`.

## Ativacao Obrigatoria

```text
Agent Activation:
  project: implementations/svc-jboot-payments
  module: none
  using_agent:
    - implementations/svc-jboot-payments/agents/payments-service.md
    - implementations/svc-jboot-payments/agents/payments-integrations.md
  using_skill:
    - implementations/svc-jboot-payments/skills/payments-contracts.md
    - implementations/svc-jboot-payments/skills/payments-risk-review.md
    - docs/skills/dev-runtime-profile/SKILL.md
    - docs/skills/security-checklist/SKILL.md
    - docs/skills/external-http-adapter/SKILL.md
  referenced_only:
    - docs/agents/stacks/backend-go.md
  not_using:
    - frontend: servico sem UI
```

## Modelo Operacional

- dinheiro: inteiro em minor units; moeda inicial `BRL`;
- idempotencia: `(client_id, consumer_application, idempotency_key)`;
- estado externo incerto nunca vira falha presumida;
- `received` exige verificacao positiva, tenant e valor correlacionados;
- transicao financeira e outbox ocorrem na mesma transacao PostgreSQL;
- conexao BYOA `unverified` ou `disabled` bloqueia novas chamadas ao provider;
- bloqueio comercial afeta somente novas cobrancas.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:payments`
  - purpose: desenvolver e testar API e worker da fundacao.
  - containers:
    - required: `postgres`, `jboot`.
    - optional: `otel-collector`.
    - forbidden_by_default: `mongodb`, `valkey`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `temporal-ui`, `jboot-fiscal`.
  - app_processes:
    - required: `payments-api`, `payments-worker`.
    - optional: `identity-api` para smoke s2s.
    - forbidden_by_default: frontends e workers nao relacionados.
  - ports: `8040`.
  - healthchecks: `GET /health` e `GET /ready`.
  - seed_dependencies: banco `jboot_payments`, capability `payments` e habilitacao para o cliente canonico JBoot.
  - expected_resource_profile: baixo; dois processos Go e PostgreSQL, sem broker.

### Rules

- testes, vet e build executam no container `jboot`;
- `code-down:payments` encerra API e worker e remove logs temporarios;
- OTel collector e opt-in;
- broker, cache e workflow engine exigem medicao e nova decisao.

## Seguranca

- JWT s2s HS256 emitido pelo Identity, issuer `jboot-identity`, audience
  `svc:payments`, type `service_access` e caller allowlisted;
- `X-JBoot-Client-Id` UUID obrigatorio e nunca derivado do body;
- capability do tenant validada no banco Identity;
- request/response DTOs explicitos e body limitado;
- SQL parametrizado, sem serializacao de entidade;
- logs sem token, InfiniteTag, PII ou payload externo;
- URLs externas somente em adapters com allowlist fixa;
- segredo BYOA apenas por `secret_ref`.

## Validacao Das Sprints 1 E 2

```bash
go test ./...
go vet ./...
go build ./cmd/api ./cmd/worker
```

Tambem obrigatorios: migrations em PostgreSQL, smoke de health/readiness,
security checklist, runtime profile e `make ai-conformance`.

Evidencia executada em 2026-10-04:

- `go test -race ./...`, incluindo PostgreSQL e concorrencia;
- `go vet ./...` e `go build ./cmd/api ./cmd/worker`;
- smoke Identity -> JWT `svc:payments` -> POST/GET de cobranca;
- outbox transacional publicado pelo worker;
- imagem distroless/nonroot construida com Go 1.25.13;
- `govulncheck ./...` sem vulnerabilidade em simbolo chamado.

Evidencia adicional executada em 2026-10-05:

- `go test -race ./...` com PostgreSQL real, `go vet` e build da API/worker;
- 200 testes e type-check do BFF;
- 20 testes, type-check e build Next do frontend;
- `code-up:pdv` iniciou Identity, Platform e Payments e health/readiness passou;
- Checkout Pix, callback-sinal, verificacao server-to-server, configuracao BYOA
  e sincronizacao idempotente com a venda cobertos por testes automatizados.
- webhook-sinal, worker com backoff, painel de reconciliacao e workflow manual
  de estorno auditado implementados e testados;
- webhook InfinitePay real validado como sinal nao confiavel, sem autoridade
  para confirmar pagamento;
- migration 003, health/readiness e restore isolado aprovados;
- carga local de 1.000 health requests, concorrencia 20, zero falhas;
- `govulncheck` sem simbolo vulneravel chamado; Next 16.3.6 sem advisory critico.

O grafo HTTP canonico cobre este servico via adapter `go-net-http`, reconcilia
as rotas implementadas com `docs/api/payments-sprint-1-openapi.yaml` e reprova
drift entre codigo e contrato. `make ai-api-context MODULE=svc-jboot-payments`,
`make ai-api-impact` e `make ai-api-graph-gate` sao gates obrigatorios.

## Bloqueios De Ativacao Produtiva

- dominio HTTPS publico e roteamento produtivo;
- revisao juridica/contabil e LGPD;
- contrato do primeiro tenant pagante;
- autenticacao de webhook caso a InfinitePay publique contrato oficial futuro;
- settlement automatizado depende de fonte/API oficial ainda inexistente.
