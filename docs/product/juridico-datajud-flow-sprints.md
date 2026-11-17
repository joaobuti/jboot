# Juridico DataJud -> Flow Sprints

## Objetivo

Permitir exportar o resultado de uma consulta DataJud para um card do Flow, e
acompanhar mudancas desse processo sem alterar o dado original ja exportado.

Escopo definido via `PO -> PE -> confirmacao humana` em 2026-09-09. Continuacao
de `docs/product/domain-flow-integration-sprints.md` (que entregou
`Juridico PJe/DJEN -> Flow`) e de `docs/product/juridico-official-data-sprints.md`
(que entregou consulta e monitoramento DataJud). Documento proprio porque a
entrega atravessa juridico, domain-integrations, kanban e worker, alem de mudar
regra de retencao ja em producao.

## Premissas Verificadas No Codigo

Levantadas em 2026-09-09 contra o codigo em `fix/juridico-datajud-catalog-and-key`:

- o card exportado e **copia**, nao referencia: `createInDefaultColumnFromSource`
  grava `title`, `description` e `source_payload` no `databaseRef` do Flow, e o
  modulo `kanban` nao possui nenhuma referencia ao juridico. O card se le
  sozinho;
- `kanban_cards.source_id` e `varchar(160)`: numero CNJ + tribunal serve como
  chave de idempotencia sem migration no Kanban;
- `kanban_card_activities` ja suporta `type = 'system_event'` com
  `event_payload jsonb`, e o repositorio ja expoe `createSystemEvent`;
- o monitoramento DataJud com cadencia ja existe e esta em producao
  (`DataJudMonitorWorkflow`, tela Acompanhamentos, `movement_detected`);
- a consulta manual DataJud **nao persiste** o processo: grava apenas
  `juridico_data_query_audit`, pseudonimizado;
- o export PJe -> Flow **nao grava auditoria** no lado juridico, embora
  `docs/product/domain-flow-integration-sprints.md` declare "auditoria de
  importacao" como responsabilidade de `domain-integrations`. Divergencia entre
  contrato e implementacao, ja em producao.

## Decisoes De Escopo Confirmadas

Todas confirmadas pelo usuario em 2026-09-09.

- **Metodo proprio de export.** `datajud -> flow` nao reaproveita a rota do PJe;
  e endpoint e adapter separados, com os mesmos campos de destino.
- **Persistir a consulta e exportar por id.** O export le um snapshot gravado
  pelo BFF, nunca payload enviado pelo navegador.
- **Um card por processo.** Capa na descricao, movimentacoes ate o limite de
  4000 caracteres, como o exportador do PJe.
- **Idempotencia por numero CNJ + tribunal.** Independe de o CNJ manter o mesmo
  `id` interno no indice.
- **Reexport preserva o card.** Nao altera titulo, descricao nem
  `source_payload`; registra mudanca de estado como `system_event`.
- **Dados originais imutaveis.** O card e editavel nas regras do Flow (coluna,
  responsavel, tags); os dados de origem nao. Alteracao de dado original nao
  esta prevista.
- **Monitoramento e marcado no Flow, executado no juridico.** O toggle
  "Monitorar" no card aciona a API de acompanhamentos que ja existe; o worker
  segue como unico executor. Nao se constroi um segundo agendador, e a tela
  Acompanhamentos continua valida.
- **Baseline so enquanto monitora.** O Flow e o dono do dado permanente do
  cliente. O snapshot no juridico existe para comparacao de fingerprint; ao
  desativar o monitoramento ele perde a excecao de retencao.
- **Retencao.** Consultas manuais purgam em 180 dias. Desativar o monitoramento
  nao apaga na hora: devolve o snapshot ao ciclo normal de 180 dias, o que
  permite religar sem perder baseline apos desativacao acidental.
- **Autorizacao permanece `juridico:read`.** A escrita ocorre no Flow e ja e
  autorizada la (entitlement Flow ativo + papel `board_admin`/`board_member`).
  Exigir `juridico:write` gatearia uma leitura e quebraria o exportador PJe em
  producao, sem mitigar o risco real, que e divulgacao.
