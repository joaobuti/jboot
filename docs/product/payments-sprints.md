# Payments Sprints

## Objetivo

Planejar a capability interna de pagamentos reutilizavel por produtos JBoot,
com gateways e APIs bancarias de cobranca implementados como adapters do mesmo
servico.

## Decisoes Confirmadas

```yaml
service: implementations/svc-jboot-payments
boundary: independent_unit
backend_language: Go
database: PostgreSQL
stack_status: confirmed_by_human
architecture_decision: docs/architecture/decisions/011-payments-service-go.md
provider_decision: docs/architecture/decisions/012-infinitepay-pilot.md
identity_model: internal_capability
application_slug: none
first_consumer: pdv
first_provider: infinitepay
provider_model: byoa_per_tenant
jboot_custody_of_funds: false
fund_flow: provider_direct_to_tenant
commercial_rating: fixed_monthly_fee_plus_contractual_percentage
commercial_billing_cycle: next_subscription_cycle
discount_policy: non_discountable
commercial_block_mode: new_charges_only
provider_connection_change_policy: audit_block_and_revalidate
normal_pix_confirmation_target: 2_minutes
recovery_time_objective: 4_hours
confirmed_payment_recovery_point_objective: zero
payer_pii_storage: none
financial_record_retention_proposal: 5_years_pending_legal_accounting_review
capacity_forecast_status: not_collected
capacity_forecast_policy: measure_before_production_never_encode_unknown_as_zero
```

Go e uma decisao aceita, nao uma pergunta aberta. Nenhuma sprint ou agent pode
substitui-la por Spring, NestJS, Laravel ou outra stack sem nova decisao humana
explicita registrada por ADR.

## Projetos E Fronteiras Planejadas

| Projeto | Responsabilidade |
|---|---|
| `implementations/svc-jboot-payments` | Execucao de cobrancas, adapters, webhooks, devolucoes, liquidacao, reconciliacao e fatos de uso. |
| `implementations/bff-jboot-identity/modules/commercial` | Candidato condicionado para ofertas, propostas, contratos, assinaturas, rating e demonstrativo; depende de confirmacao e contrato proprio. |
| `implementations/app-jboot-identity-admin` | Administracao comercial futura, apos fluxo `ui-ux` e congelamento da API. |
| Produtos consumidores | Venda/pedido/obrigacao e apresentacao do Pix/boleto ao pagador. |

O PDV e o primeiro consumidor confirmado. InfinitePay e o primeiro provider,
com uma conexao BYOA isolada por tenant e liquidacao direta na conta do cliente
JBoot. Checkout e InfiniteTap sao capabilities independentes; homologar uma nao
autoriza declarar suporte a outra. Asaas e Efi permanecem no roadmap para
boleto e redundancia.

O `PROJECT_CONTRACT.md` de `svc-jboot-payments` foi criado depois da decisao
operacional das perguntas bloqueantes e da confirmacao humana da Sprint 1.

A revisao final da Sprint 0 esta em
`docs/product/payments-sprint-0-final-review.md`.

## Sprint 0: Contratos E Due Diligence InfinitePay

Estado de entrega: `concluida`.

Objetivo: fechar escopo operacional, provider inicial e contratos antes da
fundacao do servico.

Entregaveis:

- ADR da fronteira e stack Go;
- InfinitePay como provider piloto e Asaas/Efi como alternativas posteriores;
- Checkout Pix confirmado como capability da PoC; InfiniteTap adiado;
- conexao BYOA por tenant, sem custodia JBoot;
- perfil de volume, ticket e mix Pix/boleto;
- quando previsao comercial nao existir, indisponibilidade explicitamente
  registrada sem codificar desconhecido como zero;
- semantica comprovada de Pix, devolucao, cancelamento e liquidacao;
- modelo de dados e maquina de estados;
- contrato s2s, eventos de uso e webhooks;
- estrategia de idempotencia, timeout, retry e resultado incerto;
- estrategia de secrets/certificados, retencao e LGPD;
- SLO, observabilidade, reconciliacao e fallback dos consumidores;
- respostas reais de ambiente controlado anonimizadas e com origem registrada;
- termos comerciais completos do tenant de PoC;
- decisao operacional para todas as perguntas abertas.

Criterios de aceite:

