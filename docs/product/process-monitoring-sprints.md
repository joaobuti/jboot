# Acompanhamento De Processos — Capacidade Independente

Decisao: `docs/architecture/decisions/021-process-monitoring-capability.md`.
Branch: `feature/process-monitoring-capability`.

## Decisoes Confirmadas — 2026-11-08

- O acompanhamento sai do Juridico e vira capacidade independente,
  `monitoramento-processual`, contratada a parte pelo cliente, sem entitlement
  por usuario e fora do seletor pos-login.
- Roda como modulo do BFF (`modules/process-monitoring`), com banco proprio
  unico (`jboot_process_monitoring`), separado por `client_id`.
- Juridico e Flow usam a capacidade diretamente; o Flow deixa de exigir o
  Juridico.
- Um acompanhamento ativo por cliente e numero de processo, com origem e
  destino registrados.
- Transferir o acompanhamento do Juridico para o Flow ao exportar fica para
  depois da primeira entrega.

## Fora Do Escopo

- Transferencia Juridico -> Flow (pendencia registrada na ADR 021).
- Servico com deploy proprio.
- Acompanhamento de buscas (avisar processo novo por OAB/CPF).
- Mudanca no `svc-jboot-juridico-data`, exceto o modo de segundo plano da Sprint 4
  (decidido em 2026-11-08).

## Sprint 1 — Fundacao Da Capacidade

Estado: `concluida`.

Objetivo: capacidade funcionando no BFF e no worker, ainda sem consumidores.

Criterios de aceite / sprint_gate:

- [x] Banco `jboot_process_monitoring` criado pelo init do Postgres
  (`docker/postgres/init/123_process_monitoring.sql`), com acompanhamentos,
  execucoes, retratos, movimentacoes e eventos, todos com `client_id`; indice
  unico `(client_id, process_number_hmac)` fora de `deleted`.
- [x] `origin_product`, `destination_product` e `destination_ref` validados por
  CHECK (destino Flow exige `databaseRef`, `boardId` e `cardId`).
- [x] Capacidade `monitoramento-processual` no `capability_registry`, habilitada
  nos clientes JBoot e Demo JBoot.
- [x] Modulo `process-monitoring` com interface publica `ProcessMonitoringService`:
  garantir ativo, pausar, retomar, excluir, listar por destino e listar
  movimentacoes. So o produto de destino ve, pausa, retoma ou exclui.
- [x] Criar ou retomar exige a capacidade habilitada para o cliente.
- [x] HMAC, retrato, movimentacoes, cadencia e status de execucao em
  `process-fingerprint.ts`, usado tambem pelo Juridico; cifra
  (`shared/crypto`), cliente do `svc-jboot-juridico-data` (`shared/juridico-data`)
  e guard do worker (`shared/worker-auth`) movidos para `shared`, com
  reexport nos caminhos antigos.
- [x] Rotas internas S2S `/internal/process-monitoring/monitors/:id/runs` e
  `/internal/process-monitoring/monitors/purge`
  (`docs/api/process-monitoring-worker-openapi.yaml`).
- [x] Worker com `ProcessMonitorWorkflow` (`process-monitor:{client_id}:{monitor_id}`)
  e rotas `/process-monitors`, sem `database_ref`. O `DataJudMonitorWorkflow`
  continua ate a migracao da Sprint 2.
- [x] Adaptadores de destino via `ProcessMonitoringDeliveryRegistry`; o modulo
  nao importa `juridico`, `kanban` nem `domain-integrations` (teste estatico).
- [x] Testes do modulo (unicidade no banco real, baseline, capacidade, dono do
  destino, idempotencia, entrega so ao destino) e do worker; `tsc`, build e
  lint no container.
- [x] Grafo de arquitetura e contrato HTTP atualizados; gates passando.

Evidencias (2026-11-08):

- BFF: 950 testes, 947 passando, 2 ignorados (Gotenberg) e 1 falha alheia: o
  teste da configuracao do Validador de assinatura da `main` espera a tabela
  `kanban_signed_kit_validation_settings`, removida no banco de desenvolvimento
  pela branch `feature/flow-signature-validation-action`.
- Worker: 16 testes passando.
- Subida do BFF da branch na porta 8019: rotas internas mapeadas; sem token,
  401.
- Nao verificado ponta a ponta com Temporal e DataJud reais: nenhum produto
  usa a capacidade ate a Sprint 2.

