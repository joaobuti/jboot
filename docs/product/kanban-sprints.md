# Kanban Sprints

## Objetivo

Detalhar as sprints do produto Kanban (nome de exibicao "Flow") apos confirmacao da arquitetura, com responsabilidades por projeto, agents/skills envolvidos, criterios de aceite, dependencias, riscos e fora de escopo.

## Artefatos De Gate Por Sprint

Cada sprint funcional tem gate, modelo de dados e contrato OpenAPI proprios (convencao incremental, nao um documento unico consolidado):

| Sprint | Gate | Data Model | OpenAPI |
|---|---|---|---|
| 1 | `docs/product/kanban-sprint-1-gate.md` | `docs/data/kanban-sprint-1-data-model.md` | `docs/api/kanban-sprint-1-openapi.yaml` |
| 3 | `docs/product/kanban-sprint-3-gate.md` | `docs/data/kanban-sprint-3-data-model.md` | `docs/api/kanban-sprint-3-openapi.yaml` |
| 4 | `docs/product/kanban-sprint-4-gate.md` | `docs/data/kanban-sprint-4-data-model.md` | `docs/api/kanban-sprint-4-openapi.yaml` |
| 5 | `docs/product/kanban-sprint-5-gate.md` | — (sem tabela nova) | — (contrato leve, escopado em conversa) |
| 6 | `docs/product/kanban-sprint-6-gate.md` | — (sem tabela nova) | — (contrato leve, escopado em conversa) |
| 7 | `docs/product/kanban-sprint-7-gate.md` | `docker/postgres/init/019_kanban_notifications_due_date.sql` | — (contrato leve, escopado em conversa) |
| 8 | `docs/product/kanban-sprint-8-gate.md` | `docker/postgres/init/020_kanban_column_automation.sql` | — (contrato leve, escopado em conversa) |
| 13 | Secao "Sprint 13" abaixo (PE Decision) | `docker/postgres/init/088_kanban_automation_email_outbox.sql` | `docs/api/kanban-sprint-13-openapi.yaml` |

Sprint 2 (campos customizados/form builder) ainda nao tem gate funcional aberto.

## Projetos

| Projeto | Responsabilidade |
|---|---|
| `implementations/bff-jboot-platform/modules/kanban` | Backend de boards/colunas/cards e WebSocket gateway de realtime dentro da backend platform. |
| `implementations/app-jboot-next-platform/modules/kanban` | Web do board Kanban (produto "Flow") dentro da Next platform. |

Nao ha BFF standalone novo nem app mobile para este modulo.

## Sprint 1: Board, Coluna, Card e Realtime

Objetivo: implementar a base operacional do board Kanban com sincronizacao em tempo real entre usuarios.

Valor: tenant consegue criar boards, organizar colunas e mover cards entre colunas, com todos os usuarios conectados ao board vendo a movimentacao em tempo real, sem reload manual.

Fluxos:

- Usuario autorizado cria, edita e lista boards do tenant.
- Usuario autorizado cria, edita, reordena e remove colunas de um board (nome, ordem, cor, `wip_limit`).
- Usuario autorizado cria, edita e lista cards (titulo, descricao) dentro de uma coluna.
- Edicao/criacao de card e feita em modal/slide-over sobre o board (nao navega para tela nova), preservando contexto visual do board.
- Card aberto reflete o id na URL via query param (ex. `/flow/board/:boardId?card=:cardId`), permitindo compartilhar link direto e reabrir o mesmo card apos refresh.
- Usuario autorizado move card entre colunas via drag-and-drop.
- Movimentacao de card e propagada via WebSocket para todos os usuarios conectados ao mesmo board.
- Papeis binarios nesta sprint: `board_admin` (administra board/colunas) e `board_member` (opera cards); sem granularidade por coluna ainda.
- Usuario autorizado reordena cards dentro da mesma coluna (drag-and-drop); qualquer `board_member` ativo pode fazer isso.
- Usuario autorizado arquiva um card (`status = archived`): card sai da visualizacao do board, sem exclusao definitiva. Exclusao definitiva so e possivel a partir do estado arquivado e depende de perfil de permissao (Sprint 3) — fora de escopo aqui.
- `created_at` do card e preservado de forma imutavel desde a criacao, para suportar metricas futuras (lead time/cycle time). Calculo/relatorio de metricas nao faz parte desta sprint (ver observacao no final do documento).

Entregaveis:

- CRUD de `Board` e `BoardColumn` (nome, ordem, cor, `wip_limit`).
- CRUD basico de `Card` (titulo, descricao), reordenacao dentro da coluna e movimentacao entre colunas.
- Modal/slide-over de card com estado refletido na URL (`?card=:cardId`) via shallow routing do Next.js.
- Estado `archived` em `Card` (soft-remove, oculto do board, sem exclusao definitiva nesta sprint).
- Campo `created_at` imutavel em `Card`, exposto via API para consumo futuro de metricas.
- WebSocket Gateway (`@nestjs/websockets`) sincronizando `card.moved` (e eventos correlatos) entre usuarios do mesmo board.
- Web admin/operacao do board na Next platform, incluindo conexao WebSocket no client.
- Isolamento por `client_id` em banco dedicado (`dedicated_database`).

Projetos afetados:

- `bff-jboot-platform/modules/kanban`;
- `app-jboot-next-platform/modules/kanban`.

Agents/skills envolvidos:

- backend: `backend-node-typescript`, `platform-auth-context`, `platform-postgres`, `kanban-board-domain`, `kanban-board-crud`, `kanban-realtime`;
- web: `frontend-next-typescript`, `platform-layout`, `backend-contract-client`, `kanban-board-ui`.

Criterios de aceite:

- CRUDs de board/coluna/card separados por dominio;
- DTOs e contratos tipados;
- filtros por `client_id` em banco dedicado;
- drag-and-drop de card funcional entre colunas;
- card movido por um usuario aparece atualizado para outros usuarios conectados ao mesmo board sem reload;
- papeis `board_admin`/`board_member` aplicados nas mutacoes;
- estados de loading/empty/error/success no web.

Dependencias:

- decisao arquitetural aceita (banco dedicado, realtime via WebSocket nativo NestJS);
- contrato Identity Hub -> Flow definido (scopes `flow:read`/`flow:write`/`flow:admin`).

Riscos:

- realtime sem Redis/pub-sub limita a sincronizacao a uma unica instancia de `platform-api` — risco aceito e documentado, nao resolvido nesta sprint;
- duplicar regra de autorizacao no frontend;
- permitir input manual de `client_id`.

Fora de escopo:

- campos customizados de card;
- form builder do board;
- workflow de transicao de coluna restrito por papel;
- ACL granular por coluna;
- Redis/pub-sub multi-instancia;
- exclusao definitiva de card (depende de perfil de permissao — Sprint 3);
- atribuicao de card a usuarios, historico de comentarios/eventos e anexos (Sprint 4);
- calculo/relatorio de metricas (lead time, cycle time, throughput).

## Sprint 2: Campos Customizados E Form Builder

Objetivo: permitir que `board_admin` defina campos customizados para cards do board.

Valor: cada tenant adapta o card a sua propria estrutura de tarefas/projetos sem alteracao de codigo.

Fluxos:

- `board_admin` cria/edita/remove definicoes de campo (`CardFieldDefinition`) com tipo e obrigatoriedade.
- Usuario autorizado preenche valores de campo customizado em um card (`CardFieldValue`).
- Web exibe um form builder simples para `board_admin` configurar os campos do board.

Entregaveis:

- `CardFieldDefinition` (tipo, obrigatoriedade, ordem) normalizado.
- `CardFieldValue` normalizado, vinculado a card e a definicao de campo.
- Form builder simples no admin do board.
- Validacao de obrigatoriedade no preenchimento de card.

