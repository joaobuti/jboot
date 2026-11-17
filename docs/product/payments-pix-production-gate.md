# Payments PIX Production Gate

```yaml
date: 2026-10-05
status: approved
implementation_status: completed
activation_status: blocked_by_external_dependencies
human_confirmation: approved
priority: total_before_boleto
execution_mode: cross_project
target_projects:
  - implementations/svc-jboot-payments
  - implementations/bff-jboot-platform
  - implementations/app-jboot-next-platform
provider: infinitepay
```

## Decisoes Confirmadas

- callback, redirect e webhook sao sinais nao autenticados;
- somente `payment_check` positivo e correlacionado confirma `received`;
- webhook duplicado ou repetido deve ser idempotente e auditavel;
- pendencias sao reconciliadas por worker com backoff e sem retry cego;
- cobranca antiga permanece reconciliavel e nunca vira nao paga definitiva por
  inferencia local;
- devolucao e registrada e auditada no JBoot, mas executada manualmente no app
  InfinitePay ate existir API oficial capturada;
- liquidacao nao e inferida de `paid`; conciliacao de settlement permanece
  operacional ate existir fonte oficial;
- boleto fica bloqueado ate o fechamento terminal deste gate;
- dominio HTTPS publico pode ser definido depois, mas bloqueia ativacao real.

## Entregaveis

- endpoint webhook POST com body limitado, deduplicacao e resposta rapida;
- rate limit para endpoints publicos;
- ledger redigido de sinais externos, sem payload bruto ou PII;
- reconciliacao concorrente segura no worker, backoff e limite de tentativas;
- estados/diagnosticos operacionais para divergencia e resultado incerto;
- solicitacao, confirmacao e falha de devolucao manual com idempotencia;
- endpoints BFF e painel web para pendencias/devolucoes;
- metricas de sinal, verificacao, reconciliacao e devolucao;
- validacao de configuracao produtiva, runbook, testes de carga e restore;
- remediacao dos advisories criticos alcancaveis nos projetos afetados;
- checklist de seguranca, attestation, grafo HTTP e runtime aprovados.

## Criterios De Aceite

- callback/webhook falsificado nunca confirma pagamento;
- o mesmo sinal repetido nao multiplica processamento ou fatos financeiros;
- duas instancias do worker nao reivindicam a mesma reconciliacao;
- falha do provider preserva a cobranca e agenda nova tentativa com limite;
- pagamento tardio ainda pode transicionar uma unica vez para `received`;
- devolucao total/parcial nunca excede o recebido e exige acao auditada;
- segredo, InfiniteTag, PII e payload externo bruto nao aparecem em logs;
- painel operacional e isolado por tenant e protegido por scope administrativo;
- health/readiness, backup/restore e carga possuem evidencia reproduzivel;
- nenhum item bloqueante do checklist permanece aberto para ativacao.

## Fora De Escopo

- boleto, cartao, TEF, split e segundo provider;
- automacao de devolucao sem API oficial real;
- inferencia de settlement a partir de confirmacao de pagamento;
- custodia ou repasse de valores pelo JBoot.

## Bloqueios Externos De Ativacao

- dominio HTTPS publico e roteamento produtivo;
- revisao juridica, contabil e LGPD;
- contrato e rollout do primeiro tenant pagante;
- qualquer autenticacao de webhook futura ainda nao documentada pela InfinitePay.

## Evidencia De Conclusao Tecnica

- API/worker Go, BFF e painel web implementados e testados em 2026-10-05;
- webhook e callback permanecem sinais; `payment_check` e a unica confirmacao;
- reconciliacao concorrente, backoff, metricas e operacao tenant-safe ativos;
- estorno manual total/parcial possui idempotencia, teto e auditoria de operador;
- migration 003, health/readiness, carga local e restore isolado aprovados;
- Go sem vulnerabilidade chamada; Next 16.3.6 sem advisory critico;
- checklist: `docs/security/payments-pix-production-security-checklist.md`.

O trabalho implementavel de PIX esta concluido. Os itens acima classificados
como externos impedem somente a ativacao produtiva, nao representam codigo PIX
pendente. Boleto permanece fora desta entrega e requer decisao explicita para
iniciar a Sprint 3.