## Sprint 2 — Juridico Ligado E Migracao

Estado: `concluida`.

Objetivo: um unico registro de acompanhamentos a partir daqui.

Ajuste de escopo (2026-11-08): os fluxos do Flow (Monitorar, importacao, toggle do
card e entrega no card) tambem passaram a usar a capacidade nesta sprint. Sem
isso, depois da migracao os acompanhamentos criados pelo Flow nasceriam com
destino Juridico e o card deixaria de receber movimentacoes ate a Sprint 3. A
Sprint 3 fica com o fim da exigencia do Juridico e a parte de tela.

Criterios de aceite / sprint_gate:

- [x] Tela Acompanhamentos do Juridico le e grava pela capacidade, destino
  `juridico`; rotas HTTP e formato de resposta mantidos (`DataJudMonitorService`
  virou adaptador de `ProcessMonitoringService`).
- [x] Monitorar da peticao, importacao por planilha e toggle do card criam o
  acompanhamento na capacidade com destino no card; movimentacao nova vira
  evento no card por `FlowProcessMovementDelivery`, com o mesmo tipo
  (`juridico_process_changed`) e a mesma chave de integracao de antes.
- [x] Processo ja acompanhado em outro destino devolve 409
  `process_monitor_in_use`, sem criar o segundo.
- [x] Script `npm run migrate:process-monitors` (BFF): copia acompanhamentos,
  execucoes, retrato, movimentacoes e eventos mantendo os ids; destino `flow`
  quando ha vinculo com card, senao `juridico`; habilita a capacidade nos
  clientes migrados; para o workflow antigo e inicia o novo. Idempotente, com
  `--dry-run` e `--no-workflows`.
- [x] `juridico_data_flow_exports.monitor_id` sem FK para a tabela antiga
  (`docker/postgres/init/124_juridico_flow_exports_process_monitor.sql`).
- [x] Tabelas de acompanhamento do Juridico deixam de ser escritas: repositorio
  antigo removido; remocao das tabelas fica para depois da verificacao em
  ambiente.
- [x] Codigo antigo removido no BFF: rota interna de execucao do Juridico,
  `ProcessChangeNotifierRegistry` e `JuridicoProcessChangeSubscriber`. A rota
  interna de purga do Juridico ficou so para as consultas manuais.
- [x] Worker sem a rota de inicio `/datajud/monitors`; a activity legada
  `run_datajud_monitor` nao chama mais o BFF (teste de regressao). O
  `DataJudMonitorWorkflow` e a rota de parada ficam ate a migracao rodar em cada
  ambiente.
- [ ] Teste ponta a ponta com Temporal e DataJud reais (cenario 1, so Juridico).

Evidencias (2026-11-08):

- BFF: 949 testes, 946 passando, 2 ignorados (Gotenberg) e a mesma falha alheia
  da Sprint 1 (tabela do Validador de assinatura removida no banco local por
  outra branch). `tsc`, build e lint limpos.
- Worker: 17 testes passando.
- Migracao no banco local, sem trocar workflows (`--no-workflows`): 2
  acompanhamentos (1 Flow ativo com card, 1 Juridico excluido), 8 execucoes e
  89 movimentacoes conferidas contra a origem; segunda execucao sem copias.
- Workflows nao trocados no ambiente local: o BFF em execucao e de outra branch
  e ainda usa as tabelas antigas. A troca acontece ao subir esta branch, com
  `npm run migrate:process-monitors`.

Pendencias registradas:

- Cadencia nova so vale depois que o workflow e reiniciado (comportamento ja
  existente no Juridico).
- A purga das consultas manuais do Juridico so roda quando chamada; sem
  agendamento proprio (ja era assim antes).
- Remover `DataJudMonitorWorkflow`, a rota `/datajud/monitors/{id}/stop` e as
  tabelas `juridico_data_monitors*` depois da migracao em todos os ambientes.

## Sprint 3 — Flow Ligado Sem Juridico

Estado: `concluida`.

Objetivo: o Flow monitora so com a capacidade.

Criterios de aceite / sprint_gate:

- [x] Monitorar e importacao por planilha deixam de exigir `juridico:read`:
  exigem a capacidade `monitoramento-processual` (403
  `process_monitoring_not_contracted`). A regra "um card por numero CNJ no
  cliente" vale no Kanban (registro do protocolo e `findProcessOwners`) e na
  capacidade (um acompanhamento vivo por processo); a consulta a
  `juridico_data_flow_exports` saiu, e os cards nascidos no Flow nao gravam mais
  vinculo nem auditoria no Juridico.
