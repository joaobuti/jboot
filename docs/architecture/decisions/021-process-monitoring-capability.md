# ADR 021: Acompanhamento De Processos Como Capacidade Independente

```yaml
date: 2026-11-08
status: accepted
decision_owner: human
human_confirmation: approved
confirmed_at: 2026-11-08
project: implementations/bff-jboot-platform
modules: [modules/process-monitoring, modules/juridico, modules/kanban, modules/domain-integrations]
worker: implementations/wrk-jboot-juridico
deployment_boundary: embedded_module
stack_decision: inherited_from_host
supersedes_partially:
  - 010-juridico-data-monitoring (dono do estado do acompanhamento)
  - docs/product/juridico-datajud-flow-sprints.md, decisao de 2026-09-09 "Monitoramento e marcado no Flow, executado no juridico"
sprint_artifact: docs/product/process-monitoring-sprints.md
```

## Contexto

O acompanhamento DataJud de um processo (cadastro do acompanhamento, execucoes,
ultimo retrato do processo, movimentacoes e eventos) vive no modulo Juridico,
no banco do Juridico do cliente. O Flow usa esse acompanhamento em tres pontos,
sempre pelo Juridico:

- acao Monitorar da peticao protocolada (`domain-integrations/monitoring`);
- importacao de processos por planilha (`domain-integrations/process-import`);
- toggle Monitorar do card exportado do Juridico (Sprint 7 de
  `juridico-datajud-flow-sprints.md`).

Consequencia: para monitorar no Flow, o cliente precisa contratar o Juridico e
cada usuario precisa de entitlement `juridico:read`. O Juridico passa a aparecer
no seletor pos-login de quem so usa o Flow. Isso contraria a ADR 006: quem usa
algo como servico depende de capacidade contratada pelo cliente, nao de acesso
individual a outro produto.

A decisao de 2026-09-09 partia do caso em que o card vinha do Juridico e o
usuario ja tinha o Juridico. O Monitorar das peticoes e a importacao estenderam
o uso para processos que nascem no Flow, e a premissa deixou de valer.

Ja sao independentes e permanecem como estao:

- `svc-jboot-juridico-data`: consulta DataJud, sem estado (ADR 009);
- `wrk-jboot-juridico`: agenda as consultas no Temporal e dispara o BFF (ADR 010).

## Premissas Do Produto

Confirmadas pelo usuario em 2026-11-08.

- Juridico e Flow sao produtos separados que podem se comunicar.
- Cenario 1 (so Juridico): consultar um processo e acompanhar no Juridico.
- Cenario 2 (so Flow): processo nascido de lead no CRM, acompanhado no Flow.
- Cenario 3 (os dois): ao exportar para o Flow, o usuario pode optar por
  acompanhar pelo Flow. A transferencia fica para depois da primeira entrega.
- O mesmo processo do mesmo cliente nao pode ser acompanhado duas vezes.

## Alternativas Avaliadas

| Alternativa | Beneficio | Risco | Decisao |
|---|---|---|---|
| Manter no Juridico e liberar entitlement | Nenhuma mudanca | Flow depende de contratar outro software; Juridico no seletor | Rejeitada |
| Cada produto com acompanhamento no proprio banco | Isolamento por produto | Unicidade por cliente e processo entre dois bancos exige coordenacao fragil | Rejeitada |
| Tabela de assinantes (os dois produtos recebem) | Reuso total | Contraria a premissa de um unico acompanhamento por processo; mais estado | Rejeitada |
| Servico novo com deploy proprio | Fronteira fisica | Novo runtime, autenticacao S2S, deploy e Stack Fit Gate sem consumidor fora do BFF | Rejeitada agora |
| Modulo do BFF com banco proprio, origem e destino | Unicidade garantida pelo banco; sem runtime novo; extraivel depois | Exige disciplina de fronteira | Escolhida |

## Decisao

### Capacidade

- Capacidade `monitoramento-processual` em `capability_registry`, habilitada por
  cliente em `client_capabilities`. Nao e application Identity: nao aparece no
  seletor pos-login e nao tem entitlement por usuario (ADR 006/008).
- `service_name` NULL enquanto for modulo do BFF; passa a ser preenchido se
  for extraida para servico.
- O BFF le `client_capabilities` no banco Identity antes de criar ou retomar
  acompanhamento. Leitura e listagem do que ja existe nao exigem a capacidade,
  para o cliente nao perder o historico se a capacidade for desabilitada.
- Quem pode pedir o acompanhamento continua sendo decidido pelo produto
  chamador (papel no board/card no Flow; `juridico:read` no Juridico).

### Modulo

- Novo modulo `implementations/bff-jboot-platform/modules/process-monitoring`,
  runtime em `src/modules/process-monitoring`.
- Banco exclusivo `jboot_process_monitoring`, unico para todos os clientes,
  com `client_id` em toda tabela (decisao do usuario em 2026-11-08). Conexao
  por `JBOOT_PROCESS_MONITORING_DATABASE_URL`.
- O modulo nao importa codigo de `juridico`, `kanban` nem `domain-integrations`.
  Os produtos falam com ele por uma interface publica do modulo
  (`ProcessMonitoringService`) e recebem eventos por adaptadores de destino
  registrados no bootstrap, no padrao ja usado por
  `ProcessChangeNotifierRegistry`.

