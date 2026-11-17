# ADR 012: InfinitePay Como Provider Piloto

```yaml
date: 2026-10-04
status: accepted
decision_owner: human
project: implementations/svc-jboot-payments
first_consumer: pdv
first_provider: infinitepay
account_model: byoa_per_tenant
fund_flow: provider_direct_to_tenant
jboot_custody_of_funds: false
poc_capability: checkout_pix
poc_capability_status: confirmed_by_human
production_readiness: blocked
```

## Contexto

Cada cliente JBoot deve receber em sua propria conta no provider. O JBoot
inicia e acompanha a cobranca, mede o valor recebido e fornece fatos auditaveis
para a cobranca comercial no ciclo seguinte, sem receber, custodiar, dividir ou
repassar os fundos do cliente.

A documentacao oficial apresentada pelo usuario confirma dois produtos
tecnicamente distintos:

- Checkout: criacao HTTP de link, `order_nsu`, redirecionamento, webhook e
  consulta `payment_check`, com Pix e cartao;
- InfiniteTap: cartao presencial por aplicativo InfinitePay, iniciado e
  concluido por deep links.

Fontes consultadas em 2026-10-04:

- <https://www.infinitepay.io/checkout-documentacao>
- <https://www.infinitepay.io/checkout-tap#codeSetupBlock>

## Alternativas

| Alternativa | Fit com o PDV atual | Decisao |
|---|---|---|
| InfinitePay Checkout Pix | HTTP/webhook/consulta server-side; compativel com o PDV web e nao processa cartao no JBoot | Escolhida e confirmada pelo usuario para a PoC |
| InfinitePay Checkout cartao | Mesmo canal HTTP, mas adiciona chargeback, antifraude e due diligence de cartao | Adiada |
| InfiniteTap | Exige app InfinitePay, deep link e `result_url`; o runtime atual do PDV nao inclui app mobile | Rejeitada para a PoC atual |
| Asaas/Efi | Bons candidatos para boleto e redundancia | Adiados para novo gate |

## Decisao

InfinitePay e o primeiro provider do servico. A integracao usa BYOA por tenant:

- cada tenant possui sua propria conta InfinitePay;
- o destino financeiro e identificado pela conexao do tenant;
- o segredo, quando existir, e resolvido por referencia a secret store;
- login e senha do provider nunca sao solicitados ou armazenados pelo JBoot;
- o PDV nunca recebe credenciais nem campos privados do provider;
- o contrato do consumidor permanece provider-neutral.

Na documentacao publica do Checkout, a `handle`/InfiniteTag identifica a conta
recebedora e nao ha API key documentada. No InfiniteTap, a sessao pertence ao
aplicativo InfinitePay e `handle`/`doc_number` apenas conferem a conta esperada.
Por isso, a configuracao canônica se chama `provider connection`, e nao assume
que todo provider usa credenciais secretas.

Na PoC, somente administrador autorizado do tenant pode configurar a conexao.
Uma conexao nova ou alterada permanece `unverified` e bloqueia novas cobrancas
ate declaracao do administrador, cobranca controlada de R$ 1,00 e verificacao
positiva por `payment_check`. Toda troca e auditada e exige revalidacao.
Desativar a conexao impede novas cobrancas sem apagar historico ou interromper
consulta e reconciliacao das cobrancas existentes.

## Evidencias Confirmadas

| Capacidade | Situacao |
|---|---|
| Criar Checkout | Confirmada por `POST /links` |
| Correlacionar pedido | Confirmada por `order_nsu` |
| Consultar pagamento | Confirmada por `POST /payment_check` |
| Receber notificacao | Webhook documentado, com nova tentativa apos HTTP 400 |
| Pix no Checkout | Confirmado pelo `capture_method` documentado |
| Integracao com sistemas/PDV | Confirmada explicitamente para InfiniteTap |
| Conta propria do cliente | Confirmada para o fluxo InfiniteTap; Checkout identifica recebedor por handle |

## Gaps Que Permanecem