- [x] A exportacao Juridico -> Flow passou a checar no Kanban se o processo ja
  tem card de peticao ou importado (antes dependia do vinculo no Juridico).
- [x] Toggle e cadencia do card acham o acompanhamento pelo card de destino; o
  Juridico so e lido para card exportado do DataJud ainda sem acompanhamento.
- [x] Telas: opcoes devolvem `monitoringEnabled` no lugar de `juridicoEnabled`;
  avisos de "Monitoramento processual contratado"; processo acompanhado no
  Juridico aparece como existente na conferencia da planilha
  (`monitored_in_juridico`), falha a linha no lote (`process_monitor_in_use`) e
  explica a recusa no botao do card.
- [x] Processo ja acompanhado no Juridico mostra onde esta, sem duplicar.
- [x] Target `make code-up TARGET=kanban-monitoring`: Flow com Temporal, worker e
  servico de dados; o target `kanban` continua sem eles.
- [x] Capacidade habilitada no "Cliente Teste Drive".
- [x] Liberacao manual do Juridico no "Cliente Teste Drive" desfeita em
  2026-11-08, com o BFF desta branch no ar; o cliente ficou com Flow +
  `monitoramento-processual`.
- [ ] Teste do Flow sem o Juridico (cenario 2) ponta a ponta pela tela.

Evidencias (2026-11-08):

- BFF: 950 testes, 947 passando, 2 ignorados (Gotenberg) e a mesma falha alheia
  das Sprints 1 e 2. `tsc`, build e lint limpos.
- App: 161 testes do modulo kanban passando; `tsc`, lint e `next build` limpos.
- Nenhum acompanhamento nem vinculo do "Cliente Teste Drive" no banco do
  Juridico: remover a liberacao nao perde dado.
- Runtime local trocado para esta branch em 2026-11-08 (BFF 8010, app 3002,
  worker 8020 com Temporal, servico de dados 8030). `migrate:process-monitors`
  trocou 1 workflow; o `ProcessMonitorWorkflow` rodou na hora e percorreu
  worker -> rota interna nova -> BFF -> servico de dados. A consulta falhou por
  tempo: o DataJud levou de 25 a 40 s por consulta naquele momento, acima dos
  15 s do cliente do BFF e dos 12 s do servico (limites anteriores a esta
  mudanca). O tempo esgotado passou a ser gravado como `timeout`, nao `failed`.

Pendencia registrada: os limites de tempo da consulta (12 s no servico, 15 s no
BFF) foram pensados para a tela; para o acompanhamento em segundo plano podem ser
maiores. Decidir junto com a observacao do DataJud por alguns dias.

## Sprint 4 — Fila Das Consultas E Ultima Consulta No Card

Estado: `concluida`.

Origem: importacao de 173 processos em 2026-11-08. Os 173 workflows consultaram
o DataJud ao mesmo tempo; o servico de dados limita 10 consultas simultaneas, o
DataJud recusou 131 por excesso (`provider_rate_limited`) e nao respondeu 42 a
tempo; o BFF desistiu de todas em 15 s e gravou `timeout`. A proxima rodada
ficou marcada para o mesmo minuto do dia seguinte. As novas tentativas do
Temporal tambem nao consultavam de novo: reusavam a chave de idempotencia e o BFF
respondia "ja processado".

Decisoes confirmadas (2026-11-08):

- Fila propria no Temporal (`process-monitoring`) no mesmo worker
  `wrk-jboot-juridico`, sem processo novo e sem fila externa (RabbitMQ,
  Redpanda, Valkey ficam fora).
- Uma consulta por vez, com intervalo minimo entre inicios; os dois valores sao
  configuraveis. Uma consulta so comeca depois do retorno da anterior.
- Sem espalhamento de horario: cada acompanhamento conta a cadencia a partir do
  fim da propria consulta, e a fila serializada espalha as rodadas seguintes.
- Escopo do Flow. A fila vale para a capacidade inteira, entao os
  acompanhamentos com destino Juridico tambem passam por ela, sem mudanca no
  codigo do Juridico.
- O card mostra a ultima consulta (quando, resultado e proxima).

