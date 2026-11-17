# Flow — Acoes Manuais Por Coluna

## Decisoes Confirmadas — 2026-10-21

- Feature do modulo `kanban` nos projetos Platform existentes; sem novo deploy.
- Preservar a branch atual, por instrucao humana.
- Catalogo mantido pelo produto em codigo: categoria, descricao, icone,
  disponibilidade para boards e handler explicito. Cliente associa, nao cria codigo.
- Categoria inicial `juridico`: `gerar-protocolo` e `monitorar`.
- Configuracao exclusiva de `global_master` ou `client_admin` com `flow:admin`;
  papel `board_admin` isolado nao concede configuracao.
- Executar exige `flow:actions:execute`, ou o administrador acima, e respeita
  visibilidade tenant/quadro/escritorio, papel operacional e ACL da coluna.
- Multiplas acoes por coluna; associacao pertence ao tenant e quadro.
- Cards herdam as acoes da coluna atual, sem copiar associacoes para cada card.
- Handlers iniciais retornam `backend acao Gerar Protocolo` e
  `backend acao Monitorar`. Nao protocolam nem ativam monitoramento real.

## Sprint 1

Estado: `em andamento`.

Objetivo: configurar e testar o fluxo completo UI -> API -> handler.

Criterios de aceite / sprint_gate:

- [x] Catalogo categorizado com descricao e disponibilidade declaradas.
- [x] Menu Acoes e configuracao por coluna para administradores autorizados.
- [x] Persistencia transacional e isolada por tenant/quadro/coluna.
- [x] Permissao Executar acoes disponivel no gestor de usuarios Identity.
- [x] Botoes nos cards acompanham a coluna, sem abrir o modal de edicao.
- [x] Retorno de cada handler exibido no card; loading e erro tratados.
- [x] Backend rejeita acao desconhecida, nao associada, coluna inativa,
  card invisivel/arquivado, usuario sem permissao e coluna sem edicao.
- [x] Testes automatizados do escopo, type-check/build backend e frontend no container.
- [x] API/Architecture Graph gates e ai-conformance aprovados.
- [x] Revisao de seguranca e attestation registradas.
- [ ] Smoke visual autenticado no runtime desta branch (decisao de troca pendente).
- [ ] Fechamento terminal: pendencias globais classificadas e arvore Git limpa.

## Evidencias E Pendencias — 2026-10-21

### Execucao No Runtime Compartilhado

- Por instrucao humana, a feature foi portada para este worktree
  (`.claude/worktrees/flow-office-contract`, branch
  `feature/flow-office-service-contract`) sem trocar nenhuma branch.
- O diff preexistente de contratos de escritorio foi preservado; fontes de
  Drive/governanca da raiz nao foram portadas junto com a feature.
- Migrations locais desta feature: `090_kanban_card_actions.sql` e
  `091_identity_flow_card_actions.sql`, renumeradas para nao colidir com 085/086
  ja existentes neste checkout. Ambas aplicadas de forma idempotente.
- Validacoes no container, neste checkout: backend 646 testes (644 aprovados,
  2 skips Gotenberg, zero falhas); frontend 137 testes aprovados; typecheck e
  build dos dois projetos aprovados; lint do escopo backend aprovado.
- `make ai-check` passou neste checkout com zero erros de API/Architecture Graph.
- Platform API e Web reiniciados somente neste worktree, com o mesmo ambiente
  dos processos anteriores e portas 8010/3002. Identity e outros servicos intactos.
- Health da API 200, rota Acoes autenticada 401 sem token (rota registrada),
  pagina `/flow/boards/:id/settings/actions` 200.
- Snapshot anterior ao porte em `/tmp/flow-actions-runtime-transfer` (diffs
  tracked e tar de untracked da raiz e do worktree). Sem commit/push.
- Smoke visual autenticado permanece para validacao do operador; a suite
  automatizada HTTP/PostgreSQL cobre associacao e execucao das duas acoes.

### Historico Da Validacao Inicial Na Raiz

