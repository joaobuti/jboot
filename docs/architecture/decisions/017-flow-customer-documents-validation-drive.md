# ADR 017: Documentos Da Ficha Do Cliente, Validacao Por Agente Claude E Pasta Drive Por CPF/CNPJ

```yaml
date: 2026-10-16
status: accepted
decision_owner: human
human_confirmation: approved
confirmed_at: 2026-10-16
project: implementations/bff-jboot-platform
modules: [modules/kanban, modules/establishment-customers]
consumer: implementations/app-jboot-next-platform/modules/kanban
deployment_boundary: embedded_module
stack_decision: inherited_from_host
sprint_artifact: docs/product/flow-customer-documents-sprints.md
relates_to:
  - docs/architecture/decisions/015-flow-shared-customers-drive-ai-boundaries.md
  - docs/architecture/decisions/016-flow-drive-oauth-per-client-via-ui.md
```

## Contexto

O contratante quer anexar documentos na ficha cadastral do cliente, pedir a um
agente Claude que valide esses documentos por um botao proprio e, apos a
validacao, replicar os documentos no Google Drive da empresa numa pasta
identificavel. Hoje a ficha nao tem anexos, o CPF e opcional, o modo rotina
nao le arquivos e a replica Drive so conhece peticoes aprovadas em caminhos
por UUID.

## Decisoes

1. Anexos da ficha pertencem ao Kanban (fachada Flow de clientes), com MinIO
   canonico e metadados no banco do tenant. `establishment-customers` continua
   dono apenas do nucleo cadastral (ADR 015).
2. CPF ou CNPJ e obrigatorio na fachada do Flow. A tabela compartilhada com o
   PDV nao muda; clientes sem documento ficam bloqueados para validacao.
3. A validacao usa agente `claude_routine` disparado por botao, fora dos
   gatilhos do Kanban, reutilizando o gateway e o conector MCP. O conector
   ganha tools de leitura da ficha e dos documentos e uma tool de parecer
   presa ao `runId`.
4. O parecer do agente e nao confiavel e nao altera estado. Somente a
   confirmacao humana marca o cliente como `validado`, mantendo a regra de que
   resposta de IA nao aprova nada sozinha.
5. A replica Drive (por empresa, ADR 016) ganha a origem `customer_document` e
   passa a gravar em `<raiz>/<CPF|CNPJ so digitos>/`, inclusive para novas
   peticoes aprovadas. Itens ja replicados nao sao movidos.
6. (Substituida para a etapa de validacao pela ADR 018: cada escritorio valida
   na propria conta Claude; a conta central vira reserva.) Destino central por contratante: a validacao sempre executa com o agente
   da empresa em nome da identidade central (assinatura Claude e GitHub dessa
   conta), qualquer que seja o funcionario que clicou; quem clicou fica
   registrado no run e na auditoria. O Drive tambem e unico por empresa.
7. Leitura de documento pelo conector nao aplica mascaramento de CPF e exige
   aceite especifico do gestor na politica do conector.

## Alternativas Rejeitadas

- Agente por chave de API: exigiria envio multimodal no gateway e cobranca por
  token; preterido pela decisao de usar a assinatura.
- Confirmacao automatica pelo parecer: violaria a regra de IA sem autoridade
  de aprovacao e enviaria documento ao Drive sem revisao.
- Pastas por UUID: ilegiveis para o contratante.

## Consequencias

- Documentos pessoais passam pela conta Claude do usuario; o aceite do gestor
  e o registro de auditoria sem conteudo sao obrigatorios.
- CPF/CNPJ aparece no nome da pasta no Drive do proprio contratante.
- A rotina depende de conector publico em HTTPS para operar.
- A S0 depende de integrar a ADR 016 na `main`.