Criterios de aceite / sprint_gate:

- [x] Activity `run_process_monitor` na fila `process-monitoring`, com
  `max_concurrent_activities` e `max_task_queue_activities_per_second` por
  configuracao (padrao 1 e 1/s); workflows em execucao trocam de fila por
  `workflow.patched`, sem reinicio obrigatorio.
- [x] Nova tentativa consulta de novo: execucao que falhou pode ser refeita com a
  mesma chave; execucao com sucesso continua idempotente.
- [x] Sem nova tentativa quando nao adianta (processo nao encontrado, sigiloso,
  numero invalido); excesso de pedidos e indisponibilidade tentam de novo com
  espera maior.
- [x] Estado do monitoramento do card devolve a ultima consulta (status, data) e a
  proxima; o card mostra o resultado e, na falha, o motivo.
- [x] Testes do worker, do BFF e da tela; gates de grafo e contrato HTTP.
- [x] Os 173 acompanhamentos importados consultados pela fila, sem pico.
  Parcial: a fila roda uma consulta por vez (conferido), mas todas esgotam o
  tempo; ver o limite de tempo abaixo.

Evidencias (2026-11-08):

- Worker: 20 testes passando (fila propria, nova tentativa so apos 10 min,
  404 sem nova tentativa, 429 com nova tentativa, ritmo por configuracao).
- BFF: 954 testes, 951 passando, 2 ignorados (Gotenberg) e a mesma falha alheia
  das sprints anteriores. Teste no banco real: execucao que falhou e refeita com
  a mesma chave; a que deu certo segue idempotente; ultima consulta no
  acompanhamento. `tsc` e lint limpos.
- App: 165 testes do modulo kanban passando; `tsc` e lint limpos.
- Gates de grafo de arquitetura e de contrato HTTP passando.
- Runtime local: worker com as filas `juridico-scraping` e `process-monitoring`;
  174 workflows reiniciados (173 importados + 1 card antigo). Sempre uma consulta
  em execucao por vez, a cada ~15 s.

Bloqueio resolvido (2026-11-08): o DataJud levou 20 a 36 s por consulta,
medido direto, com uma consulta por vez; o servico de dados desistia em 12 s e o
BFF em 15 s. Decisao do usuario: limite proprio para o segundo plano. A
execucao pede `X-JBoot-Query-Mode: background` ao `svc-jboot-juridico-data`
(uma tentativa de ate 60 s); BFF espera 70 s e worker 90 s. A consulta de tela
continua com 12 s.

- [x] Limite de tempo do segundo plano (60 s no servico, uma tentativa), com
  testes no servico (24), no BFF (955, mesma falha alheia) e no worker (20).
- Runtime local depois da mudanca (2026-11-08 20:39-20:45): 7 consultas, todas
  com sucesso, media 36,8 s e maxima 52 s; uma por vez. Os acompanhamentos que
  falharam antes recebem as novas tentativas pela fila (10 e 20 min). Vazao
  atual: cerca de 100 consultas por hora; os 174 levam perto de 2 horas por
  rodada. Se o volume crescer, subir `JBOOT_PROCESS_MONITORING_MAX_CONCURRENCY`.

Pendencias registradas para o Juridico (fora desta sprint):

- Consulta manual da tela do Juridico continua fora da fila e divide o limite do
  DataJud com o segundo plano.
- Consulta de tela do Juridico continua com 12 s; o DataJud lento faz a tela
  falhar por tempo (comportamento anterior, nao alterado).
- Remover `DataJudMonitorWorkflow`, a rota de parada antiga e as tabelas
  `juridico_data_monitors*`.
- Transferir o acompanhamento do Juridico para o Flow na exportacao.
- Mostrar a ultima consulta tambem na tela Acompanhamentos do Juridico.

## Sprint 5 — Movimentacoes Do Processo No Card

Estado: `concluida`.

Origem: processos importados por planilha ja tinham historico no DataJud (69
movimentacoes no maior caso), mas o card nao mostrava nada. A primeira consulta
so estabelece o retrato e nao gera evento, entao o historico processual de um
caso existente ficava invisivel.

Decisao confirmada (2026-11-08): lista "Movimentacoes do processo" no card,
somente leitura, com todas as movimentacoes do retrato, as novas marcadas como
"nova". Movimentacoes antigas nao entram no historico do card nem disparam
automacoes (evita centenas de disparos de `juridico_process_changed`, inclusive
com IA, sobre fatos de meses atras). Movimentacoes novas continuam indo para o
historico e disparando automacoes como hoje.