- Backend: 27 testes de acoes/HTTP/PostgreSQL/visibilidade aprovados; typecheck,
  ESLint do escopo e build aprovados no container.
- Frontend: 124 testes, type-check, ESLint do escopo e build aprovados no container.
- Suite backend completa: 598 testes, 590 aprovados, 6 falhas nos testes de
  recuperacao Drive preexistentes e 2 skips Gotenberg. A constraint
  `kanban_drive_configurations_active_requires_connection` rejeita a fixture do
  arquivo ja presente e nao versionado no inicio deste trabalho
  (`drive/document-sync.repository.spec.ts`); nao foi alterado por esta feature.
  Pendente no trabalho Drive em andamento, fora do escopo desta entrega.
- Migrations 090/091 aplicadas localmente; teste HTTP usa dados sinteticos com
  ROLLBACK. Nenhuma associacao foi criada nos boards reais.
- Portas 8010/3002 pertenciam ao worktree `.claude/worktrees/flow-office-contract`.
  Apos decisao humana, a feature foi portada e ativada nele (registro acima).
- Navegador de validacao nao possui sessao Flow; smoke visual autenticado pendente.
- Branch original `codex/juridico-flow-resume` preservada. Arvore ja estava suja com outro
  trabalho Drive/governanca; nao houve commit/push nem limpeza dessas mudancas.
- Seguranca: `docs/security/flow-card-actions-checklist.md`.
- Proveniencia: `docs/ai-governance/attestations/2026-10-21-flow-card-actions.yaml`.

Fora de escopo: protocolo juridico real, monitoramento real, automacao por
entrada na coluna, codigo/webhook criado pelo cliente, novo runtime.

Deployment Boundary Gate: embedded feature; stack herdada NestJS/Next.js.
Stack Fit Gate: nao aplicavel (sem unidade independente).
Graph: capability `flow-card-actions`, owner `kanban`; schema existente.
Open questions: nenhuma para este incremento.
Debito conhecido: substituir handlers de confirmacao em entregas posteriores,
com contratos proprios de efeitos/idempotencia antes de qualquer efeito externo.

## Sprint 2 — Monitorar Peticao Protocolada

Estado: `em andamento` (implementada e validada no container em 2026-11-06;
falta o smoke autenticado no runtime e com processo real no DataJud).

Escopo confirmado pelo usuario em 2026-11-05 (`PO -> PE -> confirmacao humana`).
Branch dedicada: `feature/flow-petition-monitoring`, a partir de `main`
(`a946fc7c6`). Arquitetura proposta abaixo aprovada pelo usuario em 2026-11-06.

Objetivo: enquanto o protocolo automatico nos portais nao existe, o usuario
protocola manualmente, registra o numero CNJ na peticao aprovada e, pela acao
`monitorar` da coluna, envia a peticao como card novo para um board de
monitoramento escolhido, com o monitor DataJud ligado.

### Decisoes Confirmadas — 2026-11-05

- O numero CNJ pertence a **peticao inicial** (`kanban_card_initial_petitions`),
  nao a ficha do cliente nem ao card de origem: um card tem N peticoes e cada
  peticao protocolada vira um processo. A ficha do cliente pode exibir os
  processos em leitura, derivados das peticoes.
- Registro do CNJ so em peticao **aprovada**. Quem registra: `board_admin` do
  board ou responsavel (`kanban_card_assignees`) do card.
- Validacao no registro: formato CNJ e digito verificador; tribunal derivado do
  numero. **Nao** consultar DataJud no registro: processo recem-protocolado
  demora a ser indexado.
- Unicidade: um numero CNJ por card, por tenant, em todos os boards. Conferida
  no registro na peticao e na criacao do card. Duplicidade informa o usuario
  com link para o card existente.
- Rotulo de UI: "Numero do processo (CNJ)". "Protocolo" fica reservado para a
  futura acao `gerar-protocolo`, que preenchera o mesmo campo da peticao.
- A acao `monitorar` fica **escondida** no card sem peticao aprovada com CNJ
  ainda nao enviada.