- **Primeira execucao apos ativacao estabelece baseline em silencio.** Sem isso,
  ativar (ou reativar apos purga) reportaria todos os movimentos como novos e
  inundaria o card.

## Fora De Escopo

- importacao no sentido inverso (Flow buscando origem no juridico) — prevista
  pelo usuario como proxima, nao especificada aqui;
- alteracao de dado original do card (status do processo e afins) — sera feature
  e configuracao do proprio usuario no Flow, fora desta entrega;
- exportacao a partir do acervo eProc (`juridico_processes`), que nao possui
  exportador;
- busca paginada DataJud por filtros (classe, vara, periodo), registrada em
  `docs/product/juridico-official-data-pendencias.md`.

## Projetos E Responsabilidades

| Projeto | Responsabilidade |
|---|---|
| `implementations/svc-jboot-juridico-data` | Nenhuma mudanca. `POST /v1/datajud/processos/consulta` ja entrega capa e movimentos; persistencia e proibida pelo contrato do servico. |
| `implementations/bff-jboot-platform/modules/juridico` | Persistir snapshot `manual_query`, retencao com excecao, auditoria de export, ponte para acompanhamento. |
| `implementations/bff-jboot-platform/src/modules/domain-integrations` | Rota e adapter `datajud -> flow`, vinculo processo/card, notificacao de mudanca. |
| `implementations/bff-jboot-platform/modules/kanban` | Expor escrita programatica de `system_event` para chamador interno. |
| `implementations/app-jboot-next-platform/modules/juridico` | Acao "Exportar para o Flow" no resultado da consulta. |
| `implementations/app-jboot-next-platform/modules/kanban` | Toggle "Monitorar" no card de origem juridica e leitura da linha do tempo. |
| `implementations/wrk-jboot-juridico` | Nenhuma mudanca de workflow; ajuste da primeira execucao para baseline silencioso. |

## Sprints

Numeracao continua a sequencia de `docs/product/juridico-official-data-sprints.md`,
que encerrou na Sprint 4, para nao colidir com as sprints daquele arco.

| Sprint | Objetivo | Estado |
|---|---|---|
| 5 | Persistencia da consulta DataJud e retencao | concluida |
| 6 | Export DataJud -> Flow com auditoria | concluida |
| 7 | Monitorar pelo card e eventos de mudanca | concluida |
| 8 | Buscar processos por OAB na tela de consulta | concluida |

### Sprint 5 — Persistencia Da Consulta E Retencao

**Estado: concluida** (2026-09-09)

Migration: `docker/postgres/init/054_juridico_data_manual_snapshots.sql`.
Evidencia: consulta real de 5006004-13.2021.8.24.0058 (TJSC) gravou um snapshot
`manual_query` com capa completa, 89 movimentacoes e numero cifrado (48 bytes);
reconsultar o mesmo processo nao duplicou o snapshot.

Objetivo: dar ao export uma origem estavel, sem alterar o comportamento visivel
da consulta.

Entregaveis:

- generalizar `juridico_data_process_snapshots`: `monitor_id` e `monitor_run_id`
  passam a nullable, com discriminador `origin` (`monitor` | `manual_query`) e
  `CHECK` garantindo `monitor_id NOT NULL` quando `origin = 'monitor'`;
- acrescentar ao snapshot os campos de capa hoje so em transito:
  `numero_processo`, `datajud_id`, `grau`, `data_ajuizamento`, `formato`,
  `sistema`, `classe`, `orgao_julgador`, `assuntos`, `sincronizado_em`;
- `DataJudRepository.upsertManualSnapshot()` e `getSnapshot()`;
- `DataJudService.queryProcess()` grava o snapshot e devolve `snapshotId`;
- purga de 180 dias estendida a snapshots `manual_query`.

Criterios de aceite:

- consultar um processo grava exatamente um snapshot por
  `(client_id, numero_processo, tribunal)`, atualizado a cada nova consulta;
