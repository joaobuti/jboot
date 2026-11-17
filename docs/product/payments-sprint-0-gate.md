# Payments Sprint 0 Gate

```yaml
sprint: 0
state: concluido
target_project: implementations/svc-jboot-payments
project_materialization: authorized_and_materialized
functional_code: sprint_1_foundation_materialized
provider_adapter: blocked_until_real_webhook_payload
last_review: 2026-10-04
```

## Objetivo

Fechar contratos, evidencia externa e termos operacionais da PoC InfinitePay
antes de criar o projeto Go ou transformar suposicoes em DTOs e fixtures.

## Decisoes Resolvidas

- [x] unidade independente `svc-jboot-payments`;
- [x] Go + PostgreSQL;
- [x] PDV como primeiro consumidor;
- [x] InfinitePay como primeiro provider;
- [x] BYOA por tenant;
- [x] recursos liquidados diretamente na conta do tenant;
- [x] JBoot sem custodia, split ou repasse;
- [x] mensalidade fixa + percentual contratual no ciclo seguinte;
- [x] adicional `non_discountable`;
- [x] bloqueio restrito a `new_charges_only`;
- [x] Asaas/Efi adiados para boleto/redundancia;
- [x] InfinitePay Checkout Pix como capability da PoC;
- [x] InfiniteTap fora da PoC e sujeito a novo gate;
- [x] branch dedicada `codex/payments-go-architecture`;
- [x] ADRs 011 e 012 persistidas no worktree.

## Gate Bloqueante

| ID | Requisito | Estado | Evidencia de saida |
|---|---|---|---|
| PAY-S0-001 | Confirmar Checkout Pix como capability da PoC | concluido | decisao humana registrada neste gate e na ADR 012 |
| PAY-S0-002 | Conta e ambiente controlado InfinitePay acessiveis | concluido para a PoC | conta/app, capability habilitada e criacao controlada HTTP 200 comprovadas |
| PAY-S0-003 | Capturar criacao, consulta e evento reais | concluido para o caminho positivo Checkout Pix | fixtures anonimizadas de criacao, callback e `payment_check` positivo |
| PAY-S0-004 | Comprovar o evento/status que significa `received` | concluido para o caminho positivo Checkout Pix | `payment_check` HTTP 200, `success=true`, `paid=true`, Pix e valor integral correlacionado |
| PAY-S0-005 | Documentar autenticacao, ownership, revogacao e rotacao BYOA | concluido para a PoC | configuracao administrativa, declaracao, cobranca real, revalidacao, auditoria e bloqueio definidos |
| PAY-S0-006 | Definir termos do tenant PoC | concluido para a PoC interna | sem faturamento comercial na PoC; primeiro tenant pagante exige contrato concreto versionado |
| PAY-S0-007 | Definir perfil inicial de carga | concluido por indisponibilidade explicita | previsao comercial `not_collected`; nao convertida em zero nem em estimativa fabricada |
| PAY-S0-008 | Definir SLO e recuperacao | concluido para a fundacao | timeout, retries, estado incerto, polling conservador, RTO e RPO definidos |
| PAY-S0-009 | Classificar dados do pagador | concluido para a fundacao | minimizacao definida; revisao juridica/contabil permanece gate de producao |
| PAY-S0-010 | Revisao final PO/PE/Architect e humana | concluido | usuario confirmou a materializacao da Sprint 1 em 2026-10-04 |

## Evidencia Operacional Recebida

```yaml
date: 2026-10-04
source: declaracao_humana
confirmed:
  - conta InfinitePay criada
  - conta conectada ao aplicativo InfinitePay
  - Checkout Pix escolhido como capability da PoC
  - InfiniteTag fornecida fora dos artefatos versionados
  - API de criacao respondeu para a conta informada
  - Checkout externo habilitado
  - link real de Checkout criado com HTTP 200
  - chave Pix cadastrada apos erro inicial de geracao do QR
  - pagamento de R$ 1,00 realizado e credito conferido manualmente pelo titular
  - callback controlado capturado com os identificadores da transacao
  - payment_check repetido com os identificadores completos
  - resposta HTTP 200 com success=true, paid=true e valor integral
not_yet_evidenced:
  - mecanismo criptografico ou oficial do provider para comprovar ownership
  - autenticidade criptografica e protecao contra replay do callback
  - variantes negativas, expiracao, devolucao e reconciliacao de settlement
```