- Ao clicar: escolher uma ou mais peticoes elegiveis (um card por peticao),
  escolher o board de destino ou criar um novo, confirmar.
- Criar board pelo fluxo: somente administrador (`flow:admin`). Board nasce
  apenas com a coluna padrao; colunas, acoes e automacoes do board de
  monitoramento ficam para sprint futura.
- Card novo na coluna padrao do board destino leva: numero CNJ, vinculo com o
  cliente, link para o card de origem e link para a peticao (sem copiar o
  documento).
- Monitor DataJud ligado automaticamente na criacao do card, cadencia diaria,
  reaproveitando `DataJudMonitorService`; o worker continua unico agendador.
- Cabecalho do card monitorado exibe estado e cadencia; ligar/desligar fica na
  acao da coluna.
- Card de origem nao muda de coluna; recebe `system_event` "peticao enviada ao
  board X".
- Peticao ja enviada nao gera segundo card (idempotencia por peticao).

### Defeito Encontrado No Monitor Atual — Entra Nesta Sprint

`wrk-jboot-juridico/src/workflows/datajud_monitor_workflow.py`: a activity
`run_datajud_monitor` faz `raise_for_status()`; processo ainda nao indexado no
DataJud volta 404 (`process_not_found`), a activity falha apos 3 tentativas e a
excecao nao tratada encerra o workflow. O monitor continua `active` no banco,
mas para de rodar sem aviso. O mesmo vale para indisponibilidade prolongada do
provedor. Como todo processo recem-protocolado comeca nao indexado, o fluxo
desta sprint depende da correcao: falha de execucao deve ser registrada e o
loop seguir para o proximo tick. Exige teste de regressao (`AIF-EVAL-002`).

### Criterios De Aceite / sprint_gate

- [x] Registro de CNJ em peticao aprovada, com digito verificador, permissao
  `board_admin`/responsavel e unicidade por tenant.
- [x] Acao `monitorar` real substitui o handler de confirmacao; escondida sem
  peticao elegivel.
- [x] Modal de selecao de peticoes e board; criacao de board restrita a
  `flow:admin`.
- [x] Card novo idempotente por peticao, com CNJ, cliente e links de origem.
- [x] Monitor diario ligado; movimentacoes chegam ao historico do card novo
  pelo vinculo `flow_petition` (mesmo `ProcessChangeNotifier`; coberto por
  teste unitario, sem execucao real no DataJud).
- [x] Workflow do monitor sobrevive a `not_found`/provedor indisponivel, com
  teste de regressao (falha sem a correcao, passa com ela).
- [x] Isolamento por tenant/board/escritorio testado.
- [x] Fixtures DataJud: nenhuma fixture de resposta DataJud foi criada; os
  testes usam numeros CNJ sinteticos e dublês dos servicos internos.
- [x] API/Architecture Graph atualizados e gates aprovados.
- [x] Testes, type-check e build backend/frontend/worker no container.
- [ ] Smoke autenticado no runtime: registrar CNJ, Monitorar, card no board
  destino, monitor ativo.
- [ ] Primeira movimentacao real chegando ao card (depende de processo real
  indexado no DataJud).

### Evidencias — 2026-11-06

- Worker: `tests/test_datajud_monitor_workflow.py` (Temporal time-skipping)
  falha sem a correcao e passa com ela; pyright sem erro.
- BFF: 915 testes, 913 aprovados, 2 skips Gotenberg, zero falhas; typecheck e
  ESLint do escopo aprovados; testes PostgreSQL reais de registro, unicidade
  (peticao, card DataJud, outro tenant), CHECK do numero, disponibilidade com
  `visibleCardScope` e idempotencia do envio.
- Frontend: type-check, ESLint do modulo kanban, 191 testes e build de producao
  aprovados.
- SQL do vinculo `flow_petition` conferido no banco juridico local em transacao
  revertida (insere; outro card no mesmo board/processo nao reaponta).
