# ADR 018: Validacao Pela Conta Claude Do Escritorio

```yaml
date: 2026-10-21
status: accepted
decision_owner: human
human_confirmation: approved
confirmed_at: 2026-10-21
project: implementations/bff-jboot-platform
modules: [modules/kanban]
consumer: implementations/app-jboot-next-platform/modules/kanban
deployment_boundary: embedded_module
stack_decision: inherited_from_host
sprint_artifact: docs/product/flow-customer-documents-sprints.md
supersedes_partially: docs/architecture/decisions/017-flow-customer-documents-validation-drive.md (decisao 6, etapa de validacao)
relates_to:
  - docs/architecture/decisions/017-flow-customer-documents-validation-drive.md
```

## Contexto

O contratante informou que cada escritorio tem a propria assinatura Claude Pro e
que a etapa inicial (validar os documentos obrigatorios do cliente) roda na conta
do escritorio. So a etapa seguinte, a analise das acoes possiveis (coluna
"Analise de Acoes" do quadro), roda na conta principal da empresa. A ADR 017
mandava toda validacao para uma unica conta central.

## Decisao

1. **Responsavel do escritorio**: marcacao por vinculo usuario-escritorio
   (`kanban_user_offices.is_responsible`), feita pelo `flow:admin`. Pode haver
   mais de um. E com o usuario responsavel que o conector do Flow e autorizado na
   conta Claude do escritorio.
2. **Rotina por escritorio**: o `flow:admin` (visao de todos os escritorios)
   cadastra o agente de rotina com URL e token da conta Claude de cada escritorio e
   indica o escritorio (`kanban_customer_validation_office_settings`). O agente e
   do `flow:admin` no gateway.
3. **Envio**: cliente com um escritorio vai direto para a rotina dele; com
   varios, quem pede escolhe entre os escritorios do cliente que enxerga.
   Escritorio sem rotina propria e cliente sem escritorio usam a conta principal
   (configuracao da ADR 017, agora "reserva").
4. **Parecer**: run de escritorio (`kanban_customer_validation_runs.office_id`) so
   aceita parecer de um responsavel daquele escritorio; run da conta principal, so
   da identidade central. Uma conta nao responde por outro escritorio.
5. **Aprovacao humana**: confirmar o parecer exige a permissao nova
   `flow:validation:approve` ("Aprovar parecer da validacao"), atribuida na tela de
   Permissoes; quem tem `flow:admin` recebe por padrao (migration 094).
6. **Conta principal le o cliente do card**: a rotina da automacao de coluna da
   conta principal (ex.: "Analise de Acoes") ganha `flow_get_card_customer` e
   `flow_get_card_customer_document`. So na execucao `dispatched` do dono da regra,
   no card dela, com card visivel ao dono, e so documentos da ultima validacao
   aprovada por uma pessoa. Exigem o aceite de documentos do conector, cujo texto
   passa a citar "contas Claude dos escritorios e da empresa".

## Consequencias

- Cada escritorio precisa de um responsavel com o conector autorizado na conta
  Claude do escritorio; a tela de configuracao alerta escritorio sem responsavel.
- Os documentos pessoais passam a ir para varias contas Claude (uma por
  escritorio, mais a principal nas automacoes), sob o mesmo aceite da empresa.
- Fluxos alem da validacao continuam na conta principal: as regras de automacao
  disparam a rotina de quem criou a regra.
- Tokens emitidos antes da migration 094 nao trazem a permissao nova; o usuario
  precisa entrar de novo.

## Alternativas Rejeitadas

- Admin como executor de todas as contas: mais simples, mas o Flow nao
  distinguiria qual conta respondeu por qual escritorio.
- Usuario tecnico por escritorio: substituido pela marcacao de responsavel, que
  usa as pessoas reais do escritorio.