Projetos afetados:

- `bff-jboot-platform/modules/kanban`;
- `app-jboot-next-platform/modules/kanban`.

Agents/skills envolvidos:

- backend: `kanban-board-domain`, `kanban-board-crud`;
- web: `kanban-board-ui`.

Criterios de aceite:

- `board_admin` cria campo customizado com tipo valido;
- campo obrigatorio bloqueia salvar card sem valor;
- valores de campo customizado persistidos de forma normalizada (nao JSONB direto);
- form builder reflete ordem e tipo definidos pelo admin.

Dependencias:

- Sprint 1 concluida (Board/BoardColumn/Card/realtime estaveis).

Riscos:

- modelagem de tipo de campo generica demais gerar inconsistencia de validacao;
- form builder complexo demais para o escopo da sprint.

Fora de escopo:

- workflow de transicao de coluna;
- ACL granular por coluna;
- campos calculados/derivados.

## Sprint 3: Perfis De Movimentacao E Permissao Granular Por Coluna

Objetivo: permitir que cada board defina perfis nomeados (mais granulares que os 3 papeis fixos) controlando quais transicoes de coluna um membro pode executar e se ele pode excluir definitivamente cards arquivados.

Valor: tenants com fluxo de aprovacao/workflow formal podem restringir, por membro (nao so por papel fixo), quem move card para qual coluna e quem pode excluir cards arquivados definitivamente.

> Revisao de escopo (vs. versao anterior desta sprint): a granularidade deixa de ser por `papel` (`board_admin`/`board_member`/`board_viewer`) fixo e passa a ser por `MemberProfile` nomeado e configuravel por board (decisao do usuario: perfil e exclusivo de um board, nao reutilizavel entre boards). `board_admin` continua sempre bypassando qualquer restricao de perfil, tanto em movimentacao quanto em exclusao definitiva. Esta mudanca de modelo revisa a premissa de ACL por papel registrada em `MODULE_CONTRACT.md` e precisa de confirmacao do Architect antes da implementacao.

Fluxos:

- `board_admin` cria/edita/remove `MemberProfile` (nome) dentro do board.
- `board_admin` define, por perfil, quais transicoes `coluna origem -> coluna destino` sao permitidas (`MemberProfileTransition`).
- `board_admin` define, por perfil, se o membro pode excluir definitivamente um card ja arquivado (`can_delete_archived_cards`).
- `board_admin` atribui um `MemberProfile` a cada `board_member` do board; membro sem perfil atribuido nao move card entre colunas nem exclui card arquivado.
- `board_admin` sempre pode mover qualquer card para qualquer coluna e excluir qualquer card arquivado, independente de perfil (bypass).
- Movimentacao de card que viole as transicoes do perfil do usuario e bloqueada com erro estruturado.
- Exclusao definitiva de card arquivado e permitida para: autor do card, membro cujo perfil tem `can_delete_archived_cards`, ou `board_admin`.
- `board_admin` define `BoardColumnPermission` (ACL por perfil x coluna: ver/editar), substituindo a granularidade por papel.
- Usuario sem permissao de visualizacao de uma coluna nao a ve no board.

Entregaveis:

- `MemberProfile` (board_id, nome, `can_delete_archived_cards`).
- `MemberProfileTransition` (profile_id, coluna origem, coluna destino).
- `BoardColumnPermission` (profile_id, coluna, capacidades: ver/editar).
- Campo `profile_id` (nullable) em `BoardMember`.
- Validacao de transicao e de exclusao definitiva no backend antes de persistir.
- Web: tela de administracao de perfis por board; colunas/acoes visiveis conforme perfil do usuario logado.

Projetos afetados:

- `bff-jboot-platform/modules/kanban`;
- `app-jboot-next-platform/modules/kanban`.

Agents/skills envolvidos:

- backend: `kanban-board-domain`, `kanban-board-crud`, `kanban-realtime` (eventos devem respeitar ACL de quem recebe);
- web: `kanban-board-ui`.

Criterios de aceite:

- transicao de coluna fora do perfil do usuario retorna erro estruturado, nao falha silenciosa;
- exclusao definitiva de card arquivado bloqueada para quem nao e autor, nao tem `can_delete_archived_cards` no perfil, e nao e `board_admin`;
- `board_admin` nunca e bloqueado por perfil em nenhum cenario de teste (bypass valido);
- ACL por coluna aplicada tanto em leitura quanto em mutacao;
- eventos realtime nao revelam dados de coluna que o usuario destinatario nao pode ver;
- membro sem perfil atribuido nao move card entre colunas nem exclui card arquivado.

Dependencias:

- Sprint 1 e Sprint 2 concluidas;
- confirmacao do Architect sobre a mudanca de modelo papel -> perfil.

Riscos:

- complexidade de perfis crescer sem necessidade real do tenant (muitos perfis por board);
- eventos realtime vazarem dados de coluna restrita se o gateway nao filtrar por ACL antes de emitir;
- retrabalho se algum tenant ja estiver operando com o modelo antigo por papel antes desta revisao.

Fora de escopo:

- automacoes condicionais alem de transicao de coluna;
- notificacoes externas (email/push) de mudanca de workflow;
- perfis reutilizaveis entre boards.

## Sprint 4: Atribuicao Multipla, Historico Estilo Azure E Anexos

Objetivo: permitir atribuir cards a um ou mais usuarios e manter um historico unico (comentarios + eventos de sistema) por card, com anexos vinculados a cada registro do historico.

Valor: equipes acompanham quem e responsavel por cada card e tem um registro auditavel e colaborativo de tudo que aconteceu no card (estilo Azure Boards: discussao + historico no mesmo feed), incluindo arquivos trocados na conversa.

Fluxos:

- Qualquer `board_member` ativo atribui ou remove qualquer outro `board_member` ativo de um card (atribuicao multipla, N:N).
- Toda atribuicao/remocao gera um registro no historico do card.
- Usuario escreve um comentario de texto livre no card; comentario entra no feed cronologico do card.
- Eventos de sistema (mudanca de coluna, atribuicao/remocao, arquivamento, edicao de titulo/descricao) entram automaticamente no mesmo feed cronologico, misturados aos comentarios.
- Usuario anexa um ou mais arquivos a um registro especifico do historico (comentario ou evento).

Entregaveis:

- `CardAssignee` (card_id, identity_id) — N:N; identity precisa ser `board_member` ativo do board.
- `CardActivity` (card_id, tipo: `comment` | `system_event`, autor, payload/texto, created_at) — feed unico cronologico.
- `CardAttachment` (activity_id, nome do arquivo, content_type, tamanho, referencia de storage) — upload via MinIO.
- Geracao automatica de `CardActivity` do tipo `system_event` nas mutacoes relevantes (atribuicao, movimentacao, arquivamento, edicao).
- Web: aba/secao de historico no card (feed cronologico unificado), composer de comentario com upload de anexo, lista de responsaveis com avatar/badge.

Projetos afetados:

- `bff-jboot-platform/modules/kanban`;
- `app-jboot-next-platform/modules/kanban`.

Agents/skills envolvidos:

- backend: `kanban-board-domain`, `kanban-board-crud`;
- web: `kanban-board-ui`.

Criterios de aceite:

- atribuir/desatribuir gera evento no historico com autor e timestamp corretos;
- comentario e evento de sistema aparecem juntos, em ordem cronologica, no mesmo feed;
- anexo so pode ser adicionado vinculado a um registro existente do historico;
- apenas `board_member` ativo do board pode ser atribuido a um card do mesmo board;
- historico de um card nunca mistura dados de `client_id` diferente.

Dependencias:

- Sprint 1 concluida (Board/Column/Card/realtime estaveis);
- definicao de limites de upload (tamanho maximo, tipos permitidos) pelo PE/Architect antes da implementacao.

Riscos:

- volume de eventos automaticos poluir o feed e exigir filtro/paginacao desde o inicio;
- custo de storage de anexos sem limite definido;
- realtime do feed (novo comentario/evento) nao estava no escopo do gateway atual e precisa ser avaliado.

Fora de escopo:

- @mencoes com notificacao;
- edicao/exclusao de comentario apos um prazo;
- cards relacionados (bloqueia/e bloqueado por);
- labels/tags, due date e demais melhorias sugeridas como candidatas futuras.

## Sprint 6: Dashboard De Metricas (Home Do Modulo Flow)

Objetivo: adicionar uma pagina "Home" ao modulo Flow, acima de "Boards" no menu lateral, com metricas agregadas sobre os cards do tenant (todos os boards que o usuario pode acessar), filtravel por board, responsavel e status.

Valor: usuario tem visao consolidada do andamento do trabalho sem precisar abrir board por board.

Fluxos:

- Usuario acessa `/flow` (Home) e ve as metricas, sem filtro algum por padrao.
- Usuario seleciona board/responsavel/status nos 3 seletores; metricas recalculam respeitando a combinacao.
- "Cards por coluna", "Colunas com WIP excedido" e "Tempo medio por coluna" so aparecem quando um board especifico esta selecionado.

Entregaveis:

- Endpoint `GET /kanban/metrics?boardId=&assigneeId=&statusId=` (agregacao SQL, sem tabela nova).
- Pagina Home (`/flow`) com 3 seletores de filtro e os blocos de metrica (total, por status, por responsavel, sem responsavel, por coluna, throughput 30 dias, WIP excedido, tempo medio por coluna).
- `BoardListPanel` (conteudo atual de `/flow`) move para `/flow/boards`; menu lateral ganha "Home" acima de "Boards".
- Tempo medio por coluna (lead time): reconstrucao da timeline de cada card a partir de `CardActivity` (`card.moved`) + `Card.created_at`; **ultimo item implementado nesta sprint** (decisao do usuario, dado o custo/complexidade maior em relacao as demais metricas, que sao `group by`/`count` simples).

Projetos afetados:

- `bff-jboot-platform/modules/kanban`;
- `app-jboot-next-platform/modules/kanban`.

Agents/skills envolvidos:

- backend: `kanban-board-domain`, `kanban-board-crud`;
- web: `kanban-board-ui`.

Criterios de aceite:

- metricas nunca incluem board de outro `client_id` ou board onde o usuario nao e membro ativo;
- os 3 filtros combinam com AND e recalculam todas as metricas;
- "por coluna"/"WIP excedido"/"tempo medio por coluna" ausentes sem `boardId` selecionado;
- nomes de responsavel exibidos via resolucao de identidade, nunca UUID cru;
- "Boards" no menu continua funcionando, agora em `/flow/boards`;
- tempo medio por coluna reconstroi corretamente card nunca movido, movido varias vezes e arquivado.

Dependencias:

- Sprint 1, 4 e 5 concluidas (cards, assignees, status existentes).

Riscos:

- throughput usa `updated_at` como proxy de "quando foi arquivado" (sem timestamp dedicado de archive);
- agregacao sem paginacao em tenants com muitos cards exige indices adequados (ja existentes);
- tempo medio por coluna reconstroi a timeline em codigo da aplicacao (nao SQL puro) — custo cresce com numero de cards/eventos do board selecionado; por isso e o ultimo item implementado na sprint.

Fora de escopo:

- exportar metricas (CSV/PDF);
- dashboard configuravel pelo usuario;
- periodo customizado de metricas (so "ultimos 30 dias" fixo).

## Sprint 7: Notificacoes In-App E Vencimento

Objetivo: adicionar notificacoes operacionais do Flow e controle de vencimento em cards.

Valor: responsaveis recebem sinalizacao in-app sobre atribuicao, comentarios e movimentacoes relevantes; operadores conseguem priorizar cards vencidos no board e na Home de metricas.

Fluxos:

- Usuario atribuido a um card recebe notificacao `card.assigned`.
- Responsaveis atuais recebem notificacao quando o card recebe comentario (`card.commented`) ou muda de coluna (`card.moved`).
- O autor da propria acao nao recebe notificacao.
- Usuario define/limpa `due_date` no modal do card; cards ativos com `due_date < CURRENT_DATE` aparecem como atrasados.
- Header da platform mostra dropdown real de notificacoes somente no modulo Flow.

Entregaveis:

- Migration `019_kanban_notifications_due_date.sql` com `kanban_notifications` e `kanban_cards.due_date`.
- Backend `NotificationsRepository/Service/Controller`, hooks em atribuicao/comentario/movimentacao e room WebSocket por identidade (`user:{identityId}`).
- `Card.dueDate` em DTO/repository/service, evento de sistema `card.due_date_changed` e `overdueCount` em `GET /kanban/metrics`.
- Frontend `kanbanApi.notifications`, `NotificationsDropdown.tsx`, `useCurrentModule`, Header condicional, input de vencimento no `CardModal`, badge de atrasado no board e card de metrica "Atrasados" na Home.

Projetos afetados:

- `bff-jboot-platform/modules/kanban`;
- `app-jboot-next-platform/modules/kanban`.

Agents/skills envolvidos:

- backend: `kanban-board-domain`, `kanban-board-crud`, `kanban-realtime`;
- web: `kanban-board-ui`, `backend-contract-client`, `platform-layout`.

Criterios de aceite:

- notificacoes persistidas e listadas por identidade autenticada;
- `notification.created` emitido para a room do destinatario, nunca para todos os sockets do board;
- mark-read individual e mark-all nao afetam notificacoes de outro usuario;
- `dueDate` aceita criacao, atualizacao e limpeza explicita (`null`);
- `overdueCount` ignora cards arquivados e cards com vencimento hoje/futuro;
- UI de notificacoes nao aparece nos modulos `pdv`/`juridico`.

Fora de escopo:

- email/push externo;
- job de alerta automatico por data de vencimento;
- mencoes textuais com `@usuario`.

## Sprint 8: Motor De Automacao Por Coluna

Objetivo: permitir que administradores do modulo Flow configurem acoes automaticas
por coluna do board, disparadas por gatilhos de eventos do card. A fundacao
implementa um unico par gatilho/efeito (card entrou na coluna -> envia e-mail de
notificacao), mas o motor e modelado de forma generica (`trigger_type`/
`action_type`) para suportar novos gatilhos (ex.: card parado X dias, prazo
vencido) e novos efeitos (ex.: webhook, criar tarefa) em sprints futuras sem
redesenho de modelo.

Valor: tenants com fluxo de aprovacao/workflow formal automatizam comunicacao
quando um card muda de estado, sem depender de acao manual do usuario que move
o card.

Fluxos:

- Administrador do board (`board_admin`) cria, na configuracao de uma
  `BoardColumn`, uma ou mais `ColumnAutomationRule` com
  `trigger_type = column_entered` e `action_type = send_email_notification`.
- Administrador escolhe o papel de destinatario dinamico da acao: `assignee`
  (responsaveis atuais do card, `CardAssignee`), `creator`
  (`Card.created_by_identity_id`) ou `board_member` (identidade fixa escolhida
  entre os membros do board na configuracao da regra).
- Administrador ativa, desativa ou remove (soft) uma `ColumnAutomationRule`
  existente.