- Migrations 118/119 aplicadas no Postgres local de dev (aditivas).
- Seguranca: `docs/security/flow-card-actions-checklist.md` (Sprint 2).

### Desvios Registrados

- Decisao "cabecalho so mostra estado e cadencia; ligar/desligar fica na acao"
  foi tomada antes de a acao virar "enviar peticao ao board de monitoramento".
  O botao do cabecalho foi mantido como estava (liga/desliga) para cards
  DataJud e para os cards de monitoramento de peticao: sem ele, nenhum dos dois
  teria como pausar o acompanhamento. Revisar quando o board de monitoramento
  ganhar colunas/acoes proprias.
- O export DataJud passou a recusar processo que ja tem card de peticao, para
  manter "um card por numero CNJ"; DataJud x DataJud em boards diferentes segue
  como antes (fora do escopo desta sprint).

### Dependencias E Bloqueios

- Sprint 1 desta feature ainda `em andamento` (smoke visual e fechamento).
- Revisao do Architect: vinculo peticao -> card de monitoramento -> monitor
  (origem manual em `domain-integrations` versus campo no `kanban`) e criacao
  de card cross-board.

### Architect Review — Proposta (aguarda confirmacao humana)

- `kanban` e dono do CNJ da peticao: coluna nova em
  `kanban_card_initial_petitions` com unicidade parcial
  `(client_id, process_number) WHERE process_number IS NOT NULL`. Texto puro,
  coerente com o card exportado do DataJud, que ja exibe o CNJ no titulo.
- `kanban` cria o card no board destino pela coluna padrao (`is_default`), com
  `source_type = 'flow_petition'` e `source_id = <id da peticao>`; a unicidade
  de `source_id` garante a idempotencia por peticao. Lista de boards destino:
  apenas boards em que o usuario pode criar card.
- `domain-integrations` continua dono do vinculo card -> monitor: reaproveitar
  `juridico_data_flow_exports` com `snapshot_id` nulo (ja e nullable) e coluna
  nova `origin` (`datajud_query` | `flow_petition`). Assim
  `findExportsByMonitor` e o `ProcessChangeNotifier` entregam movimentacoes ao
  card novo sem caminho paralelo.
- Unicidade cross-board: alem da peticao, conferir o HMAC do CNJ em
  `juridico_data_flow_exports` do tenant (todos os boards) para barrar card
  DataJud ja exportado com o mesmo numero. A UNIQUE atual
  `(client_id, board_id, process_number_hmac)` e por board e permanece;
  a regra por tenant e aplicada no servico, com lock transacional.
- `juridico` sem mudanca de contrato: `DataJudMonitorService.create` ja aceita
  CNJ + tribunal + cadencia sem snapshot. Monitor unico por processo/tenant ja
  existe (`409`), coerente com a regra de um card por CNJ.
- Worker: tratar falha da activity no loop (registrar e seguir para o proximo
  tick) em vez de deixar o workflow falhar.

Fora de escopo: corrigir ou desvincular CNJ registrado; protocolo automatico;
colunas/acoes/automacoes do board de monitoramento; copia do PDF da peticao.

Deployment Boundary Gate: embedded feature em `bff-jboot-platform`,
`app-jboot-next-platform` e `wrk-jboot-juridico`; stack herdada.
Stack Fit Gate: nao aplicavel.
Open questions: nenhuma bloqueante de produto.

## Configuracao Por Acao — 2026-11-07

- Origem: `docs/product/flow-signed-kit-sprints.md`, S5 (acao "Validar assinatura").
- O catalogo pode declarar `config` na acao. `routine_agent`: ao atribuir a acao a coluna, o administrador escolhe
  um agente de rotina Claude da propria conta; fica em `kanban_column_actions.config` (migration `122`) e quem
  configurou vira a conta executora da rotina. Sem agente, a atribuicao e recusada (`card_action_config_required`).
- Categoria nova `documentos`. Acoes de IA seguem a premissa do Flow: toda chamada de IA parte de automacao ou acao
  configuravel.