O login no aplicativo nao e tratado como credencial de API nem como prova de
homologacao de Checkout ou InfiniteTap. O valor da InfiniteTag nao e persistido
em Git, documento, fixture, log ou attestation.

## Captura Real 001: Checkout Desabilitado

Em 2026-10-04, uma criacao controlada de R$ 1,00 foi enviada para
`POST https://api.checkout.infinitepay.io/links`. A InfinitePay retornou
`external_checkout_not_enabled` e orientou habilitar a capability nas
configuracoes do Checkout. Nenhum link foi criado e nenhum pagamento ocorreu.

Fixture anonimizada:
`docs/product/infinitepay-checkout-not-enabled.fixture.json`.

Essa captura prova alcance do endpoint e o estado desabilitado da capability;
nao prova criacao, pagamento, `payment_check`, webhook ou liquidacao.

## Captura Real 002: Checkout Criado

Apos habilitacao pelo titular, uma segunda criacao controlada de R$ 1,00 no
mesmo endpoint retornou HTTP 200 e uma URL de Checkout real. Nenhum segredo,
InfiniteTag, `order_nsu` ou token vivo foi persistido.

Fixture anonimizada:
`docs/product/infinitepay-checkout-created.fixture.json`.

Essa captura comprova criacao. Pagamento, confirmacao, `payment_check`, webhook
e liquidacao permanecem fora da evidencia ate a transacao ser concluida.

## Evidencia Manual 003: Pix Pago E Creditado

O titular informou em 2026-10-04 que a primeira tentativa de gerar QR falhou
porque a conta ainda nao possuia chave Pix. Apos cadastrar a chave, o QR foi
gerado, o pagamento de R$ 1,00 foi realizado e o credito apareceu na conta
InfinitePay, verificado manualmente.

Essa declaracao comprova o fluxo operacional para a PoC, mas nao substitui a
confirmacao server-to-server exigida para producao.

## Captura Real 004: Payment Check Sem Identificadores Completos

A consulta a `POST https://api.checkout.infinitepay.io/payment_check` com
`handle` e `order_nsu`, mas sem `transaction_nsu` e `slug`, retornou HTTP 200
com `success=false`. O primeiro link nao configurou redirect nem webhook, por
isso esses identificadores nao foram capturados.

Fixture anonimizada:
`docs/product/infinitepay-payment-check-insufficient-identifiers.fixture.json`.

Essa captura demonstrou que `handle` e `order_nsu` isolados nao bastam para a
consulta positiva. Nao se deve inferir `paid` a partir do credito manual dentro
do adapter definitivo.

## Captura Real 005: Callback Do Checkout Pix Pago

Uma segunda cobranca controlada de R$ 1,00 foi criada com `redirect_url` local.
Apos o pagamento e a continuidade pelo Checkout, o callback trouxe
`capture_method`, `transaction_id`, `transaction_nsu`, `slug`, `order_nsu` e
`receipt_url`. Todos os valores identificadores foram removidos ou mascarados.

Fixture anonimizada:
`docs/product/infinitepay-checkout-callback-paid.fixture.json`.

O callback correlaciona e dispara verificacao, mas nao confirma pagamento por
si so. Ate existir autenticidade criptografica comprovada, ele e entrada externa
nao confiavel e produz no maximo `verification_pending`.

## Captura Real 006: Payment Check Positivo

Os identificadores capturados foram usados em
`POST https://api.checkout.infinitepay.io/payment_check`. A resposta real foi
HTTP 200 com `success=true`, `paid=true`, `amount=100`, `paid_amount=100`,
`installments=1` e `capture_method=pix`.

Fixture anonimizada:
`docs/product/infinitepay-payment-check-paid.fixture.json`.

O valor solicitado e pago foi R$ 1,00; portanto, nesta operacao observada,
`100` corresponde a 100 centavos de BRL. O dominio interno usa inteiro em
`minor_units` e nunca `float`.