### Registro

Um acompanhamento guarda:

| Campo | Para que |
|---|---|
| `client_id` | separar os dados de cada cliente |
| numero cifrado e `process_number_hmac` | identificar sem expor o CNJ em claro |
| `tribunal`, `cadence`, `state` | consulta e ciclo de vida (`active`, `paused`, `deleted`) |
| `origin_product` | quem criou: `juridico` ou `flow` |
| `destination_product` e `destination_ref` (jsonb) | para onde vao as movimentacoes; no Flow, `databaseRef`, `boardId`, `cardId` |
| ultimo retrato, execucoes, movimentacoes, eventos | detectar o que e novo, auditoria e retencao |

Regra: indice unico `(client_id, process_number_hmac)` enquanto
`state <> 'deleted'`. Pedido de outro produto para o mesmo processo devolve
conflito com o produto de destino atual, sem criar segundo acompanhamento.

### Execucao

```text
Juridico ou Flow -> ProcessMonitoringService (BFF) -> jboot_process_monitoring
ProcessMonitoringService -> wrk-jboot-juridico (start/stop workflow)
Temporal worker -> BFF interno S2S /internal/process-monitoring/monitors/:id/runs
BFF -> svc-jboot-juridico-data -> DataJud
BFF -> adaptador do destino (Juridico ou Flow)
```

- O worker continua sem acessar banco nem DataJud. O workflow passa a receber
  so `monitor_id` e `client_id`; o id muda para
  `process-monitor:{client_id}:{monitor_id}`.
- A logica de cifrar, calcular HMAC, retrato e movimentacoes sai de
  `juridico/datajud` para o modulo novo. A consulta manual do Juridico
  (snapshot `manual_query`) continua no Juridico: e funcao de busca, nao de
  acompanhamento.
- As chaves de cifra e HMAC sao as mesmas do Juridico na migracao, para manter
  comparacao com os HMAC ja gravados; rotacao fica fora desta decisao.
- Fila das consultas (Sprint 4, 2026-11-08): a activity de consulta roda na
  fila Temporal propria `process-monitoring`, uma por vez e com intervalo minimo
  entre inicios na fila inteira (`JBOOT_PROCESS_MONITORING_MAX_CONCURRENCY`,
  padrao 1; `JBOOT_PROCESS_MONITORING_RATE_PER_SECOND`, padrao 1). Motivo: a
  importacao de 173 processos disparou 173 consultas juntas e o DataJud recusou
  ou nao respondeu todas. Sem espalhamento de horario: a cadencia conta a partir
  do fim de cada consulta, entao a fila serializada espalha as rodadas
  seguintes. Fila externa (RabbitMQ, Redpanda, Valkey) foi descartada por
  duplicar o agendamento que o Temporal ja faz.
- Nova tentativa: recusa por excesso e indisponibilidade tentam de novo apos 10 e
  20 minutos; processo nao encontrado, sigiloso ou numero invalido nao repetem. A
  execucao que falhou e refeita com a mesma chave de idempotencia; a que deu
  certo segue idempotente.
- A consulta manual da tela do Juridico fica fora da fila e divide o limite do
  DataJud com o segundo plano (pendencia registrada).
- Limite de tempo proprio do segundo plano (decidido em 2026-11-08): o DataJud
  levou de 20 a 36 s por consulta, acima dos 12 s da consulta de tela. A
  execucao do acompanhamento pede `X-JBoot-Query-Mode: background` ao
  `svc-jboot-juridico-data`: uma tentativa de ate 60 s; o BFF espera 70 s e o
  worker 90 s, dentro dos 2 min da activity. A consulta de tela nao muda.

### Entrega Das Movimentacoes

- Cada movimentacao nova vai so para o destino atual.
- Destino `juridico`: a tela Acompanhamentos le do modulo novo, filtrando por
  destino Juridico. As rotas HTTP do Juridico permanecem e delegam.
- Destino `flow`: evento `system_event` no historico do card, como hoje
  (`juridico_process_changed`), com o mesmo disparo de automacoes.

## Consequencias

- Cliente so com o Flow monitora com a capacidade habilitada, sem Juridico.
- **Mudanca de comportamento aceita:** hoje um processo acompanhado na tela do
  Juridico tambem notifica cards do Flow exportados dele. Com destino unico, a
  notificacao vai so para o Juridico ate existir a transferencia. O toggle do
  Flow para um processo ja acompanhado no Juridico informa onde ele esta.
- Workflows ativos sao parados e reiniciados com o id novo na migracao.
- `juridico_data_flow_exports` continua registrando exportacoes do Juridico;
  deixa de ser o vinculo de entrega dos acompanhamentos.
- O grafo de arquitetura ganha o node do modulo e as arestas
  worker -> process-monitoring, juridico -> process-monitoring e
  kanban/domain-integrations -> process-monitoring.

## Pendencias Registradas

- Transferir o acompanhamento do Juridico para o Flow ao exportar (cenario 3).
- Extrair o modulo para servico quando surgir consumidor fora do BFF.
- Rotacao de chaves de cifra e HMAC do banco novo.
- Endpoint compartilhado de verificacao de capacidades (pendente desde a ADR 008).
- Consulta manual do Juridico fora da fila, dividindo o limite do DataJud.