- Ao mover um card (drag-and-drop ou qualquer via existente de movimentacao) para
  uma coluna com `ColumnAutomationRule` ativa de `trigger_type = column_entered`,
  o motor dispara, de forma assincrona (fila BullMQ sobre Valkey), cada
  `action_type` configurado na coluna de destino.
- Reentrada na mesma coluna dispara a regra novamente (sem supressao por
  disparo anterior no mesmo card).
- E-mail enviado informa titulo do card, coluna de origem, coluna de destino,
  quem moveu o card e data/hora da movimentacao.
- Disparo sem destinatario resolvivel (ex.: papel `assignee` sem nenhum
  responsavel atribuido no momento) nao gera erro, apenas ausencia de envio.
- Falha no envio (provedor indisponivel) nunca bloqueia nem reverte a
  movimentacao do card ja persistida.
- Reprocessamento do mesmo evento de movimentacao (retry de fila/job) nao
  duplica o envio (idempotencia por `card_id` + `board_column_id` +
  `automation_rule_id` + `source_activity_id` do `CardActivity.system_event`
  `card.moved` que originou o disparo).

Entregaveis:

- `kanban_column_automation_rules` e `kanban_automation_dispatch_log`
  (`docker/postgres/init/020_kanban_column_automation.sql`).
- Fila BullMQ `kanban:column-automation` sobre Valkey, worker dentro do
  processo `platform-api` (sem app/worker standalone novo).
- `MailerService` proprio do modulo kanban (nodemailer + SMTP generico via
  env) — nao reaproveita `src/modules/notifications` (escopo diferente:
  in-app/WebSocket).
- Backend: CRUD de `ColumnAutomationRule` restrito a `board_admin`
  (`GET/POST/PATCH/DELETE /kanban/boards/:boardId/columns/:columnId/automation-rules`).
- Web: aba/secao "Automacoes" na configuracao da coluna, visivel e editavel
  apenas para `board_admin`.

Projetos afetados:

- `bff-jboot-platform/modules/kanban`;
- `app-jboot-next-platform/modules/kanban`.

Agents/skills envolvidos:

- backend: `kanban-board-domain`, `kanban-board-crud`;
- web: `kanban-board-ui`.

Criterios de aceite:

- `board_admin` cria regra `column_entered -> send_email_notification` com
  papel de destinatario configuravel;
- usuario sem `board_admin` no board nao cria/edita/remove regra
  (403 estruturado);
- mover card para coluna com regra ativa dispara envio assincrono para todos
  os destinatarios resolvidos pelo papel configurado;
- reentrada na mesma coluna dispara novamente;
- reprocessamento do mesmo evento nao duplica envio;
- falha de envio nao bloqueia nem reverte a movimentacao do card;
- card sem destinatario resolvivel nao gera erro, so ausencia de envio;
- regra de automacao de um tenant nunca dispara nem e visivel para outro
  `client_id`;
- coluna sem regra ativa nao sofre nenhum efeito colateral de automacao.

Dependencias:

- Sprint 1 concluida (Board/BoardColumn/Card/movimentacao estaveis);
- Sprint 4 concluida (`CardAssignee`, `Card.created_by_identity_id`) para
  resolucao de destinatario dinamico;
- Valkey ja presente no `docker-compose.yml` como container `required` do
  target `code-up:kanban`, reaproveitado agora como broker BullMQ (excecao
  formal registrada no `MODULE_CONTRACT.md`, ver `docs/product/kanban-sprint-8-gate.md`);
- SMTP generico via env (nodemailer), sem provedor transacional dedicado.

Riscos:

- enqueue fire-and-forget: se Valkey estiver indisponivel no exato momento da
  movimentacao, o job se perde silenciosamente (so logado) — sem outbox
  transacional nesta fundacao;
- sem DLQ dedicada: jobs esgotados ficam no failed set do BullMQ + linha
  `status='failed'` em `kanban_automation_dispatch_log`, sem alerta automatico;
- sem tracking de bounce/reputacao de dominio (SMTP generico) — se o volume de
  e-mail crescer, migrar para provedor transacional exige nova decisao humana.

Fora de escopo:

- gatilhos alem de `column_entered` (ex.: card parado X dias, prazo vencido);
- efeitos alem de `send_email_notification` (ex.: webhook, criar tarefa);
- cancelamento de disparo ja enfileirado quando o card e movido novamente
  antes do envio;
- throttling/agregacao de multiplos disparos em um unico e-mail;
- indicador visual para membros/viewers de que uma coluna tem automacao
  configurada;
- tela dedicada de historico/log de automacoes alem do necessario para
  idempotencia.

## Sprint 9: Gatilhos Adicionais De Automacao

> Status: `concluida` (2026-10-16). Implementacao funcional concluida em
> 2026-10-14; o unico bloqueio era o registry/gate do Architecture Graph, que
> ficou operacional em 2026-10-16 (`make ai-architecture-graph-gate` sem
> findings).

Objetivo: estender o motor generico de automacao por coluna (Sprint 8) com
quatro `trigger_type` novos, mantendo o `action_type` existente
(`send_email_notification`): `due_date_approaching`, `card_stale`,
`column_left` e `juridico_process_moved`. Nao introduz `action_type` novo nem
motor 100% generico de qualquer gatilho — sao exatamente estes quatro.

Valor: automatiza sinalizacao de prazo se aproximando e card parado (que hoje
dependem de olhar a Home/board manualmente), formaliza o inverso de
`column_entered` (sair de uma coluna, ex.: sair de "Triagem" sem ter sido
movido para lugar nenhum de acompanhamento) e conecta o motor de automacao ao
re-sync continuo de processo juridico (DataJud/PJe), sem exigir que o usuario
abra o card para saber que o processo teve movimentacao.

> Nota de configuracao (sem sprint/codigo): os casos "notificar `assignee` ao
> entrar em coluna Prazo Fatal/Urgente", "notificar `creator` ao entrar em
> Aguardando Cliente" e "notificar `board_member` fixo ao entrar em
> Concluido/Arquivado" **ja sao possiveis hoje** com o motor da Sprint 8
> (`trigger_type=column_entered` + `action_type=send_email_notification`,
> variando apenas `recipient_role` por regra). Sao receita de configuracao via
> UI existente, nao geram sprint nem alteracao de codigo; registrados aqui
> apenas para nao serem reimplementados por engano.

Fluxos:

- Administrador do board cria, em uma coluna, uma `ColumnAutomationRule` com
  `trigger_type = due_date_approaching`, configurando `N` (dias antes de
  `Card.due_date`, inteiro >= 0, sem preset fixo na API).