- ~~snapshot de monitor continua funcionando sem alteracao de comportamento~~ —
  **revisto na Sprint 7**: o snapshot de monitor passou a ser um por monitor, e
  nao um por fingerprint. A mudanca foi deliberada e corrige a inundacao de
  eventos descrita em "Defeitos Pre-existentes"; o criterio original ficou
  superado, nao descumprido;
- teste de purga cobrindo as duas origens
  (`src/modules/juridico/datajud/datajud-purge.spec.ts`);
- resposta da API de consulta permanece compativel, apenas somando `snapshotId`.

Justificativa da generalizacao em vez de tabelas novas: a deteccao de mudanca
(`process_fingerprint`, `movement_fingerprint`) ja existe nessas tabelas e e
exatamente o mecanismo que a Sprint 7 precisa.

### Sprint 6 — Export DataJud -> Flow

**Estado: concluida** (2026-09-09)

Migration: `docker/postgres/init/055_juridico_data_flow_exports.sql`.
Evidencia: export real criou card de 3423 caracteres no banco do Flow; segundo
export do mesmo processo devolveu `created: false` sem duplicar; vinculo e
auditoria gravados no banco juridico.

Entregaveis:

- `POST /domain-integrations/juridico/datajud/processos/:snapshotId/export-flow`;
- `DomainIntegrationsService.exportDataJudProcessToFlow()` e
  `toFlowCardInput(snapshot)`, com `sourceModule: 'juridico'`,
  `sourceType: 'datajud_processo'`, `sourceId: '<CNJ>:<TRIBUNAL>'`,
  `sourceUrl: '/juridico/consultas/processo?numero=...'`;
- tabela `juridico_data_flow_exports`: `client_id`, `snapshot_id`,
  `numero_processo`, `tribunal`, `board_id`, `card_id`, `flow_database_ref`,
  `exported_by_identity_id`, `monitor_id` (nullable),
  `last_notified_fingerprint`, timestamps;
- auditoria do export em `juridico_audit_events`, **tambem para o exportador
  PJe**, corrigindo a divergencia entre contrato e implementacao;
- acao "Exportar para o Flow" no resultado da consulta, reusando o seletor de
  board de `PjeComunicacoesList` — extrair o seletor para componente
  compartilhado em vez de duplicar;
- estado "ja exportado" com link para o card quando `created: false`.

Criterios de aceite:

- exportar o mesmo processo duas vezes para o mesmo board devolve o card
  existente sem duplicar e sem alterar o card;
- exportar para boards diferentes cria um card em cada, com um vinculo por board
  e o mesmo HMAC de processo (teste em `domain-integrations.service.spec.ts`);
- o card e legivel sem qualquer acesso ao juridico;
- todo export gera registro de auditoria com identidade, processo, board e card;
- usuario sem Flow contratado recebe `flow_not_contracted`;
- usuario sem papel no board recebe negativa do Kanban, nao do juridico: o erro
  do Kanban chega intacto ao chamador, sem ser reembrulhado como erro juridico
  nem convertido em 503 (teste em `domain-integrations.service.spec.ts`).

### Sprint 7 — Monitorar Pelo Card

**Estado: concluida** (2026-09-09)

Migration: `docker/postgres/init/056_juridico_data_monitor_baseline.sql`.
Evidencia: ativar o monitoramento pelo card estabeleceu baseline de 89
movimentacoes sem gerar evento algum; apos remover uma movimentacao do baseline,
a execucao seguinte gerou exatamente 1 `movement_detected` e 1 `system_event`
`juridico_process_changed` no card, com titulo e descricao inalterados.
Desativar, purgar o baseline e religar reconstruiu as 89 movimentacoes e gerou
zero eventos, sem inundar o card. Reexecutar com o mesmo estado nao duplica o
evento: `last_notified_fingerprint` deduplica.

Entregaveis:

- toggle "Monitorar" no card de origem juridica, visivel apenas para
  `sourceType` de origem juridica;
