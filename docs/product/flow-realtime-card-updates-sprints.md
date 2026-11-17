# Flow — Atualizacao Em Tempo Real Do Que A IA Grava No Card

```yaml
target_project: implementations/bff-jboot-platform + implementations/app-jboot-next-platform
target_module: modules/kanban
lifecycle_status: in_development
branch: feature/flow-realtime-card-updates (a partir da main 6d43128bb)
```

## Pedido (2026-10-29)

Quando a IA termina uma operacao e grava no Flow (comentario, Analise de Acoes, peticoes, validacao
do cliente com campos preenchidos), a tela so mostra o resultado depois de recarregar a pagina. O
usuario aprovou a proposta: o Flow avisa a tela e ela recarrega sozinha so o que mudou.

## PE Decision

- Deployment Boundary Gate: mesmo modulo `kanban`, mesmo processo do BFF e do app Platform; usa o
  canal Socket.IO que ja existe (`/flow/ws`, `KanbanGateway`), hoje com `card.moved` e
  `notification.created`. Sem runtime, dependencia ou servico novo. Stack Fit Gate: nao se aplica.
- Fonte unica dos avisos de card: toda atividade gravada no card (`ActivitiesRepository`: comentario,
  evento de sistema, comentario e pedido de revisao da IA). Todo resultado da IA no card ja grava uma
  atividade; centralizar ai cobre os caminhos atuais e os futuros sem lembrar de avisar em cada servico.
- Barramento em memoria (`FlowLiveEvents`, RxJS) entre repositorio e gateway: o repositorio nao
  depende do gateway (evita dependencia circular) e o aviso sai depois do INSERT confirmado.
- Validacao do cliente (`connectorSubmit`) grava campos na ficha sem atividade no card: avisa o
  cliente; o gateway repassa como `card.updated` aos cards vinculados e como `customer.updated` a
  tela de clientes.
- Visibilidade: `card.updated` segue a regra do `card.moved` (card visivel e coluna visivel pelo
  perfil). `customer.updated` leva so o id do cliente para a sala do tenant; a tela busca pelo HTTP,
  que aplica a visibilidade da ficha. Nenhum aviso leva conteudo, so ids e o tipo do evento.
- Tela: o board recarrega os cards (com espera curta para juntar avisos seguidos); o modal do card
  aberto recarrega historico, cliente, Analise de Acoes, peticoes e documentos sem desmontar; a tela
  de clientes recarrega a ficha aberta.

`sprint_artifact`: este arquivo. `sprint_gate`: testes no container, type-check/build do app,
`make ai-api-graph-gate` e `make ai-architecture-graph-gate`, smoke com uma rotina real.
`open_questions`: nenhuma bloqueante. `blocking_status`: liberado (pedido do usuario em 2026-10-29).

## Sprint R1: Avisos card.updated E customer.updated

> Status: `concluida` (2026-10-29). Conferencia visual no navegador com uma rotina real pendente.

Entregaveis:

- BFF: `realtime/flow-live-events.ts`; `ActivitiesRepository` publica `card` a cada atividade gravada;
  `CustomerValidationService.connectorSubmit` publica `customer`; `KanbanGateway` entra o socket na sala
  do tenant e emite `card.updated` `{ boardId, cardId, kind }` e `customer.updated` `{ customerId, kind }`.
- Web: `BoardView` recarrega os cards e repassa o aviso ao `CardModal`; o modal recarrega os paineis do
  card aberto; `FlowCustomersPage` recarrega a ficha aberta.

Criterios de aceite:

- comentario, peticoes, Analise de Acoes e conclusao da IA aparecem no card aberto sem recarregar;
- campos preenchidos pela validacao aparecem no painel Cliente do card e na ficha aberta em Clientes;
- quem nao ve o card (escritorio, coluna pelo perfil, fora do quadro) nao recebe `card.updated`;
- aviso de outro tenant nunca chega.

UIUX Decision (ui-ux.md): `scenario_classification: covered_by_template`. Sem tela nova: os paineis que ja
existem recarregam sozinhos, sem voltar ao "carregando"; o historico recarrega sem remontar, para nao
perder o comentario em digitacao; o formulario do card so volta ao valor salvo quando troca o card aberto.

Evidencias (2026-10-29, no container): BFF type-check, lint, build e 840 testes (838 passam, 2 ignorados ja
existentes), com PostgreSQL real para `card.updated` so a quem ve o card (escritorio A sim, B nao, sem
escritorio nao, outro tenant nao) e `customer.updated` repassado aos cards vinculados; Web type-check,
lint (0 erro), 178 testes e `next build`; `make ai-check` aprovado. Smoke no BFF em execucao: socket no
board do Salim recebeu `card.updated` (`kind: comment`) 96 ms depois do comentario gravado pelo HTTP.

## Debitos Conhecidos

- Com mais de uma instancia do BFF, o Socket.IO precisa de adapter compartilhado (Redis/Valkey) para os
  avisos chegarem a quem esta conectado em outra instancia; vale tambem para o `card.moved` atual.