- autenticacao ou assinatura criptografica do webhook;
- sandbox/homologacao formal;
- idempotencia garantida pelo provider na criacao;
- rate limits e SLA de API;
- quantidade, intervalo e duracao das retentativas;
- API de estorno/devolucao;
- API de extrato/listagem para reconciliacao em lote;
- contrato comercial para automacao SaaS multiempresa e taxa Pix aplicavel;
- boleto por API;
- onboarding e comprovacao criptografica/oficial de ownership da conexao BYOA.

Em 2026-10-04, o usuario informou que criou a conta InfinitePay e a conectou ao
aplicativo. Na mesma data, forneceu a InfiniteTag fora dos artefatos
versionados. Isso confirma a existencia da conta merchant, o acesso ao app e a
disponibilidade do identificador, mas nao comprova isoladamente Checkout Pix
habilitado, ambiente controlado, payload real, ownership ou autenticacao de
integracao. O valor real da InfiniteTag nao deve ser persistido no repositorio.

Uma chamada controlada de criacao em 2026-10-04 confirmou que o endpoint e a
conta sao alcançaveis, mas retornou `external_checkout_not_enabled`. A
capability precisa ser habilitada pelo titular antes da proxima captura. Essa
resposta real nao autoriza inferir sucesso de criacao ou pagamento.

Apos a habilitacao, uma segunda chamada controlada de R$ 1,00 retornou HTTP 200
e uma URL real de Checkout. O token vivo do link nao foi persistido no
repositorio.

O primeiro QR falhou enquanto a conta nao possuia chave Pix. Depois do cadastro
da chave, o titular concluiu o pagamento e confirmou manualmente o credito de
R$ 1,00. Uma consulta `payment_check` somente com `handle` e `order_nsu`
retornou `success=false`. Uma segunda cobranca com callback controlado capturou
`transaction_nsu`, `slug`, `transaction_id`, `order_nsu` e `receipt_url`. Com os
identificadores completos, `payment_check` retornou HTTP 200, `success=true`,
`paid=true`, `amount=100`, `paid_amount=100`, `installments=1` e
`capture_method=pix`. Os identificadores reais foram removidos das fixtures.

O valor solicitado e pago foi R$ 1,00, fechando para essa operacao observada o
mapeamento de `100` para 100 centavos de BRL. O core usa inteiro em
`minor_units`, nunca `float`.

Ausencia de documentacao significa `unsupported` ou `unverified`; nunca autoriza
inventar DTO, estado, header, assinatura ou comportamento.

## Regra De Confirmacao

Enquanto autenticidade criptografica do webhook nao for comprovada, callback ou
webhook e apenas sinal. Ele pode produzir `verification_pending`, mas nunca
`received` isoladamente.

No caminho positivo Checkout Pix comprovado, `received` exige `payment_check`
HTTP 200 com `success=true`, `paid=true`, `capture_method=pix`,
`installments=1`, `amount` e `paid_amount` iguais ao valor integral esperado, e
identificadores correlacionados a tentativa e a conta provider do tenant. A
transicao e a emissao idempotente de `payment.received` devem ocorrer na mesma
transacao PostgreSQL. Valor ou tenant divergente segue para reconciliacao.

`receipt_url` e a verificacao manual de credito sao evidencias auxiliares; nao
participam da decisao automatica. Esta regra comprova recebimento no provider,
nao settlement bancario definitivo nem irreversibilidade.

Toda fixture externa deve vir de resposta real, ser anonimizada e registrar
endpoint/operacao, identificador consultado e data da captura. Segredos e dados
pessoais desnecessarios nao entram em fixture, log, documento ou commit.

## Consequencias

- InfinitePay e escolhido como provider piloto, mas nao declarado pronto para
  producao;
- Checkout e InfiniteTap sao capabilities independentes dentro do adapter;
- a PoC confirmada valida apenas Checkout Pix;
- o caminho positivo `awaiting_payment -> received` esta comprovado por consulta
  server-to-server e pode originar fixture/teste de contrato;
- InfiniteTap exige novo gate quando houver produto/runtime mobile aprovado;
- boleto permanece responsabilidade de adapter futuro Asaas, Efi ou API
  bancaria comprovada;
- o projeto Go somente pode ser materializado apos o gate da Sprint 0.