- ao ativar: cria acompanhamento via API existente e guarda `monitor_id` em
  `juridico_data_flow_exports`; ao desativar: pausa o monitor e devolve o
  snapshot ao ciclo de 180 dias;
- primeira execucao apos ativacao estabelece baseline sem gerar evento;
- `DomainIntegrationsService.notifyProcessChanged()`: compara fingerprint com
  `last_notified_fingerprint` e grava `system_event`
  `juridico_process_changed` com `{ numeroProcesso, tribunal, novosMovimentos,
  detectadoEm }` em cada card vinculado;
- expor escrita programatica de `system_event` no `ActivitiesService` (hoje so
  `createComment` e publico) — entregue como
  `ActivitiesService.recordIntegrationEvent`, sem exigir contexto de board nem
  papel: o chamador e modulo interno que ja validou o vinculo do card, e o
  evento e historico, nao acao de usuario.

Criterios de aceite:

- ativar monitoramento em processo sem movimentacao nova nao gera evento algum;
- movimentacao nova gera exatamente um `system_event` por card vinculado, sem
  alterar titulo, descricao ou `source_payload`;
- desativar e reativar apos a purga do baseline nao inunda o card: a primeira
  execucao volta a ser silenciosa;
- card e linha do tempo permanecem integros apos a purga do snapshot no
  juridico.

Risco tecnico: card e processo vivem em bancos diferentes
(`jboot_kanban_*` e banco do juridico). Nao ha transacao unica; a ordem de
escrita e a idempotencia do evento precisam ser explicitas para nao gerar evento
duplicado em retry.

### Sprint 7.1 — Cadencia Individual No Card

**Estado: concluida** (2026-09-13)

Objetivo: expor e permitir editar, direto no card aberto no Flow, a cadencia
de consulta do monitoramento DataJud ja vinculado ao card (Sprint 7), sem
precisar abrir a tela `Jurídico > Acompanhamentos`.

Premissa verificada no codigo (nao e regra nova, so lembrete): a cadencia
**ja e individual por monitor** desde a Sprint de acompanhamentos
(`juridico_data_monitors.cadence`, coluna por linha, editavel via
`PATCH /datajud/monitors/:id`, cada monitor roda em workflow Temporal proprio
e independente). Nao existe cadencia global/coletiva hoje. O gap eso de UX:
o card no Flow so expoe um toggle on/off (Sprint 7), sem mostrar nem editar a
cadencia do monitor vinculado.

Decisao de arquitetura: nao criar um segundo mecanismo de agendamento dentro
do Flow. `DomainIntegrationsService` (bridge ja existente entre kanban e
juridico) passa a expor a cadencia do monitor vinculado ao card e um PATCH
para altera-la, delegando internamente para o mesmo
`DataJudMonitorService.update()` que a tela de Acompanhamentos ja usa — uma
unica fonte de verdade e um unico agendador (Temporal), so um segundo ponto
de entrada de UI.

Fluxos:

- Card de origem juridica com monitoramento ativo (Sprint 7) exibe, no canto
  superior direito do modal do card, 4 indicadores circulares representando
  as cadencias possiveis em dias: `1` (diario), `7` (semanal), `14`
  (quinzenal), `30` (mensal).
- O indicador correspondente a cadencia atual do monitor vem marcado/ativo ao
  abrir o card.
- Clicar em outro indicador dispara a atualizacao da cadencia imediatamente
  (chamada direta, sem exigir salvar o card), com feedback visual de
  sucesso/erro no proprio indicador.
- Controle so aparece para card com `sourceType` de origem juridica E
  monitoramento ativo (mesmo criterio de visibilidade do toggle da Sprint 7);
  card sem monitor ativo nao mostra os indicadores.

Entregaveis:

- `GET /domain-integrations/flow/cards/:id/monitoramento` passa a incluir
  `monitorId` e `cadence` na resposta (hoje so retorna `{ monitoring,
  hasSource }`), quando `monitoring=true`.