- Go + PostgreSQL registrados como stack confirmada;
- PDV registrado como primeiro consumidor;
- InfinitePay registrado como primeiro provider;
- Checkout Pix registrado como capability confirmada pelo usuario;
- conta e ambiente controlado acessiveis;
- taxas e prazo de liquidacao registrados por proposta vigente;
- evento/status que representa valor recebido comprovado por payload real;
- autenticacao, revogacao e rotacao BYOA documentadas;
- contratos provider-neutral revisados;
- nenhum segredo em documento, fixture ou repositorio;
- perguntas bloqueantes respondidas ou premissas aprovadas pelo usuario.
- conexao BYOA alterada permanece sem emitir novas cobrancas ate revalidacao;
- mensalidade e percentual nunca sao inferidos fora da versao contratual;
- nome, CPF/CNPJ e endereco do pagador nao sao armazenados pelo Payments.
- ausencia de previsao nao bloqueia a fundacao, mas benchmark medido, envelope
  de capacidade e alertas bloqueiam producao.

Fora de escopo:

- codigo funcional;
- criacao do `PROJECT_CONTRACT.md` antes do gate;
- InfiniteTap e cartao, salvo nova decisao humana da capability da PoC;
- boleto, split, recorrencia, banking e tesouraria;
- smart routing automatico;
- custodia ou repasse de recursos pelo JBoot.

## Sprint 1: Fundacao Do Servico Go

Estado de entrega: `concluida`.

Objetivo: materializar o servico s2s provider-neutral.

Entregaveis:

- projeto Go e container;
- `PROJECT_CONTRACT.md`, lifecycle, agents e skills locais;
- PostgreSQL, migrations, constraints e isolamento multi-tenant;
- API s2s e validacao JWT/capability `payments`;
- payment intent, charge, attempt, provider event e refund;
- maquina de estados e representacao monetaria exata;
- idempotencia, webhook inbox e transactional outbox;
- worker e transporte de eventos definido pelo gate tecnico;
- health/readiness, logs, metricas e traces OpenTelemetry;
- threat model, runbook e testes automatizados.

Criterios de aceite:

- mesma chave idempotente nao cria segunda cobranca;
- concorrencia e falha apos sucesso externo nao duplicam efeito;
- tenant nao acessa conta, cobranca ou evento de outro tenant;
- bloqueio comercial falha antes da chamada ao provider para nova cobranca;
- webhooks e reconciliacao existentes continuam durante bloqueio;
- testes rodam dentro do container do projeto;
- security checklist e `make ai-conformance` aprovados.

Evidencia funcional e de governanca concluida em 2026-10-04. O grafo HTTP foi
integrado, ganhou adapters Go/OpenAPI e passou a enxergar as quatro rotas do
Payments, seus handlers e DTOs, sem drift aceito ou mascarado.

Fora de escopo:

- adapter de producao;
- UI;
- precificacao comercial dentro do Payments;
- broker, cache ou workflow engine sem decisao no runtime gate.

## Sprint 2: InfinitePay Checkout Pix PoC

Estado de entrega: `concluida` para a PoC web aprovada em 2026-10-05.

Gate aprovado em `docs/product/payments-sprint-2-gate.md`. O usuario confirmou
em 2026-10-05 que selecionar `PIX` no PDV deve iniciar este fluxo integrado,
mantendo os demais meios no fluxo manual vigente.

Objetivo: validar Checkout Pix da InfinitePay no PDV web sem presumir suporte a
campos ou operacoes ausentes das respostas reais.

Entregaveis:

- adapter InfinitePay Checkout construido a partir de payload real;
- criacao e consulta por `payment_check` ou contrato real equivalente;
- apresentacao segura do checkout no PDV web;
- webhook tratado como sinal e confirmacao server-to-server;
- confirmacao idempotente e devolucao definida;
- fato imutavel de uso;
- reconciliacao e observabilidade operacional.

Criterios de aceite:

- somente `payment_check` server-to-server positivo, correlacionado e com valor
  integral confirma `received`; callback isolado apenas dispara verificacao;
- confirmacao repetida produz uma unica transicao e um unico
  `payment.received` via outbox transacional;
- divergencia de valor ou conta do tenant segue para reconciliacao;
- webhook duplicado, invalido, atrasado ou fora de ordem e tratado;
- timeout nao dispara retry cego em outro provider;
- fixtures provem de respostas reais do ambiente controlado;
- produto consumidor nao importa DTO ou SDK do provider.

Evidencia de conclusao:

- adapter Go testado contra fixtures reais anonimizadas de criacao, callback e
  `payment_check`;
