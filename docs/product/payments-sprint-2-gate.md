# Payments Sprint 2 Gate: InfinitePay Checkout Pix no PDV

```yaml
date: 2026-10-05
status: approved
human_confirmation: approved
execution_mode: cross_project
target_projects:
  - implementations/svc-jboot-payments
  - implementations/bff-jboot-platform
  - implementations/app-jboot-next-platform
target_module: modules/pdv
provider: infinitepay
capability: checkout_pix
```

## Fluxo Congelado

1. No caixa web, selecionar `PIX` inicia uma cobranca integrada; nao registra
   pagamento manual confirmado.
2. O browser chama somente o BFF do PDV.
3. O BFF cria uma cobranca idempotente no Payments e devolve a URL hospedada
   do Checkout.
4. Callback/webhook e retorno do browser sao sinais nao confiaveis. Eles
   registram os identificadores observados e disparam verificacao.
5. Somente `payment_check` positivo, integral, Pix e correlacionado muda a
   cobranca para `received`.
6. O BFF materializa uma unica linha confirmada em `pdv_sale_payments` quando
   consulta a cobranca como `received`; antes disso a venda continua aberta.
7. Dinheiro, cartao e `outro` preservam o fluxo manual vigente.

## Contratos E Dados

- dinheiro externo e interno em integer minor units no Payments;
- conversao decimal do PDV para centavos ocorre uma vez no BFF;
- `client_id` vem do contexto autenticado e nunca do body;
- idempotencia ponta a ponta usa venda + tentativa Pix;
- DTO do consumidor permanece provider-neutral;
- handle, callback bruto, API key e token nao aparecem em logs;
- nome, CPF/CNPJ, email, telefone e endereco do pagador nao sao enviados nem
  persistidos nesta sprint;
- fixtures externas sao exclusivamente as respostas reais anonimizadas em
  `docs/product/infinitepay-*.fixture.json`.

## Superficie HTTP Planejada

Payments:

- `PUT /v1/provider-connections/infinitepay` exige declaracao explicita do
  administrador sobre a cobranca real de R$ 1,00, audita a troca, desabilita a
  conexao anterior e registra a nova como `verified` somente para esta PoC;
- `GET /v1/provider-connections/infinitepay` retorna somente metadados seguros;
- `POST /v1/charges` aceita `paymentMethod=pix` e cria Checkout quando existe
  conexao verificada;
- `GET /v1/public/infinitepay/callback/{chargeId}` registra o redirect real
  observado e dispara verificacao; webhook fica fora ate captura real;
- `POST /v1/charges/{chargeId}/verify` executa `payment_check` controlado;
- `GET /v1/charges/{chargeId}` retorna status e URL do Checkout quando segura.

PDV:

- `POST /pdv/sales/{saleId}/payments/pix` inicia o Checkout;
- `GET /pdv/sales/{saleId}/payments/pix/{chargeId}` consulta e sincroniza o
  estado, confirmando localmente uma unica vez.

## Criterios De Aceite

- selecionar Pix na UI entra no fluxo integrado;
- retry com a mesma chave nao cria segunda cobranca ou pagamento local;
- venda nao pode ser concluida enquanto o Pix estiver pendente;
- callback isolado nunca confirma pagamento;
- divergencia de valor, metodo ou correlacao vai para reconciliacao;
- timeout de criacao vira resultado incerto, sem retry cego;
- tenant nao le conexao, charge ou pagamento de outro tenant;
- troca de InfiniteTag bloqueia novas cobrancas ate revalidacao;
- o formulario nao permite configurar ou trocar InfiniteTag sem nova
  declaracao administrativa;
- testes de contrato usam as fixtures reais e anonimizadas;
- grafo HTTP nao apresenta drift;
- testes, type-check e build executam dentro do container.

## Fora De Escopo

- cartao via Checkout, InfiniteTap, boleto, split, estorno e segundo provider;
- app mobile/offline;
- declaracao `production_ready`;
- segredo real, handle real ou ativacao de cliente em arquivos versionados;
- assinatura de webhook, rate limit ou SLA nao comprovados pela fonte.

## Bloqueios De Producao Preservados

- autenticidade/replay do webhook;
- estados negativos e excepcionais reais;
- expiracao, cancelamento, devolucao e settlement;
- revisao juridica/contabil e LGPD;
- contrato do primeiro tenant pagante;
- benchmark, envelope de capacidade e alertas;
- hardening multi-conta BYOA.
- comprovacao automatizada da cobranca de validacao; nesta PoC a evidencia e a
  declaracao auditada do administrador, sustentada pelo teste real ja executado.