- `PATCH /domain-integrations/flow/cards/:id/monitoramento/cadencia`
  (`{ cadence: 'daily'|'weekly'|'biweekly'|'monthly' }`), delegando para
  `DataJudMonitorService.update(monitorId, { cadence })` a partir do
  `monitor_id` ja guardado em `juridico_data_flow_exports` (Sprint 7). Sem
  tabela nova.
- Frontend: componente novo de 4 indicadores no cabecalho de `CardModal.tsx`
  (`app-jboot-next-platform/src/modules/kanban/components/`), reaproveitando
  o padrao visual ja usado no motor de automacao (Sprint 8/9) para
  ativo/inativo. Chamada otimista com rollback em erro.

Criterios de aceite:

- card com monitoramento ativo mostra a cadencia atual marcada corretamente
  ao abrir;
- clicar em outra cadencia atualiza o monitor sem exigir salvar o card, e o
  worker Temporal do processo passa a rodar na nova cadencia (verificavel via
  `nextCheckAt`);
- card sem monitoramento ativo nao mostra os indicadores;
- alterar a cadencia de um card nao afeta a cadencia de nenhum outro monitor
  (idempotencia/isolamento por `monitor_id`).

Dependencias:

- Sprint 7 concluida (`monitor_id` guardado em `juridico_data_flow_exports`).

Fora de escopo:

- cadencia customizada alem dos 4 presets existentes (`daily/weekly/
  biweekly/monthly`) — mudar isso e decisao de produto do Juridico, fora
  desta sprint;
- criar/remover monitoramento a partir dos indicadores (isso continua sendo o
  toggle da Sprint 7, nao muda).

## Registro LGPD

Retencao e **por base de dados**, nao uniforme (decisao do usuario, 2026-09-09):

- **Flow**: o card exportado e registro permanente do cliente, sem prazo de
  expurgo, inclusive apos o processo ser encerrado ou o cliente desistir.
  Exclusao deve ser logica (soft delete), nao fisica;
- **Juridico**: nao retem dado processual apos 180 dias da ultima consulta ou da
  desativacao do monitoramento, exceto o baseline necessario enquanto o
  monitoramento estiver ativo.

Um usuario do Flow ver o dado persistido na base do Flow e comportamento
**correto e intencional**, nao risco a mitigar: o card e o registro do cliente
naquele produto. Nao se exige acesso ao modulo Juridico para le-lo. A auditoria
do export no lado juridico (`juridico_audit_events`) existe para rastrear quem
levou o dado para la, nao para restringir a leitura.

Ponto em aberto, registrado em `JUR-003`: o modulo Kanban ja expoe exclusao
**fisica** de card arquivado, o que contraria a regra de soft delete acima para
cards de origem juridica. Resolver e decisao do produto Flow, fora destas
sprints.

### Sprint 8 — Buscar Processos Por OAB

**Estado: concluida** (2026-09-09)

Evidencia: `GET /juridico/datajud/processos/por-oab` com a OAB 75900/PR devolveu
25 processos a partir de 69 publicacoes em **243ms**, contra os 87s que o
enriquecimento completo levaria. Exportar um processo da lista e reconsultar a
OAB devolveu esse processo marcado como ja exportado, com o link do card.

Objetivo: o advogado informa a OAB e recebe a lista dos seus processos, escolhe
quais quer detalhar e exporta os escolhidos para o Flow.

Mecanica real (decisao registrada aqui porque **nao aparece na interface**): a
lista vem do DJEN, unica fonte oficial que aceita OAB como filtro — o indice do
DataJud nao possui campo de OAB, advogado ou parte, verificado em 2026-09-09
contra `api_publica_tjpr` (14 campos, nenhum deles de pessoa) e por busca
full-text do numero da OAB, que retornou zero. Os detalhes de capa e
movimentacao vem do DataJud, por numero CNJ.

Decisao do usuario em 2026-09-09: a tela **nao** revela essa composicao. O
usuario final nao precisa da distincao entre as duas fontes do CNJ e a entrega
lhe parece uma coisa so. A mecanica fica registrada neste documento e em
comentario no metodo que a implementa.

Medicao que define o desenho (OAB 75900/PR, 01/06 a 09/09/2026):

