# ADR 011: Servico De Pagamentos Em Go

```yaml
date: 2026-10-04
status: accepted
project: implementations/svc-jboot-payments
decision_owner: human
human_confirmation: confirmed
deployment_boundary: independent_unit
recommended_stack: Go + PostgreSQL
related_adr: 012-infinitepay-pilot
```

## Contexto

O JBoot oferecera cobranca integrada a multiplos produtos e clientes. Cada
cliente JBoot podera gerar cobrancas para seus proprios clientes usando
gateways de pagamento ou APIs bancarias ja integrados pelo ecossistema.

O servico sera multi-tenant e podera receber picos de criacao de cobranca,
webhooks, consultas, devolucoes, liquidacoes e reconciliacoes. Tambem emitira
fatos imutaveis de uso para o dominio comercial calcular a mensalidade e os
percentuais contratados por metodo.

O usuario confirmou que essa capability sera uma unidade independente e que o
backend do novo servico deve usar Go considerando o crescimento potencial, o
footprint por replica, o throughput e a concorrencia de webhooks/workers.

## Deployment Boundary Gate

```yaml
classification: independent_unit
host_project: null
stack_decision: greenfield
evidence:
  - multiplos produtos consumidores
  - build, runtime, banco, deploy e operacao proprios
  - segredos, webhooks e reconciliacao isolados dos BFFs consumidores
  - escala e falhas independentes do Platform e do Identity
  - gateways e bancos sao adapters do mesmo servico
```

Foram rejeitados:

- adapter de pagamento residente no PDV;
- modulo `payments` dentro do processo Platform;
- um servico separado por gateway ou banco;
- chamadas diretas dos produtos aos providers.

## Stack Fit Gate

| Alternativa | Fit | Decisao |
|---|---|---|
| Go + PostgreSQL | Baixo footprint, concorrencia e cancelamento explicitos, binario simples, bom throughput para API, webhooks e workers | **Escolhida e confirmada pelo usuario** |
| Java/Spring + PostgreSQL | Ecossistema financeiro maduro, com maior consumo por replica e complexidade operacional | Rejeitada para este servico apos decisao humana por Go |
| NestJS + PostgreSQL | Produtivo para I/O, mas a baseline do repositorio nao concede preferencia a unidade independente | Rejeitada |
| Laravel + PostgreSQL | Bom para CRUD/backoffice, menor aderencia ao nucleo financeiro concorrente | Rejeitada |

```yaml
counterfactual_choice: Go + PostgreSQL
recommended_stack: Go + PostgreSQL
baseline_bonus_applied: false
decision_status: confirmed_by_human
```

A decisao por Go e vinculante para o `svc-jboot-payments`. Ela nao pode ser
reaberta por preferencia de agent, familiaridade, baseline do repositorio ou
nova comparacao espontanea. Reavaliacao exige pedido humano explicito ou
evidencia de requisito materialmente incompatível; nesse caso, o conflito deve
ser apresentado ao usuario sem substituir esta ADR silenciosamente.

## Decisao

Criar futuramente `implementations/svc-jboot-payments` com:

- Go em versao estavel e suportada, fixada no `PROJECT_CONTRACT.md` e na imagem
  do projeto quando a fundacao for materializada;
- PostgreSQL como persistencia transacional;
- SQL, transacoes, constraints e migrations explicitos;
- API interna s2s autenticada;
- ingress externo restrito aos webhooks dos providers;
- application core provider-neutral;
- adapters para gateways e APIs bancarias de Pix/boleto;
- webhook inbox, transactional outbox e workers;
- OpenTelemetry para logs estruturados, metricas e traces;
- testes unitarios, de concorrencia, integracao PostgreSQL e contrato por
  provider.

A escolha entre biblioteca HTTP/router, driver/query generation, ferramenta de
migration e transporte duravel de eventos permanece no gate tecnico da
fundacao. Essas escolhas nao reabrem a linguagem.

## Invariantes Do Backend

- valores monetarios em unidade minima inteira ou decimal exato; nunca `float`;
- idempotencia por tenant, consumidor, operacao e chave;
- estado externo mapeado para maquina de estados canonica;
- resultado incerto permanece `pending_reconciliation` ou equivalente;
- nenhum failover automatico apos timeout de criacao sem reconciliacao;
- webhook autenticado quando o provider oferecer assinatura/mTLS;
- eventos duplicados e fora de ordem nao duplicam baixa nem regridem estado;
- credenciais e certificados nunca aparecem em payload, log ou fixture;
- `client_id` deriva do contexto s2s autenticado, nao de autoridade do payload;
- fatos financeiros e de uso sao imutaveis; correcoes sao compensatorias;
- bloqueio comercial impede novas cobrancas, mas nao interrompe webhook,
  liquidacao, devolucao, consulta ou reconciliacao existente.

## Fronteiras Relacionadas

- Payments executa cobrancas, adapters, webhooks, devolucoes, settlement e
  reconciliacao.
- O dominio comercial aplica mensalidade, percentuais, bundles, descontos,
  competencia e demonstrativo. Payments apenas emite fatos objetivos de uso.
- O servico e capability interna `payments`, sem `application_slug`, entitlement
  de usuario ou entrada no seletor do Identity.
- Produtos consumidores chamam a API s2s e continuam donos de suas vendas,
  pedidos ou obrigacoes.

## Decisoes Ainda Bloqueantes

Esta ADR confirma stack e fronteira, mas nao autoriza criar o projeto antes de:

- obter acesso controlado, documentacao completa e respostas reais anonimizadas;
- comprovar a semantica externa que representa pagamento recebido;
- fechar autenticacao/rotacao BYOA, volume, ticket, SLO e retencao;
- confirmar contratos HTTP/eventos, retencao, SLO e gestao de secrets;
- persistir gates, contracts, agents e skills exigidos pela governanca.

PDV, InfinitePay e o modelo BYOA ja foram confirmados e nao permanecem como
perguntas abertas. A decisao do provider e detalhada na ADR 012.

## Validacao

- decisao humana por Go confirmada em 2026-10-04;
- `AIF-EVAL-NC-007` garante que ADR e roadmap continuem registrando Go como
  stack confirmada e nao promovam Spring a recomendacao do Payments.
