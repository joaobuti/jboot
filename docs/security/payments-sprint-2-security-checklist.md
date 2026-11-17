# Payments Sprint 2 Security Checklist

```yaml
date: 2026-10-05
scope: infinitepay_checkout_pix_poc_pdv_web
target_projects:
  - implementations/svc-jboot-payments
  - implementations/bff-jboot-platform
  - implementations/app-jboot-next-platform
review_status: passed_for_poc_scope
open_checklist_decisions: 0
production_readiness: blocked
```

O checklist aprova a PoC controlada. Nao autoriza deploy publico, ativacao de
tenant pagante nem classifica qualquer projeto como `production_ready`.

## Injection E Validacao

- [x] SQL novo usa parametros posicionais e migrations estaticas.
- [x] DTOs rejeitam formato invalido; `client_id`, provider, status e evidencia
  interna nao podem ser definidos pelo browser.
- [x] InfiniteTag aceita somente caracteres allowlisted e e normalizada.
- [x] Respostas externas sao decodificadas em contratos explicitos; nenhum
  payload externo e executado ou interpolado em comando/SQL.

## Autenticacao, Autorizacao E Tenant

- [x] Browser chama apenas o BFF autenticado; Payments exige JWT s2s com
  audience `svc:payments` e caller allowlisted.
- [x] Rotas PDV exigem scopes de leitura/escrita e derivam tenant do JWT.
- [x] Charges, conexoes e pagamentos locais incluem isolamento por tenant.
- [x] Callback usa UUID opaco de charge, apenas registra sinal e nunca confirma
  dinheiro sem `payment_check` positivo e correlacionado.

## Dinheiro, Idempotencia E Estado Externo

- [x] Payments usa integer minor units; conversao decimal ocorre uma vez no BFF.
- [x] Criacao possui chave idempotente; retry nao cria segunda cobranca nem
  segunda linha em `pdv_sale_payments`.
- [x] Timeout de criacao vira resultado incerto, sem retry cego.
- [x] Valor, metodo, parcelas e referencia sao comparados antes de `received`;
  divergencia segue para reconciliacao.
- [x] Callback/redirect isolado nao e fonte de verdade.

## Dados Sensiveis E BYOA

- [x] Nenhum nome, documento ou endereco do pagador e enviado ou persistido.
- [x] API key nao e aceita pela UI; somente `secret_ref` pode ser armazenada.
- [x] InfiniteTag, token, callback bruto e segredo nao entram em logs.
- [x] Configuracao/troca exige declaracao administrativa explicita, desabilita
  a conexao anterior e registra auditoria.
- [x] Evidencia automatica da cobranca de R$ 1,00 nao foi inventada: a PoC usa
  declaracao auditada, e a automacao continua bloqueio de producao.

## HTTP Externo E SSRF

- [x] Adapter usa HTTPS, host base configurado pelo operador e validado contra
  allowlist; URL do consumidor nunca seleciona destino HTTP.
- [x] Timeout e cliente dedicado limitam chamadas ao provider.
- [x] Checkout URL recebida e devolvida apenas como link externo com
  `noopener noreferrer`; nao e buscada pelo backend.

## Dependencias E Runtime

- [x] Go race tests, vet e build passaram no container, incluindo PostgreSQL.
- [x] BFF e frontend passaram testes, type-check e build no container.
- [x] Audit registrou zero critical no BFF; os 8 achados de producao sao
  preexistentes e nao foram introduzidos por esta sprint.
- [x] Audit do frontend encontrou 2 critical e demais achados preexistentes,
  incluindo Next 16.1.6; a disposicao e bloquear producao e tratar o upgrade
  transversal em change dedicado, pois esta sprint nao alterou dependencias ou
  lockfile. Isso e risco fechado por bloqueio, nao aceite para producao.
- [x] `code-up:pdv` sobe Payments API/worker como dependencias obrigatorias;
  health e readiness responderam com sucesso.

## Bloqueios De Producao

- autenticidade/replay e contrato real de webhook;
- comprovacao automatizada da validacao BYOA e gestao real do cofre;
- expiracao, cancelamento, devolucao, settlement e estados negativos reais;
- rate limiting publico, alertas, benchmark e envelope de capacidade;
- revisao juridica/contabil/LGPD e contrato do primeiro tenant pagante;
- remediacao dos advisories de runtime do BFF/frontend em change dedicado;
- `PAYMENTS_PUBLIC_BASE_URL` publico HTTPS e configuracao operacional real.