| Metrica | Valor |
|---|---|
| Comunicacoes DJEN | 69 |
| Processos distintos apos dedupe | 25 |
| Encontrados no DataJud | 21 |
| Ausentes no DataJud (404) | 3 |
| Tempo para consultar os 25 no DataJud | 87s |

Os 87s proibem enriquecer tudo no carregamento da tela: o custo e o rate limit
proprio do servico (0,2s entre chamadas, ate 3,5s por processo com retry). Dai o
fluxo em duas etapas.

Entregaveis:

- `GET /juridico/datajud/processos/por-oab` no BFF: consulta a fonte por OAB+UF
  e periodo, deduplica por numero de processo e devolve numero, tribunal, classe
  e data da ultima publicacao. Nao chama o DataJud;
- OAB default vinda da configuracao ja existente do tenant, editavel na tela;
- enriquecimento sob demanda: o processo selecionado usa
  `POST /juridico/datajud/processos/consulta`, que ja persiste snapshot e
  devolve `snapshotId`;
- selecao multipla e export para o Flow reusando o export da Sprint 6, que ja e
  idempotente por `<CNJ>:<TRIBUNAL>`;
- exportar **nao** exige detalhar antes: o usuario seleciona e exporta, e o
  detalhe e buscado sob demanda apenas do que ainda nao tem snapshot. Conferir
  os dados antes e opcional, nao etapa obrigatoria do fluxo. Decisao do usuario
  em 2026-09-09: na maioria dos casos o advogado joga para o Kanban sem
  conferir.

Criterios de aceite:

- buscar por OAB responde em segundos, sem consultar o DataJud;
- processos repetidos em varias publicacoes aparecem uma unica vez;
- processo ausente no DataJud e estado normal da tela, nao erro;
- a interface nao menciona a fonte da listagem;
- exportar dois processos cria dois cards; repetir nao duplica;
- exportar sem detalhar funciona: o detalhe e buscado antes do export, com
  andamento visivel processo a processo;
- processo sem registro na base e contado e reportado, sem abortar o lote;
- processo ja exportado aparece marcado numa nova consulta, com link para o card
  existente, para o advogado nao reexportar sem perceber.

## Defeitos Pre-existentes Corrigidos Durante A Entrega

O monitoramento DataJud constava como entregue na Sprint 2, mas nunca executou:
quatro defeitos encadeados o impediam, cada um mascarando o seguinte.

| Defeito | Local | Efeito |
|---|---|---|
| `getAuthTag()` chamado antes de `final()` | `DataJudMonitorCryptoService.encrypt` | criar acompanhamento sempre lancava excecao |
| `clientId`/`audience` do worker fora do `@IsIn` | `bff-jboot-identity` `ServiceTokenDto` | worker nunca obtinha service-token (400) |
| parametro nulo sem cast | `DataJudMonitorRepository.update` | pausar acompanhamento falhava com 42P08 |
| parametro passado e nao referenciado | `DataJudMonitorRepository.completeRun` | concluir execucao falhava com 42P08 |
| `JBOOT_JURIDICO_WORKER_SERVICE_CLIENT_SECRET` ausente | `docker-compose.yml` | worker sem credencial s2s em qualquer ambiente |
| parser DJEN sem truncamento | `djen.py` `_as_str` | teor acima de 20.000 caracteres fazia o Pydantic rejeitar e derrubar a pagina inteira com 500, perdendo as demais comunicacoes |

Alem deles, a deteccao de mudanca estava estruturalmente errada: como
`process_fingerprint` compunha a chave unica do snapshot, cada mudanca criava um
snapshot novo e reportava TODAS as movimentacoes como ineditas. Corrigido na
migration 056 junto com o baseline silencioso.

## Perguntas Abertas

Nenhuma bloqueante. Registradas como decisao futura do usuario:

- exibir no card a versao mais recente do processo em `source_payload` sem
  alterar o que e exibido, hoje congelado no momento do export;
- importacao no sentido inverso (Flow -> juridico).