Criterios de aceite / sprint_gate:

- [x] Capacidade devolve todas as movimentacoes do retrato do acompanhamento,
  mais recentes primeiro, com marca de "nova" (detectada depois da primeira
  consulta); so para o produto de destino.
- [x] Rota `GET /domain-integrations/flow/cards/:cardId/monitoramento/movimentacoes`
  com a mesma autorizacao de leitura do card (escritorio, papel no board).
- [x] Secao "Movimentacoes do processo" no card monitorado (importacao,
  Monitorar e exportado do Juridico), recolhida por padrao quando longa
  (mostra as 5 mais recentes e "Ver todas"). Conferida pelo usuario no card do
  processo 5013400-76.2026.4.04.7003 em 2026-11-08, sem erro no BFF; `next build`
  passou numa copia isolada do app (o servidor de desenvolvimento usa a mesma
  pasta `.next`).
- [x] Testes do repositorio no banco real, do servico e da tela; contrato HTTP
  e gates.

Evidencias (2026-11-08):

- BFF: 958 testes, 955 passando, 2 ignorados (Gotenberg) e a mesma falha alheia
  das sprints anteriores. Teste no banco real: baseline inteiro mais as novas,
  marcadas, mais recentes primeiro, isolado por cliente. `tsc` e lint limpos.
- App: 168 testes do modulo kanban passando; `tsc` e lint limpos.
- Gates de grafo de arquitetura e de contrato HTTP passando.
- Rota no ar no runtime local, 401 sem sessao.

## Sprint 6 — Complemento No Texto Da Movimentacao

Estado: `concluida`.

Origem (2026-11-08): no processo 5013400-76.2026.4.04.7003, 6 das 73
movimentacoes do DataJud trazem complemento tabelado ("Conclusao" ->
"para julgamento" ou "para despacho"; "Documento" -> "Certidao"); o card
guardava so o nome. O DataJud nao traz o conteudo dos atos; isso fica para o
planejamento do DJEN.

Criterios de aceite / sprint_gate:

- [x] Texto da movimentacao = nome + complementos ("Conclusao — para
  julgamento"), sem repetir o nome e sem complemento vazio.
- [x] A identificacao da movimentacao (fingerprint) nao muda: nenhuma
  movimentacao ja gravada volta como nova nem gera evento ou automacao.
- [x] Movimentacoes ja gravadas recebem o texto novo na proxima consulta.
- [x] Testes do texto e do banco real (atualiza o texto sem gerar evento).

Evidencias (2026-11-08):

- BFF: 961 testes, 958 passando, 2 ignorados (Gotenberg) e a mesma falha alheia
  das sprints anteriores; teste no banco real confirma que o texto novo so
  atualiza a movimentacao ja gravada, sem evento. `tsc` e lint limpos.
- Runtime local: reconsulta do processo 5013400-76.2026.4.04.7003; as 6
  movimentacoes com complemento passaram a "Conclusao — para julgamento",
  "Conclusao — para despacho" (3), "Documento — Certidao" e "Distribuicao —
  sorteio"; nenhum evento gerado.
- O DataJud devolve 73 movimentacoes e o card mostra 69: 4 sao repeticoes
  identicas no DataJud ("Expedida/certificada", mesmo codigo e mesmo segundo,
  provavelmente uma por parte intimada) e viram uma so. Sem dado que as
  diferencie, nao ha como mostrar as duas.
- Movimentacoes dos demais processos recebem o texto novo na proxima consulta
  de cada um.

## Sprint 7 — Fontes Separadas E Publicacoes Do DJEN No Card

Estado: `concluida`.

Decisao: `docs/architecture/decisions/022-process-publications-capability.md`.

Decisoes confirmadas (2026-11-08):

- Capacidade `publicacoes-processuais` ("Publicacoes processuais (DJEN)"),
  vendida a parte, dependente de `monitoramento-processual` ("Monitoramento
  processual (DataJud)"). Busca por numero de processo no Flow; busca por OAB
  continua so no Juridico.
- Duas sinalizacoes no cabecalho do card, independentes: olho + frequencia do
  DataJud (1, 7, 14, 30 dias) e olho + frequencia do DJEN (1, 3, 7 dias uteis),
  esta so com a capacidade contratada. Acima de 1 dia util, aviso de risco de
  prazo.
- Ciclo diario as 7h (Brasilia) em dias uteis; fila Temporal propria do DJEN.
- Publicacoes em lista propria ("Publicacoes e intimacoes"); a nova entra no
  historico do card. Primeira consulta: ultimos 7 dias, so base.
- Mudanca de vara: item na lista de movimentacoes e, depois da base, evento no
  historico do card.

Criterios de aceite / sprint_gate:

- [x] Capacidade `publicacoes-processuais` no `capability_registry` e habilitada
  nos clientes JBoot, Demo JBoot e "Cliente Teste Drive" (dev); rotulo do
  monitoramento passa a "Monitoramento processual (DataJud)".
- [x] Acompanhamento com estado por fonte: DataJud ligado/desligado + cadencia;
  DJEN ligado/desligado/padrao + cadencia em dias uteis; os dois desligados
  pausam o acompanhamento. Juridico continua com pausar/retomar do
  acompanhamento inteiro.
- [x] Workflow com ciclo diario (7h, dias uteis): pergunta ao BFF as fontes
  vencidas e dispara cada uma na sua fila; troca de frequencia vale no ciclo
  seguinte sem reinicio. Workflows em execucao seguem compativeis.
- [x] Execucao do DJEN: consulta pelo numero do processo e periodo, texto puro
  (sem HTML), cifrado, deduplicado por hash; base silenciosa na primeira vez;
  as novas viram `djen_publication_received` no historico do card.
- [x] Mudanca de vara como movimentacao propria.
- [x] Card: dois olhos com frequencias, aviso de prazo e secao "Publicacoes e
  intimacoes".
- [x] Testes (BFF, banco real, worker, servico, tela), contrato HTTP, grafo,
  gates e `next build`.

Evidencias (2026-11-08):

- BFF: 974 testes, 971 passando, 2 ignorados (Gotenberg) e a mesma falha alheia
  das sprints anteriores. Banco real: base silenciosa do DJEN e novas com evento,
  deduplicacao por hash, periodo so avanca no sucesso, liga/desliga por fonte,
  frequencia 14 recusada pelo banco, mudanca de vara antiga sem evento. `tsc` e
  lint limpos.
- Worker: 24 testes (proximo ciclo as 7h de Brasilia em dia util, cada fonte na
  sua fila, falha de uma nao bloqueia a outra, plano inativo encerra o workflow).
- App: 171 testes do modulo kanban; `tsc`, lint e `next build` (copia isolada)
  limpos.
- Gates de grafo de arquitetura e de contrato HTTP passando (2 avisos novos
  `unresolved_call` do mesmo tipo dos ja existentes nas rotas `runs`/`purge`:
  URL em f-string no worker). `make ai-conformance` com a mesma falha anterior
  (revisao do perfil AI-first vencida em 2026-11-03).
- Compatibilidade: os 174 historicos de workflows em execucao reproduzidos com o
  codigo novo pelo `Replayer` do Temporal, sem erro de determinismo.
- Runtime local: 174 workflows reiniciados no ciclo diario; 174 consultas ao
  DJEN com sucesso (media 140 ms), nenhuma ao DataJud (nao venciam); 5
  publicacoes dos ultimos 7 dias gravadas como base, sem evento; texto puro
  conferido (sem HTML).
- Migration `126_process_monitoring_sources_publications.sql` aplicada duas vezes
  (idempotente). "Cliente Teste Drive" recebeu `publicacoes-processuais`
  manualmente (dado de desenvolvimento, fora do seed).

Pendencias registradas:

- Contador de publicacoes nao vistas no cabecalho (fora desta sprint).
- Feriados no calculo de dias uteis.
- O tempo de cada consulta e a ordem da fila do DataJud continuam como na
  Sprint 4; com o ciclo as 7h, o DataJud de todos os processos vencidos sai no
  mesmo horario e a fila serializa.

## Sprint 8 — Gatilho De Automacao "Publicacao Recebida (DJEN)"

Estado: `concluida`.

Criterios de aceite / sprint_gate:

- [x] Gatilho `djen_publication_received` ("Quando houver publicacao nova no
  DJEN") nas automacoes da coluna, com as mesmas acoes do gatilho de
  movimentacao processual: e-mail e "Ir para a coluna". "Executar agente de IA"
  continua so em entrar/sair da coluna; para IA, a regra move o card para uma
  coluna com agente ao entrar.
- [x] E-mail pelo outbox duravel (coluna gravada no evento) com tipo, documento,
  orgao, data e o inicio do texto; o texto inteiro fica no card.
- [x] "Ir para a coluna" pelo motor de movimento (coluna atual do card).
- [x] Uma intencao por publicacao; publicacao da base nao dispara.
- [x] Rotulos: "Movimentacao processual (DataJud)" e "Publicacao nova no DJEN"
  nas regras e no historico de envios.
- [x] Migration `127_kanban_djen_publication_trigger.sql`; testes, contrato
  HTTP, gates e `next build`.

Evidencias (2026-11-09):

- BFF: 978 testes, 975 passando, 2 ignorados (Gotenberg) e a mesma falha alheia
  das sprints anteriores. Banco real: a regra DJEN dispara so para
  `djen_publication_received` da coluna gravada no evento, e a movimentacao
  processual nao dispara regra DJEN; recuperacao do motor de movimento cobre o
  gatilho novo; e-mail montado a partir do evento; um evento e uma intencao por
  publicacao. `tsc` e lint limpos.
- App: 171 testes do modulo kanban; `tsc`, lint e `next build` limpos.
- Gates de grafo e de contrato HTTP passando.
- Ponta a ponta no runtime local (processo 1010777-61.2026.4.01.4200): regra
  temporaria "Notificar por e-mail" na coluna do card; a publicacao do dia,
  apagada e reconsultada, voltou como nova, gerou o evento no card e a intencao
  de e-mail; o envio falhou so porque o Mailpit nao esta no ar neste ambiente.
  Regra, intencao e evento duplicado do teste removidos.
- Envio real do e-mail nao verificado (Mailpit fora do ar).

## Sprint 9 — Historico Sob Demanda E Data De Ajuizamento

Estado: `concluida`.

Decisoes (2026-11-08/09): o historico anterior a entrada no Flow vem sob
demanda, a partir da movimentacao; a data de ajuizamento e importante.

Criterios de aceite / sprint_gate:

- [x] Botao "Ver no DJEN" nas movimentacoes que costumam gerar comunicacao
  (publicacao, intimacao, expedicao, decisao, despacho, sentenca, acordao), so
  com `publicacoes-processuais` contratada; funciona com o DJEN desligado no
  card.
- [x] Busca no DJEN pelo numero do processo de 3 dias antes a 10 dias depois da
  data da movimentacao; mostra o texto puro ligado a movimentacao e grava as
  publicacoes como historico (sem "nova", sem evento, sem automacao).
- [x] Data de ajuizamento, classe, vara e sistema do processo guardados no
  retrato do DataJud e mostrados no painel "Origem".
- [x] Testes (BFF, banco real, tela), contrato HTTP, gates e `next build`.

Evidencias (2026-11-09):

- BFF: 985 testes, 982 passando, 2 ignorados (Gotenberg) e a mesma falha alheia
  das sprints anteriores. Banco real: dados do processo no retrato (consulta sem
  o dado nao apaga o anterior), movimentacao isolada por cliente, publicacoes
  sob demanda gravadas como historico sem evento e deduplicadas. Nomes reais de
  movimentacao do DataJud decidem o botao (Publicacao, Expedida/certificada,
  Decisao sim; Peticao, Confirmada, Conclusao nao). `tsc` e lint limpos.
- App: 173 testes do modulo kanban; `tsc`, lint e `next build` (copia isolada).
- Gates de grafo e de contrato HTTP passando. Migration
  `128_process_monitoring_snapshot_details.sql` aplicada duas vezes.
- Runtime local: 10 retratos ja com ajuizamento, classe, vara e sistema (ex.:
  processo 1006822-22.2026.4.01.4200, ajuizado em 15/06/2026, Procedimento do
  Juizado Especial Civel, 03a Vara JEF Boa Vista, PJe); os demais preenchem na
  proxima consulta ao DataJud de cada um.
- Correcao (2026-11-09): o botao considerava o complemento e aparecia em
  "Conclusao — para decisao"; agora so o nome da movimentacao decide.
- Busca sob demanda verificada contra o DJEN real pelo servico do BFF (processo
  1006822-22.2026.4.01.4200, movimentacao "Outras Decisoes" de 04/08/2026):
  periodo 01/08 a 14/08, 1 intimacao (Decisao, 05/08/2026), texto puro, gravada
  como historico.
- Clique em "Ver no DJEN" pela tela conferido pelo usuario em 2026-11-09
  (Decisao de 05/08 aparecendo sob "Outras Decisoes" de 04/08).

## Sprint 10 — Capacidade Nao Contratada Visivel E Contratacao No Identity

Estado: `concluida`.

Decisoes (2026-11-09): sem a capacidade, o sinalizador do card continua visivel,
porem inativo e bloqueado; a busca (DataJud ou DJEN) so acontece com a
capacidade contratada; o operador contrata DataJud e DJEN na tela do cliente no
Identity. So as duas do monitoramento aparecem ali; as capacidades s2s internas
(ai-gateway, juridico-data, payments) continuam fora da tela.

Criterios de aceite / sprint_gate:

- [x] Olho do DataJud e do DJEN no cabecalho do card aparecem com cadeado,
  apagados e sem acao quando a capacidade nao esta contratada; o motivo aparece
  ao passar o mouse.
- [x] Ciclo diario nao consulta o DataJud sem `monitoramento-processual` (o DJEN
  ja exigia as duas capacidades).
- [x] `capability_registry.client_contractable` e `requires_capability`
  (migration `129_identity_contractable_capabilities.sql`); BFF do Identity
  expoe os campos e recusa estado final em que o DJEN fica ligado sem o DataJud.
- [x] Secao "Capacidades" no cadastro do cliente: DJEN bloqueado enquanto o
  DataJud estiver desmarcado; desmarcar o DataJud desmarca o DJEN.
- [x] Conferencia na tela do Identity pelo usuario (2026-11-09).

Evidencias (2026-11-09):

- Bloqueio no card conferido pelo usuario com o DJEN desligado do Cliente Teste
  Drive (religado depois). BFF da plataforma: 35 testes dos servicos afetados,
  `tsc` e lint limpos. App: `tsc` e lint limpos.
- BFF do Identity: suite com 30 passando, 0 falhas (6 pulados), `tsc` e lint
  limpos. Tela do Identity: `tsc` limpo; o lint do arquivo da tela ja tinha 148
  erros de formatacao antes desta sprint (estilo do arquivo nao segue o
  prettier configurado) e a secao nova segue o estilo do arquivo.
- Migration 129 aplicada duas vezes (idempotente).

## Sprint 11 — Cliente Acima, Processo Abaixo Na Face Do Card

Estado: `concluida`.

Decisao (2026-11-09): numero do processo e nome do cliente nao ficam na mesma
linha. Cliente em cima (titulo), processo abaixo quando houver; o resto da face
do card segue igual.

Criterios de aceite / sprint_gate:

- [x] Importacao por planilha: titulo = cliente da planilha (sem cliente,
  "Processo <numero>").
- [x] Monitorar: titulo = titulo do card de origem (o cliente); banco segue na
  descricao.
- [x] Face do card: linha "Processo <numero>" abaixo do titulo, lida do
  `sourcePayload` (importacao, Monitorar, exportacao do DataJud); nao repete
  quando o titulo ja traz o numero.
- [x] Migration `130_kanban_card_title_customer_first.sql` ajusta os titulos ja
  criados (173 cards importados no dev; idempotente, aplicada duas vezes).
- [x] Conferencia na tela pelo usuario (2026-11-09).

Evidencias (2026-11-09):

- BFF: 23 testes de Monitorar e importacao, `tsc` e lint limpos. App: 177
  testes do modulo kanban (inclui `card-process-line.spec.ts`), `tsc` e lint
  limpos. A busca do board segue achando pelo numero, que esta na descricao.

## Entrega — Passos Fora Do Codigo

- Migrations a aplicar a mao em base existente, nesta ordem: `126` a `130` em
  `docker/postgres/init/` (em volume novo rodam sozinhas).
- Workflows `ProcessMonitorWorkflow` em execucao so passam ao ciclo diario (7h,
  dias uteis) depois de reiniciados; versao verificada com o `Replayer` do
  Temporal sobre 174 historicos.
- Capacidades por cliente agora se contratam na tela de clientes do Identity
  (secao "Capacidades"); o DJEN exige o DataJud.
- O MR desta branch leva tambem 11 commits da `main` local ainda nao enviados
  (acao Monitorar da peticao e importacao de processos por planilha).