Para o caminho positivo da PoC, `received` exige conjuntamente:

- resposta HTTP 200 de `payment_check`;
- `success=true` e `paid=true`;
- `capture_method=pix` e `installments=1`;
- `amount` e `paid_amount` iguais ao valor integral esperado;
- `order_nsu`, `transaction_nsu` e `slug` correlacionados a tentativa e a conta
  provider do tenant correto;
- estado interno elegivel e transicao idempotente.

Callback, `receipt_url` ou credito manual isolados nao autorizam `received`.
Divergencia de valor ou tenant segue para reconciliacao e nao emite
`payment.received`. A transicao e o evento outbox devem ocorrer na mesma
transacao PostgreSQL e produzir um unico efeito financeiro.

## Evidencia Externa Obrigatoria

Toda fixture InfinitePay deve registrar:

- URL/endpoint ou operacao de origem;
- identificador consultado, anonimizado quando necessario;
- data da captura;
- ambiente usado;
- campos removidos ou mascarados;
- ausencia revisada de segredo e PII desnecessaria.

Campo que nao apareceu em resposta real nao entra em DTO externo, contrato
definitivo ou tela. Documentacao isolada permite rascunho conceitual, nao fixture
nem afirmacao de suporte em producao.

## Politica De Segredos

- nao enviar senha, token, chave ou certificado pelo chat;
- nao persistir segredo no Git, fixture, log, attestation ou documento;
- guardar somente `secret_ref` no banco da aplicacao quando o provider usar
  segredo;
- tratar `handle`/InfiniteTag como identificador de conexao, nao como segredo;
- exigir autorizacao administrativa e auditoria para alterar a conta recebedora;
- marcar conexao como `unverified` ate existir evidencia de ownership adequada.

## Decisoes Humanas De Operacao E Negocio

Decisoes confirmadas em 2026-10-04:

### Conexao InfinitePay BYOA

- somente administrador autorizado do cliente configura a InfiniteTag;
- conexao nova ou alterada inicia como `unverified`;
- a validacao da PoC exige declaracao do administrador e cobranca real
  controlada de R$ 1,00, com confirmacao positiva por `payment_check`;
- toda troca registra auditoria, bloqueia novas cobrancas e exige revalidacao;
- revogacao/desativacao bloqueia novas cobrancas, mas preserva historico,
  consulta e reconciliacao;
- o Checkout observado usa a InfiniteTag como identificador publico e nao
  apresentou credencial secreta na operacao testada;
- se capability ou provider futuro exigir segredo, o servico persiste somente
  `secret_ref`, nunca o segredo em claro.

Essa validacao operacional e suficiente para a PoC, mas nao equivale a prova
criptografica de titularidade. Um mecanismo oficial de onboarding ou ownership
do provider continua requisito de hardening para producao, se disponibilizado.

### Termos Comerciais

- mensalidade do servico de pagamentos: negociada por contrato;
- percentual sobre recebimentos: negociado por contrato;
- base: valor bruto integral efetivamente confirmado como `received`;
- ciclo: mesmo ciclo mensal da assinatura;
- timezone: `America/Sao_Paulo`;
- vigencia: definida por contrato;
- cada cobranca referencia uma versao imutavel dos termos vigentes na criacao.

Nao existe percentual ou mensalidade global implicita. Para encerrar
PAY-S0-006, a primeira execucao foi classificada como PoC interna sem
faturamento comercial. Antes do primeiro tenant pagante, contrato concreto deve
registrar valores, inicio de vigencia, aprovador e versao imutavel dos termos.

### Disponibilidade E Recuperacao

- confirmacao Pix esperada em ate 2 minutos no fluxo normal;
- ultrapassar 2 minutos produz estado verificavel e reconciliacao posterior,
  nunca falha financeira presumida;
- RTO inicial: ate 4 horas;
- RPO para cobranca confirmada: zero; nenhuma confirmacao pode ser perdida;
- rate limits e comportamento de indisponibilidade do provider nao estao
  publicados; a fundacao usa configuracao conservadora e recalibravel.

Politica inicial aprovada para a fundacao, sujeita a configuracao por ambiente:

- webhook grava inbox duravel e responde HTTP 200 em menos de 1 segundo; HTTP
  400 e reservado a rejeicao intencional, pois a documentacao declara nova
  tentativa nesse caso;
- callback/webhook apenas dispara verificacao; nunca confirma `received`;
- `payment_check` inicia imediatamente quando os identificadores obrigatorios
  estiverem disponiveis;
- timeout HTTP total inicial de 5 segundos, com conexao limitada a 2 segundos;
- retries de `payment_check` usam jitter e backoff: 5, 15, 30 e 60 segundos;
- apos 2 minutos, a cobranca permanece verificavel em
  `pending_reconciliation`, com tentativas em 5, 15 e 30 minutos, 2, 6 e 24
  horas;
- apos 24 horas sem resposta conclusiva, nao inferir `failed` nem `expired`;
  manter para reconciliacao manual/on-demand ate existir semantica real do
  provider;
- sem `transaction_nsu` e `slug`, nao chamar `payment_check` com payload
  incompleto nem simular confirmacao;
- timeout na criacao do Checkout produz `creation_outcome_unknown`; nao repetir
  cegamente porque idempotencia do provider nao esta documentada;
- circuit breaker, concorrencia e rate limit por provider/account sao
  configuraveis; nenhum limite da InfinitePay e inventado enquanto nao houver
  documentacao ou medicao;
- RTO de 4 horas e RPO zero para cobrancas confirmadas permanecem objetivos da
  fundacao.

A frequencia acima limita consultas na PoC e nao representa rate limit oficial
da InfinitePay. Deve ser recalibrada por telemetria e contrato do provider.

### Volume E Capacidade Sob Incerteza

O usuario confirmou em 2026-10-04 que quantidade de clientes, cobrancas por
cliente, pico, ticket medio e mix futuro nao sao estimaveis neste momento.

```yaml
capacity_forecast:
  status: not_collected
  reason: produto_novo_sem_base_historica_ou_previsao_comercial_confiavel
  customers: null
  charges_per_customer_month: null
  peak_new_charges_per_minute: null
  average_ticket: null
  payment_method_mix: null
```

Valores ausentes nao significam zero e nao autorizam inventar capacidade. Isso
nao bloqueia a fundacao, desde que ela inclua:

- API stateless escalavel horizontalmente;
- workers escalaveis independentemente;
- concorrencia, polling e rate limits configuraveis;
- backpressure e filas duraveis para trabalho assincrono;
- metricas de throughput, latencia, backlog, erro e saturacao desde o inicio;
- benchmark reproduzivel dentro do container antes de producao;
- capacidade testada, limites operacionais e alertas registrados a partir de
  medicao real antes do primeiro rollout produtivo.

PAY-S0-007 fecha a pergunta de planejamento sem criar falsa precisao. O perfil
de carga medido continua gate de producao, nao gate para criar a fundacao.

### Minimizacao E Retencao

- JBoot nao armazena nome, CPF/CNPJ ou endereco do pagador nesta capability;
- o registro financeiro guarda somente identificadores tecnicos opacos,
  tenant, referencia da cobranca, valores, estados, timestamps e trilha de
  auditoria estritamente necessarios;
- retencao proposta: 5 anos;
- prazo, fundamento legal, descarte e eventuais obrigacoes superiores dependem
  de revisao juridica e contabil antes de producao.

## Saida Do Gate

Somente depois de todos os itens bloqueantes resolvidos:

1. confirmar encerramento da Sprint 0;
2. criar `implementations/svc-jboot-payments` no worktree existente;
3. criar `PROJECT_CONTRACT.md` com lifecycle `planned`;
4. criar agents/skills locais;
5. executar `dev-runtime-profile` e `security-checklist`;
6. materializar fundacao Go, PostgreSQL e testes dentro do container;
7. implementar adapter somente contra payloads reais.

## Pendencias Nao Bloqueantes Para A PoC

- segundo consumidor;
- segundo provider;
- Asaas versus Efi para boleto;
- InfiniteTap;
- cartao;
- devolucao, desde que nao declarada suportada na PoC;
- formato final do demonstrativo;
- smart routing e split.