- Um job agendado (novo, primeiro scheduler do modulo, BullMQ repeatable job
  sobre a mesma fila/worker da Sprint 8 — ver decisao do Architect no gate)
  roda 1x/dia e avalia, para cada card ativo (nao arquivado,
  nao deletado) atualmente na coluna da regra, se `due_date - N dias =
  hoje` (casamento pelo dia exato do gatilho, nao "qualquer dia dentro da
  janela restante") e `due_date IS NOT NULL`.
- Administrador cria `ColumnAutomationRule` com `trigger_type = card_stale`,
  configurando `X` (dias parado, inteiro > 0). O mesmo job diario avalia, para
  cada card ativo atualmente na coluna da regra, se o tempo desde a ultima
  entrada do card nessa coluna (ultimo `CardActivity.system_event` de
  `card.moved` que trouxe o card para a coluna atual, ou `Card.created_at`
  quando o card foi criado direto nela e nunca saiu) e `>= X` dias.
- Administrador cria `ColumnAutomationRule` com `trigger_type = column_left`
  na coluna de **origem** que deve disparar ao ser abandonada. Ao mover um
  card para fora dessa coluna (mesmo hook de `cards.service.ts::move()` usado
  por `column_entered`), o motor dispara de forma assincrona, igual ao fluxo
  ja existente.
- Administrador cria `ColumnAutomationRule` com `trigger_type =
  juridico_process_moved` em qualquer coluna. Quando
  `DomainIntegrationsService.notifyProcessChanged()` grava um
  `CardActivity.system_event` do tipo `juridico_process_changed` para um card,
  e esse card esta, no momento do evento, na coluna da regra, o motor dispara
  de forma assincrona.
- Card sem `due_date`, card sem movimentacao suficiente, card sem monitor
  juridico ativo, ou card em coluna sem regra ativa: ausencia de fato gerador,
  nunca erro.
- Falha de envio, destinatario nao resolvivel e isolamento por `client_id`
  seguem exatamente as mesmas regras da Sprint 8 (motor comum).

Entregaveis:

- Extensao de `trigger_type` em `kanban_column_automation_rules` (CHECK
  constraint) para aceitar `due_date_approaching`, `card_stale`,
  `column_left`, `juridico_process_moved`, com coluna de configuracao
  numerica da regra (`trigger_config` — reaproveitar campo generico se ja
  existir na Sprint 8, ou migration nova minima) para armazenar `N`/`X`.
- Scheduler novo (BullMQ repeatable job, cron diario, decisao do Architect —
  ver `docs/product/kanban-sprint-9-gate.md`) dentro do processo
  `platform-api`, publicando na mesma fila BullMQ do motor de automacao
  (`kanban-column-automation`) — reaproveita worker/consumer existente, nao
  cria fila nova nem introduz `@nestjs/schedule`.
- Extensao de idempotencia para gatilhos baseados em tempo (4 e 5): a
  `UNIQUE` atual de `kanban_automation_dispatch_log`
  (`card_id, board_column_id, automation_rule_id, source_activity_id`)
  depende de `source_activity_id` de um evento reativo, que nao existe para
  `due_date_approaching`/`card_stale`. Definicao exata da chave de
  idempotencia por dia (ex.: `source_activity_id` nulo + coluna
  `triggered_for_date`, ou tabela auxiliar) e decisao de modelo de dados do
  Architect no contrato tecnico desta sprint — regra de negocio aqui e
  **no maximo 1 disparo por `(regra, card, dia)`**, nunca mais de um por dia
  enquanto a condicao persistir.
- Hook de `column_left` ao lado do hook existente de `column_entered` em
  `cards.service.ts::move()`, reaproveitando `card.boardColumnId` (coluna de
  origem) ja disponivel sem query extra.
- Hook de `juridico_process_moved` em `DomainIntegrationsService.notifyProcessChanged()`
  (ou no ponto que persiste o `CardActivity.system_event` `juridico_process_changed`),
  resolvendo a coluna atual do card no momento do evento.
- Web: os 4 `trigger_type` novos disponiveis no seletor da aba "Automacoes" da
  configuracao de coluna, com campo numerico (`N`/`X` dias) exibido apenas
  para `due_date_approaching`/`card_stale`.

Projetos afetados:

- `bff-jboot-platform/modules/kanban`;
- `app-jboot-next-platform/modules/kanban`.

Agents/skills envolvidos:

- backend: `kanban-board-domain`, `kanban-board-crud`;
- web: `kanban-board-ui`.

Criterios de aceite:

- `due_date_approaching` dispara exatamente no dia em que `due_date - N =
  hoje`, uma unica vez por regra por card naquele dia, mesmo com retry do
  job/fila;
- alterar `due_date` para uma nova data reabre a possibilidade de disparo (a
  janela de idempotencia e por dia calculado, nao um "ja disparou uma vez para
  sempre" por card/regra);
- limpar `due_date` (`null`) apos a regra ja ter disparado nao gera erro nem
  disparo retroativo; card some da avaliacao do job enquanto `due_date` for
  `null`;
- `card_stale` dispara quando o card completa `X` dias na coluna atual sem ter
  saido dela, no maximo uma vez por regra por card por dia enquanto a condicao
  persistir;
- mover o card para fora e de volta para a mesma coluna reinicia a contagem de
  `card_stale` (nova entrada = novo marco de tempo zero);
- `column_left` dispara ao mover o card para fora da coluna configurada,
  independente da coluna de destino, sem duplicar em reprocessamento do mesmo
  evento de movimentacao;
- `juridico_process_moved` dispara quando `juridico_process_changed` e
  registrado para um card que esta, naquele momento, na coluna da regra;
  card sem monitor juridico ativo ou em coluna sem essa regra nunca dispara e
  nunca gera erro;
- card arquivado ou deletado (`status != active`) e excluido da avaliacao dos
  jobs agendados (`due_date_approaching`, `card_stale`);
- todas as regras de isolamento por `client_id`, resolucao de `recipient_role`
  e nao bloqueio da operacao de origem em caso de falha (Sprint 8) valem
  identicamente para os 4 gatilhos novos.

Dependencias:

- Sprint 8 concluida (motor generico, fila BullMQ, `MailerService`,
  `kanban_automation_dispatch_log`);
- `docs/product/juridico-datajud-flow-sprints.md` / re-sync continuo
  (`DataJudMonitorService`, `ProcessChangeNotifierRegistry`,
  `DomainIntegrationsService.notifyProcessChanged()`) ja em producao/testado
  para o gatilho `juridico_process_moved`;
- decisao do Architect sobre a chave de idempotencia por dia para gatilhos
  baseados em tempo (ver Entregaveis).

Riscos:

- primeiro scheduler in-process do modulo (BullMQ repeatable job): precisa de
  cuidado para nao rodar em duplicidade se `platform-api` escalar para mais de
  uma instancia no futuro (mesma limitacao de instancia unica ja documentada
  para o WebSocket gateway);
- job diario avaliando todos os cards ativos de todos os boards com regra
  ativa pode nao escalar bem sem indices adequados (`due_date`,
  `board_column_id`) conforme volume de cards cresce — atencao no contrato
  tecnico;
- definicao de "card parado" por ultima entrada na coluna (nao por qualquer
  `CardActivity`) e uma escolha de produto que pode nao cobrir todos os casos
  de uso esperados pelo usuario — ver open question.

Fora de escopo:

- itens 8, 9 e 10 da lista original de ideias (registrados como ideia futura,
  tratados a parte, fora desta sprint);
- extrair prazo automaticamente do processo juridico (DataJud/PJe) para
  preencher `Card.due_date` — `due_date` continua exclusivamente manual;
- `action_type` novo (webhook, criar tarefa) — os 4 gatilhos novos usam
  exclusivamente `send_email_notification`, ja existente;
- motor 100% generico de qualquer trigger alem dos 4 listados;
- throttling/agregacao de multiplos disparos em um unico e-mail;
- cancelamento de job ja agendado quando a condicao deixa de ser valida antes
  da execucao do cron diario (ex.: `due_date` alterado minutos antes do job
  rodar ainda usa o valor no momento da execucao, nao ha invalidacao
  incremental).

## Sprint 10: Configuracoes Reutilizaveis, Permissoes E Escritorios

> Status: `concluida` (2026-10-16). Implementada em 2026-10-14 (evidencia e
> security checklist em `kanban-sprint-10-12-gate.md`); o registro da evidencia
> havia atualizado por engano o status da Sprint 9. Unico bloqueio era o
> Architecture Graph, operacional desde 2026-10-16.

Objetivo: transformar `Configuracoes` em uma navegacao extensivel por modulo e
entregar administracao de permissoes do modulo corrente, incluindo o vinculo de
escritorios durante o cadastro de usuarios do Flow.

Valor: o administrador do cliente gerencia usuarios sem acessar permissoes de
outros produtos; administradores delegados de escritorio nao conseguem ampliar
o proprio alcance; cada modulo contribui apenas com suas configuracoes.

Fluxos:

- `Configuracoes -> Permissoes` e global no shell, mas recebe o
  `application_slug` do contexto autenticado e lista somente roles/scopes desse
  modulo. Nunca aceita `application_slug` arbitrario do navegador.
- `Configuracoes -> Google Drive` e contribuicao exclusiva do `flow` nesta
  sprint. O registry suporta promover uma contribuicao a global futuramente
  por metadado, sem mover pagina ou reescrever o menu.
- O manager do cliente, identificado pela autorizacao canonica do Identity
  para administrar usuarios do tenant, escolhe um ou mais escritorios ativos
  ao cadastrar/editar um usuario do Flow.
- Um administrador delegado, autorizado a cadastrar usuarios apenas no Flow,
  nao escolhe escritorio: o backend vincula obrigatoriamente os mesmos
  escritorios ativos do ator. O campo aparece bloqueado. Sem escritorio ativo,
  o cadastro e recusado; o payload do cliente nunca amplia esse conjunto.
- Cadastro no Identity e vinculo no Flow usam uma operacao orquestrada e
  idempotente. Falha parcial fica reconciliavel; a UI nao coordena duas escritas
  independentes como se fossem uma transacao distribuida.

Entregaveis:

- registry tipado de contribuicoes de configuracao com `scope = global |
  module`, `applicationSlug`, rota, icone, label e regra de autorizacao;
- shell reutilizavel de `Configuracoes`, no padrao visual do menu de usuarios;
- `Permissoes` reutilizando/evoluindo `ModuleUserManager`, sem duplicar CRUD;
- contribuicao `Google Drive` registrada pelo Flow;
- facade backend de provisionamento de usuario Flow, coordenando Identity e
  `kanban_user_offices` com idempotencia, auditoria e reconciliacao;
- scopes distintos para manager do tenant e administrador delegado de
  escritorio, sem inferir autorizacao apenas pela UI.

Projetos afetados:

- `bff-jboot-identity` — catalogo e mutacao de permissoes por application;
- `bff-jboot-platform/modules/kanban` — policy de escritorios e facade Flow;
- `app-jboot-next-platform` — registry/shell global e contribuicoes de modulo.

Criterios de aceite:

- a tela nunca lista ou altera scope de outro `application_slug`;
- manager do cliente escolhe somente escritorios ativos do tenant;
- administrador delegado herda somente seus escritorios ativos e nao altera o
  campo nem por request manual;
- usuario de outro tenant, escritorio inativo e tentativa de elevar scopes
  recebem erro estruturado sem revelar dados;
- replay nao duplica identidade, entitlement, membership ou vinculo;
- falha entre Identity e Flow fica observavel e reconciliavel;
- adicionar configuracao futura de outro modulo exige registrar contribuicao,
  nao alterar condicionais centrais do sidebar.

Fora de escopo:

- permissao por card fora das ACLs existentes;
- delegacao entre tenants;
- tornar Google Drive global nesta sprint.

## Sprint 10.1: Drive Por Cliente (OAuth Pela Tela)

> Status: `concluida` (codigo, testes unitarios e gates em 2026-10-14); smoke
> externo com conta Google real `pendente` (depende do app OAuth do JBoot no
> Google Cloud — ver `open_questions`).

Objetivo: o cliente conecta a propria conta Google e escolhe a pasta de destino
na tela `Configuracoes -> Google Drive`, sem informar credencial, chave nem ID.
Substitui o modo `secret_ref`/variavel de ambiente da Sprint 10 (ADR 016).

Entregaveis:

- tela com tres controles: conectar conta Google, escolher pasta (Picker) e
  switch de envio; sem cards de operacao/fila na UI;
- tabela `kanban_drive_configurations` com `refresh_token_enc` cifrado,
  `google_account_email`, `root_folder_id/name` (migration
  `docker/postgres/init/072_kanban_drive_client_oauth.sql`);
- rotas `connect`, `connect/complete`, `picker-token`, `PUT`, `DELETE` em
  `/kanban/settings/google-drive`; remocao de `POST .../test` e de `secretRef`;
- revogacao/expiracao do token pausa a integracao (`invalid`) sem perder itens.

Criterios de aceite: refresh token nunca retorna pela API nem entra em log ou
auditoria; `state` de outro tenant/usuario ou expirado e recusado; pasta
inexistente, na lixeira ou nao-pasta e recusada pelo backend; `make
ai-api-graph-gate` e testes do modulo passam.

open_questions:

- criar o app OAuth do JBoot no Google Cloud (client id/secret, redirect URI
  `<origem do Flow>/flow/configuracoes/google-drive`, Picker API, API key,
  tela de consentimento publicada) — bloqueia apenas o smoke externo;
- quais documentos devem ser replicados: hoje apenas documentos gerados
  aprovados (`kanban_card_generated_documents`); os documentos enviados no
  checklist do card (`kanban_card_documents`) nao sao replicados.

## Sprint 11: Gateway OpenAI, Uso Do Plano E Agentes De IA

> Status: `em andamento — plano corrigido em 2026-10-15`; a fundacao estrutural
> existe, mas producao permanece bloqueada pelos controles operacionais, pelo
> smoke externo e pela admissao comercial do Sign in with ChatGPT. Em
> 2026-10-15 o usuario confirmou que ChatGPT Plus e a modalidade primaria
> obrigatoria; API key/BYOK e opcional e nunca fallback automatico. A interacao
> manual BYOK ja entregue permanece checkpoint tecnico; automacao de dominio
> continua na Sprint 12.

> Claude (2026-10-15): para quem usa assinatura Claude (Pro/Max/Team/Enterprise)
> o caminho e o conector MCP do Flow, nao uma chave de API. A Anthropic proibe
> apps de terceiros de usar login/credenciais de assinatura; uso interativo pelo
> conector em `docs/product/kanban-claude-connector-sprints.md`, e automacao
> pela assinatura via rotina do Claude Code (`connectionMode = claude_routine`
> na Sprint 12). A chave de API Anthropic continua cobrada por token.

### Decisao De Produto — Providers Reais Desde O Desenvolvimento

Incremento OpenAI confirmado em 2026-10-15: integrar SDK oficial e Responses
API no gateway existente. O adapter BYOK esta implementado como modalidade
opcional; o rollout de produto depende de conexao ChatGPT Plan por OAuth
aprovado para aplicacao comercial hospedada.
Entregaveis: catalogo OpenAI, validacao de chave sem inferencia, modelos da
conta, executor estruturado e roteamento isolado por provider. Fora de escopo:
tools e mutacoes de dominio neste checkpoint BYOK. Login ChatGPT/OAuth passa a
ser trilha obrigatoria separada em `docs/product/chatgpt-plan-usage-sprints.md`,
sem inventar endpoints/scopes antes da aprovacao. Aceite exige testes de
isolamento/erros/replay, builds, audit, API Graph e smoke real sem fixture
fabricada. Estado: `em andamento`.

- o produto nao oferece provider `fake`, simulador local ou chave sintetica;
- desenvolvimento, testes de integracao e homologacao exercitam os mesmos
  adapters e contratos usados em producao, com credenciais/contas proprias de
  cada ambiente;
- mocks in-memory sao permitidos somente dentro de testes unitarios, nunca no
  catalogo HTTP, banco, UI, smoke, evidencia de aceite ou runtime da aplicacao;
- uma IA so aparece no seletor quando seu adapter estiver implementado,
  validado, observavel e autorizado para uso no ambiente;
- nomes comerciais sem adapter executavel nao aparecem como opcoes habilitadas;
- `openai` e o primeiro provider habilitado por ambiente; `anthropic`/Claude e
  o incremento seguinte. Google/Gemini e outros entram por incrementos
  proprios, com o mesmo Definition of Done;
- `Hermes` nao e assumido como provider de API: antes de entrar no catalogo,
  deve ser identificado o operador/endpoint comercial e fechado o respectivo
  contrato de autenticacao, dados e modelos.

Objetivo: criar o servico independente `svc-jboot-ai-gateway` para credenciais
BYOK opcionais, futuras conexoes ChatGPT Plan e agentes versionados pelo JBoot,
isolados por tenant, usuario, provedor e modulo.

Decisao funcional: o agente criado na interface externa nao e invocado por
nome. O usuario cadastra manualmente no JBoot o nome e o prompt equivalente. A
execucao usa esse prompt versionado como instrucao de sistema; uma referencia
externa opcional serve somente para rastreabilidade ate existir contrato
oficial do provedor que a torne invocavel.

Entregaveis:

- catalogo fechado e extensivel de providers/capabilities, inicialmente com
  adapters reais aprovados individualmente; nome comercial nao implica suporte;
- `ai_credentials` por `(client_id, owner_identity_id, provider)`, chave
  cifrada, write-only, versionada e nunca retornada;
- `ai_agents` com owner, `application_slug`, credential, nome, descricao,
  provider, modelo, prompt de sistema cifrado/protegido, schema de saida,
  versao, status e referencia externa opcional;
- teste de credencial sem PII antes de ativar;
- CRUD em `Configuracoes -> IA -> Credenciais` e `Agentes`, filtrado pelo
  modulo corrente;
- console manual read-only em `Agentes`, autenticado com JWT do usuario, que
  devolve texto ou JSON somente na resposta corrente e nao persiste conteudo;
- capability de modelo explicita por modo (`text` ou `json_schema`), sem assumir
  que todo modelo listado pelo provider suporta saida estruturada;
- API s2s autenticada para executar `agent_id` com input estruturado;
- modalidade de autenticacao/cobranca explicita (`chatgpt_plan` primaria,
  `api_key` opcional), sem fallback ou troca silenciosa;
- ledger de execucao com IDs, versoes, modelo, tokens, custo estimado,
  latencia, status e codigo de erro, sem prompt/input/output integral;
- timeout, retry apenas para falhas transitorias, rate limit, quota, circuit
  breaker, kill switch, cancelamento e idempotencia;
- retencao e expurgo separados para credencial, agente e execucao.

Definition of Done por provider:

- descriptor de catalogo com identidade canonica, modelos suportados,
  capabilities e status por ambiente;
- validacao real de credencial no endpoint oficial, sem prompt, PII ou payload
  de negocio e com erro sanitizado;
- adapter de execucao em `src/ai`, com endpoint/host fixo em allowlist, TLS,
  redirects bloqueados, timeout, cancelamento e limites de payload;
- mapeamento tipado de request/response, usage/tokens, latencia, finish reason e
  erros transitorios/permanentes;
- structured output validado localmente contra o schema do agente antes de
  qualquer efeito de dominio;
- rate limit, retry com jitter apenas para falhas transitorias, circuit breaker,
  quota/custo e kill switch por provider;
- logs, traces, metricas e ledger sem chave, prompt, input ou output integral;
- testes unitarios do adapter com transporte HTTP injetado e fixtures derivadas
  de respostas reais anonimizada; teste de integracao opt-in com conta do
  ambiente; smoke de homologacao antes de habilitar producao;
- politica de dados, retencao, residencia, treinamento, DPA e procedimento de
  revogacao/rotacao aprovados e registrados.

Deployment Boundary Gate: `independent_unit`. O gateway tem segredos,
providers, filas, observabilidade e ciclo operacional compartilhados entre
modulos; nao pertence ao processo do Kanban ou do Identity.

Stack Fit Gate: TypeScript/NestJS recomendado apos comparar NestJS,
Python/FastAPI e Go. A escolha contrafactual greenfield tambem e NestJS pela
predominancia de contratos estruturados, adapters HTTP/SDK, jobs e politicas
transacionais; familiaridade com o repositorio nao e criterio de preferencia.

Criterios de aceite:

- chave de A nunca e legivel/usavel por B, por outro tenant ou por outro
  provider;
- API nunca devolve chave ou prompt integral depois de salvo;
- agente do Flow nao aparece nem executa em outro modulo;
- alterar prompt cria nova versao; execucao preserva a versao usada;
- provider sem adapter/capability retorna `provider_not_supported`, nunca
  fallback silencioso;
- chamadas externas usam exclusivamente a chave do proprietario selecionado;
- logs, filas, metricas, traces e auditoria nao contêm segredo ou conteudo;
- exclusao/revogacao impede novas execucoes sem apagar evidencia obrigatoria.

Dependencias e bloqueios:

- branch dedicada para cada incremento de provider;
- contrato de retencao, residencia, treinamento e DPA por provider antes de
  liberar dados reais;
- `openai` confirmado como provider inicial; `anthropic` vem na sequencia.
  Modelos permitidos devem combinar catalogo real da conta, allowlist por
  ambiente e capability explicita para o modo de resposta;
- chave mestra em secret manager e procedimento de rotacao testado.

## Sprint 12: Acao De Automacao Executar Agente

> Status: `em andamento`. Implementada em 2026-10-15 (outbox duravel, tool
> calls versionadas, modo `api_key` OpenAI e modo `claude_routine`); falta smoke
> externo (OpenAI com chave real e rotina Claude com conector publico) e os
> controles de producao da Sprint 11.

Objetivo: adicionar `action_type = execute_ai_agent` ao motor de automacao do
Kanban sem enviar credenciais, prompts ou dados livres pela fila.

Fluxo:

```text
evento canonico -> outbox transacional -> job com IDs -> policy de dados
-> chamada s2s ao AI Gateway -> resposta estruturada -> efeito permitido
-> atividade/auditoria -> revisao humana quando aplicavel
```

Entregaveis:

- seletor de agente na acao da automacao, limitado a agentes ativos do Flow
  pertencentes ao usuario autorizado;
- configuracao da regra guarda `agent_id`, versao/politica de input e conexao
  designada; nunca copia token, API key ou prompt;
- cada versao do agente guarda `allowed_tools` e schemas estritos. O prompt pode
  escolher e encadear somente essas tools; nao cria handler, campo, URL ou
  permissao;
- snapshot imutavel e minimizado dos campos autorizados para a execucao;
- allowlist de dados por trigger/action; dados do cliente e documentos anexados
  ficam bloqueados por default e exigem contrato versionado por agente;
- outbox transacional, worker, DLQ, reprocessamento e idempotencia ponta a
  ponta entre evento Kanban e `ai_execution`;
- schema de saida obrigatorio; texto fora do schema nao produz mutacao;
- prompt injection tratada como dado; resposta da IA nunca aprova, entrega,
  protocola ou amplia permissao automaticamente;
- painel operacional com estado, latencia, consumo, falha sanitizada e
  reprocessamento autorizado.
- registry inicial deve ser fechado antes dos handlers: registrar texto, patch
  controlado de campos, solicitar movimentacao, renderizar documento e anexar
  artefato. O gateway valida cada tool call e o Kanban reautoriza/executa.
- conexao ChatGPT Plan de desenvolvimento e designada pelo operador do projeto;
  em producao cada tenant designa e autoriza sua propria identidade responsavel.

Criterios de aceite:

- retry do mesmo evento produz uma unica execucao/efeito logico;
- agente removido, inativo, de outro modulo/usuario/tenant ou com credencial
  revogada falha fechado;
- provider indisponivel nao reverte o evento Kanban original;
- resposta invalida fica para revisao/fallback e nao altera card;
- toda execucao reconstrói tenant, usuario, modulo, agente/prompt/modelo e
  regra de automacao usados, sem expor segredos;
- testes cobrem prompt injection, exfiltracao, confused deputy, SSRF, quota,
  timeout, retry, DLQ, cancelamento e isolamento concorrente.

### Modo Rotina Claude (`connectionMode = claude_routine`)

Decisao humana de 2026-10-15: alem de `api_key`, a acao aceita agentes em modo
`claude_routine`, executados pela assinatura Claude do proprio usuario via
rotina do Claude Code com gatilho de API. Mesma outbox e mesmo processor; o
gateway nao chama modelo, so dispara a rotina com os identificadores do run, e
a rotina le o card e comenta pelo conector MCP do Flow (`runId` fecha o run
`dispatched`). Sem tool calls do gateway; `toolPolicyVersion =
'claude_routine.v1'`. Desenho, limites (sem idempotencia no fire, 30
disparos/h por rotina) e evidencias em
`docs/product/kanban-claude-connector-sprints.md`.

## Sprint 13: Envio Duravel Das Automacoes De E-mail

> Status: `concluida` em 2026-10-17 no branch
> `feature/flow-email-automation-outbox` . Decisao humana de
> 2026-10-17: manter BullMQ/Valkey,
> sem RabbitMQ, com outbox no PostgreSQL, falha terminal visivel e
> reprocessamento.

Objetivo: fechar os riscos registrados na Sprint 8 (job perdido com Valkey
indisponivel, sem DLQ, sem alerta) sem trocar de broker.

PE Decision:

- `Deployment Boundary Gate`: mesmo processo `platform-api` e mesmo banco do
  tenant; herda a stack do host. `Stack Fit Gate` nao se aplica (nenhum
  runtime, broker ou servico novo).
- Problema real: gravar o evento no banco e publicar o job no Valkey sao dois
  passos separados. Trocar o broker nao resolve; a intencao precisa nascer no
  banco.
- O evento canonico (`CardActivity.system_event` `card.moved` ou
  `juridico_process_changed`) passa a ser gravado na mesma transacao da
  movimentacao. A intencao de envio e derivada do evento + regras ativas
  (mesmo padrao do outbox de IA da Sprint 12) logo apos o evento e de novo
  pela varredura de 1 minuto, com `ON CONFLICT DO NOTHING` nas UNIQUE ja
  existentes. Evento gravado implica e-mail registrado.
- `kanban_automation_dispatch_log` vira o outbox: estados
  `pending|processing|sent|skipped|failed`, `next_attempt_at`. O job leva so
  `databaseRef` + id; regra, card e destinatarios sao lidos no envio.
- Retentativa e do banco, nao do BullMQ: 5 tentativas com espera 1, 2, 4 e 8
  minutos; depois `failed` (DLQ). Linha `processing` parada ha 5 minutos e
  retomada.
- Envio por destinatario registrado (`kanban_automation_dispatch_recipients`):
  retentativa nao reenvia a quem ja recebeu.
- Erro gravado sem endereco de e-mail e truncado.
- Regra inativa ou removida no momento do envio: `skipped`, sem envio.
- Agendados (`due_date_approaching`, `card_stale`): a avaliacao diaria grava a
  intencao no banco antes de publicar; o job diario ganha 3 tentativas.
- Bug corrigido: a retentativa do BullMQ encontrava a linha `failed` e saia sem
  reenviar; as 5 tentativas nunca aconteciam.

Entregaveis:

- migration `088_kanban_automation_email_outbox.sql`;
- outbox/varredura/worker com metricas OpenTelemetry
  (`kanban.automation.email.dispatches` por resultado e
  `kanban.automation.email.backlog` por estado);
- `GET /kanban/automation-dispatches` e
  `POST /kanban/automation-dispatches/:id/retry` (`flow:admin`; lista so cards
  visiveis; reprocessar exige `board_admin` do quadro), com auditoria;
- tela `Configuracoes > Envios de automacao` com contadores, falhas e botao
  Reprocessar;
- runbook com sinais e alertas sugeridos.

Criterios de aceite:

- Valkey indisponivel na movimentacao: o e-mail sai depois que o Valkey volta;
- processo derrubado entre o evento e a publicacao: varredura recupera;
- retentativa nao duplica envio a quem ja recebeu;
- depois de 5 falhas a linha fica `failed`, aparece na tela e pode ser
  reprocessada uma vez por clique;
- usuario sem `flow:admin`, de outro tenant ou sem visibilidade do card nao
  lista nem reprocessa.

Riscos residuais:

- entrega e pelo menos uma vez: queda entre o aceite do SMTP e o registro do
  destinatario pode repetir um e-mail;
- sem bounce/reputacao (SMTP generico, igual a Sprint 8).

UI/UX (`docs/agents/orchestration/ui-ux.md`): reuso do painel operacional da
replica do Google Drive (contadores em badge, tabela de falhas, Reprocessar por
linha, alerta de sucesso/erro) com filtro Falhas/Na fila. Item proprio em
Configuracoes (`module-settings`, `flow:admin`), fora do grupo IA. Sem padrao
novo de interface.

Seguranca: lista com `visibleCardScope`; reprocessar com `requireVisibleCard`
(404 fora do alcance) e `board_admin`; auditoria com ids; erro do SMTP gravado
sem endereco; metricas sem tenant/card/destinatario; job sem dado pessoal (so
`databaseRef` + id).

Evidencias (2026-10-17, no container):

- migration 088 aplicada no banco de dev;
- BFF: type-check, lint, build e 589 testes (587 passam, 2 ignorados ja
  existentes); repositorio do outbox e movimentacao com PostgreSQL real
  (derivacao por regra, 24 h da varredura, espera 1/2/4/8 min, falha terminal,
  retomada de processamento parado, agendado por dia, destinatario unico,
  lista por visibilidade);
- Web: type-check, lint, 123 testes e `next build`.
- E2E com BFF e Web reais deste branch (Valkey isolado, SMTP falso que
  aceita ou recusa com 421): movimentacao gera 1 e-mail e 1 destinatario
  registrado; evento gravado sem linha nem job (queda simulada) foi recuperado
  pela varredura em 28 s; SMTP fora agendou nova tentativa em 60 s com erro sem
  endereco e chegou a `failed` na 5a tentativa (esperas aceleradas no banco);
  Reprocessar enviou 1 e-mail, segunda vez 409, auditoria registrada, id
  inexistente 404; tela mostrou contadores, linha com falha e Reprocessar.
- Bug encontrado no E2E e corrigido: o `pg` devolve `created_at` como `Date` e o
  template de coluna quebrava (`value.replace is not a function`); nenhum
  e-mail de entrada/saida de coluna saia desde a Sprint 8. Teste de regressao
  no worker.

## Gate Compartilhado Das Sprints 10–12

O preflight, modelo de dados, contratos, seguranca, UI/UX, Graph Engineering,
validacoes e perguntas resolvidas estao em
`docs/product/kanban-sprint-10-12-gate.md`. Nenhuma das tres sprints autoriza
codigo antes de branch dedicada, contratos do novo servico e confirmacao do
provider inicial.

## Observacao: Dados Para Metricas Futuras

`Card.created_at` (Sprint 1) e os timestamps de cada `CardActivity` (Sprint 4, especialmente eventos `system_event` de mudanca de coluna) foram preservados de forma imutavel desde que criados, exatamente para servir de base a metricas de lead time/cycle time/throughput por coluna. A Sprint 6 consome esses dados (tempo medio por coluna, throughput 30 dias); esta secao fica registrada para referencia historica de por que esses timestamps nunca podem ser alterados apos a criacao do registro.