- PDV web inicia Checkout Pix ao selecionar `PIX` e nao usa o endpoint manual;
- BFF confirma uma unica linha local somente apos `received` verificado;
- configuracao BYOA exige declaracao administrativa explicita e preserva
  somente referencia de segredo;
- testes Go com race/PostgreSQL, 200 testes do BFF, 20 testes web, type-check,
  build Next, runtime `code-up:pdv`, health/readiness e grafo HTTP aprovados;
- `production_readiness` continua bloqueado pelos itens registrados no gate e
  no checklist de seguranca da Sprint 2.

Fora de escopo:

- InfiniteTap, cartao, boleto, split e segundo provider.

## Sprint 3: Boleto Provider-Neutral

Estado de entrega: `pendente`.

Bloqueada por decisao humana em 2026-10-05 ate a conclusao terminal do
`Payments PIX Production Gate` em
`docs/product/payments-pix-production-gate.md`.

Objetivo: selecionar Asaas, Efi ou API bancaria comprovada e emitir boleto pelo
mesmo contrato provider-neutral.

Entregaveis:

- emissao e consulta;
- linha digitavel, codigo de barras e URL controlada;
- vencimento, liquidacao e baixa/cancelamento quando suportado;
- fato de uso separado de Pix;
- erros e reconciliacao operaveis.

Criterios de aceite:

- emissao nao equivale a pagamento;
- boleto nao pago nao gera percentual variavel na premissa atual;
- baixa e liquidacao preservam trilha completa;
- campos obrigatorios derivam de respostas reais do provider.

Fora de escopo:

- protesto, cobranca juridica, banking/tesouraria e regras nao confirmadas de
  juros, multa ou desconto.

## Sprint 4: Reconciliacao E Operacao

Estado de entrega: `pendente`.

Objetivo: fechar o ciclo financeiro de Pix e boleto.

Entregaveis:

- bruto, tarifa do provider, liquido e lote/data de liquidacao;
- divergencias e resolucao auditavel;
- devolucoes e ajustes compensatorios;
- replay controlado, alertas e runbooks;
- metricas de custo efetivo, webhook lag e resultados incertos.

Criterios de aceite:

- divergencias ficam explicitas e nao sobrescrevem fatos;
- reconciliacao pode ser refeita idempotentemente;
- indisponibilidade de provider ou dominio comercial nao perde eventos.

Fora de escopo:

- contabilidade geral, ERP, documento fiscal e gestao de caixa bancario.

## Sprint 5: Segundo Provider E Segundo Consumidor

Estado de entrega: `pendente`.

Objetivo: comprovar portabilidade e reuso multi-produto.

Entregaveis:

- segundo adapter homologado;
- segundo produto consumidor;
- politica explicita de selecao antes da criacao;
- comparativo real de custo, SLA e falhas;
- testes de carga e capacidade.

Criterios de aceite:

- nenhum campo provider-specific vaza ao contrato dos consumidores;
- provider e conta sao selecionados antes da cobranca;
- resultado incerto nunca causa failover automatico;
- Go permanece adequado aos SLOs medidos sem troca de runtime.

Fora de escopo:

- smart routing autonomo e alteracao de stack sem nova decisao humana.

## Perguntas Bloqueantes Da Sprint 0

- acesso real a conta, documentacao completa e ambiente controlado;
- payload real de criacao, consulta e evento para comprovar `received`;
- autenticacao, revogacao e rotacao da conexao BYOA;
- mensalidade, percentual, ciclo, timezone, vigencia e aprovador do tenant PoC;
- volume mensal, pico, ticket e mix Pix/boleto;
- SLA de webhook, polling, retencao, RPO e RTO;
- contratos HTTP/eventos e transporte duravel inicial;
- politica de dados do pagador e LGPD;
- regra comercial de devolucao/ajuste antes de producao.

## Decisoes Adiadas Nao Bloqueantes Para A PoC

- segundo produto consumidor;
- ordem entre Asaas e Efi;
- InfiniteTap e Checkout com cartao;
- formato final de UI/PDF/CSV do demonstrativo;
- prorata, alteracao intraciclo e ajustes retroativos;
- smart routing, split, franquias, tiers, minimo e teto.

## Gate Atual

O gate executavel da fase esta em
`docs/product/payments-sprint-0-gate.md`. Enquanto ele permanecer bloqueado,
nao criar `implementations/svc-jboot-payments`, `PROJECT_CONTRACT.md`, DTO
externo, fixture ou adapter funcional.
