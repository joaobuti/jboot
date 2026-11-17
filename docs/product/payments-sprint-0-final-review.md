# Payments Sprint 0 Final Review

```yaml
date: 2026-10-04
target_project: implementations/svc-jboot-payments
execution_mode: architectural
delivery_type: independent_internal_payment_integration_service
sprint_artifact: docs/product/payments-sprints.md
sprint_gate: docs/product/payments-sprint-0-gate.md
review_status: approved_by_human
project_materialization: authorized_and_materialized
```

## PO Scope

```yaml
objective: >-
  Permitir que produtos JBoot criem e acompanhem cobrancas provider-neutral,
  iniciando por Checkout Pix InfinitePay no PDV, com recursos liquidados
  diretamente na conta BYOA do tenant.
users_roles:
  - administrador_do_cliente_configura_provider_connection
  - produtos_jboot_consumidores_s2s
  - operador_jboot_audita_e_reconcilia
business_rules:
  - JBoot nao custodia, divide ou repassa recursos
  - callback nao confirma pagamento
  - received exige payment_check positivo, correlacionado e integral
  - cobranca comercial futura usa termos versionados por contrato
  - bloqueio comercial impede somente novas cobrancas
data:
  - identificadores tecnicos opacos
  - tenant e aplicacao consumidora
  - valores inteiros em minor units
  - estados, timestamps e auditoria
  - sem nome, CPF/CNPJ ou endereco do pagador no Payments
acceptance:
  - idempotencia e isolamento multi-tenant
  - inbox e outbox duraveis
  - resultado externo incerto preservado sem duplicacao
  - observabilidade e reconciliacao operaveis
```

## PE Decision

```yaml
objective: materializar a fundacao provider-neutral apos confirmacao humana
execution_mode: architectural_then_project
target_project: implementations/svc-jboot-payments
target_module: null
context_scope:
  - docs/architecture/decisions/011-payments-service-go.md
  - docs/architecture/decisions/012-infinitepay-pilot.md
  - docs/product/payments-sprints.md
  - docs/product/payments-sprint-0-gate.md
delivery_type: service_api_worker_external_integration
implementation_contracts:
  - PROJECT_CONTRACT.md com lifecycle planned
  - Dev Runtime Profile
  - modelo de dados e maquina de estados
  - API s2s e eventos provider-neutral
  - threat model e security checklist
agent_activation:
  using_agent:
    - product-owner
    - product-engineer
    - architect
  using_skill:
    - ai-first-governance
    - dev-runtime-profile
    - security-checklist
sprint_artifact: docs/product/payments-sprints.md
sprint_gate: docs/product/payments-sprint-0-gate.md
screen_route_impact: none
architect_required: true
  human_confirmation: approved
```

## Stack Fit Gate

| Candidata | Fit | Decisao |
|---|---|---|
| Go + PostgreSQL | Concorrencia eficiente, binario simples, consumo previsivel, bom fit para API/worker e integracoes | Recomendada e ja confirmada pelo usuario |
| Java/Spring + PostgreSQL | Ecossistema robusto, mas maior footprint e complexidade operacional para este servico isolado | Rejeitada para este servico |
| NestJS + PostgreSQL | Produtividade e tipagem boas, mas runtime/footprint inferiores ao Go para o perfil independente e concorrente | Rejeitada para este servico |
| Incorporar ao BFF/PDV | Menor custo inicial, mas acopla pagamentos a um consumidor e impede reuso multi-produto | Rejeitada |

```yaml
recommended_stack: Go + PostgreSQL
decision_status: confirmed_by_human
baseline_decision: technical_fit_not_repository_baseline
```

## Architecture Recommendation

```yaml
boundary: independent_s2s_capability
identity: capability_registry_slug_payments
application_slug: none
api: stateless_provider_neutral
persistence: postgresql
async_reliability:
  - durable_webhook_inbox
  - transactional_outbox
  - independently_scalable_workers
multi_tenancy: tenant_and_provider_account_scoped
money: integer_minor_units
provider_confirmation: authenticated_or_observed_server_to_server_check
callback_authority: trigger_only
runtime:
  required:
    - payments_api
    - payments_worker
    - postgresql
  optional:
    - otel_collector
  forbidden_by_default:
    - broker_without_measured_need
    - cache_without_measured_need
    - workflow_engine_without_measured_need
```

## Open Questions Decision

### Resolvidas Para A Fundacao

- stack, fronteira, primeiro consumidor, provider e capability;
- BYOA, ownership operacional da PoC e troca com revalidacao;
- sem custodia JBoot;
- confirmacao canônica do caminho positivo `received`;
- PoC interna sem faturamento comercial;
- previsao de capacidade `not_collected`, sem zero fabricado;
- timeout, retry, reconciliacao, RTO e RPO iniciais;
- minimizacao de dados do pagador.

### Nao Bloqueiam A Fundacao, Mas Bloqueiam Adapter/Producao

- payload real do webhook InfinitePay;
- assinatura/autenticidade e replay do webhook;
- rate limits e SLA oficiais;
- fixtures reais de estados negativos e excepcionais;
- expiracao, cancelamento e devolucao reais;
- revisao juridica/contabil da retencao e base LGPD;
- contrato versionado do primeiro tenant pagante;
- benchmark, envelope de capacidade e alertas medidos;
- settlement/reconciliacao automatica e isolamento com multiplas contas BYOA.

## Sprint Gate

```yaml
sprint_0:
  status: approved
  blocking_now: []
  approved_non_blocking_for_foundation:
    - provider_rate_limits_not_published
    - webhook_fixture_not_yet_captured
    - legal_accounting_review_before_production
    - commercial_contract_before_first_paying_tenant
    - measured_capacity_before_production
blocking_status: sprint_0_closed
```

## Confirmacao Solicitada

A confirmacao humana autoriza somente a Sprint 1, fundacao do servico Go. Nao
autoriza producao, ativacao para clientes, deploy, cobranca comercial, secrets
reais ou adapter InfinitePay declarado production-ready.

Confirmacao recebida em 2026-10-04. A fundacao foi materializada sem ampliar a
autorizacao para os itens excluidos acima.
