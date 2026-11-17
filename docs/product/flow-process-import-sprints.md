# Flow — Importacao De Processos Em Andamento Por Planilha

Escopo definido via `PO -> PE -> confirmacao humana` em 2026-11-06.
Branch: `feature/flow-process-import`, empilhada sobre
`feature/flow-petition-monitoring` (depende do numero CNJ, do monitor e do
vinculo da Sprint 2 de `docs/product/flow-card-actions-sprints.md`).

## Objetivo

Clientes do escritorio com processos ja protocolados e correntes, hoje
controlados em `.xlsx`, entram no Flow em lote: cada linha vira cliente (ou usa
o existente pelo CPF), card com o numero CNJ num board de monitoramento e
acompanhamento DataJud diario. Mesmo resultado da acao Monitorar, entrada pela
planilha.

Colunas minimas: NOME e CPF (cliente do escritorio) e AUTOS (numero CNJ). O
tribunal sai do numero.

## Decisoes Confirmadas — 2026-11-06

- Fluxo em 3 etapas: enviar a planilha, conferir linha a linha, confirmar. So
  linhas prontas sao gravadas; reimportar nao duplica.
- Arquivo: so `.xlsx`, ate 2000 linhas. Colunas reconhecidas pelo cabecalho
  (NOME, CPF, AUTOS, STATUS), com ajuste manual na tela.
- STATUS (ex.: "REPLICA 30/06"): vira o primeiro comentario do card
  ("Situacao na planilha: ...").
- ADVOGADO: coluna ignorada. Os responsaveis do card sao os responsaveis do
  escritorio da importacao (`kanban_user_offices.is_responsible`), mesma regra
  do card de entrada da validacao (ADR 019, decisao 16): quem nao e membro
  ativo do board destino ou nao ve o card fica de fora, registrado no resumo.
- Escritorio: um para a planilha inteira. Usuario de escritorio importa para o
  proprio escritorio (com mais de um, escolhe entre os seus); administrador da
  matriz (`flow:admin`) indica o escritorio e a regra acima se aplica.
- Board destino: escolhido pelo usuario na hora da importacao.
- Um card por numero CNJ no tenant (mesma regra da Sprint 2): numero que ja tem
  card (peticao, export DataJud, importacao anterior) aparece como "ja existe"
  com o link e nao e importado.
- CPF de cliente ja cadastrado: usa o cadastro existente sem sobrescrever o
  nome; divergencia de nome aparece como aviso na conferencia.
- Primeira consulta DataJud de cada processo so registra o estado atual (sem
  inundar o card com movimentacoes antigas), como no monitor existente.

## Premissa Do PE (aprovada pelo usuario em 2026-11-06)

- Quem importa: quem pode criar card no board destino (`board_admin` ou
  `board_member`) e no escritorio escolhido (`CardOfficePolicy`). Nao exige
  `flow:admin`, para o escritorio importar a propria carteira.

## Sprint 1 — Importacao Ponta A Ponta

Estado: `em andamento` (implementada e validada no container em 2026-11-06;
faltam o smoke autenticado com planilha ficticia no runtime e o teste da
Sprint 2 de flow-card-actions, base desta branch).

### Arquitetura (aprovada em 2026-11-06)

- Leitura do `.xlsx` no navegador (dependencia `xlsx` ja usada pela captacao do
  Juridico): o arquivo nao e enviado nem guardado; vao ao BFF so as linhas
  (linha, nome, cpf, autos, status), no maximo 2000.
- `POST /domain-integrations/flow/process-imports/preview`: valida cada linha
  sem gravar (CPF, CNJ, tribunal, duplicidade na planilha e no tenant, nome
  divergente, ESTADO x tribunal) e devolve a situacao por linha.
- `POST /domain-integrations/flow/process-imports`: revalida, grava o lote e as
  linhas prontas e enfileira o processamento (BullMQ, como Drive/PDF). A fila
  carrega so ids.
- `GET /domain-integrations/flow/process-imports/:id`: andamento e resultado
  por linha (criado, ja existia, falhou com motivo, responsaveis pulados).
- Por linha, idempotente: cliente por CPF (`establishment-customers`, sem
  sobrescrever), vinculo ao escritorio, card na coluna padrao
  (`kanban/flow_process_import/<cnj>`), responsaveis do escritorio, comentario
  do STATUS, `ensureActive` diario e vinculo `origin = flow_import` em
  `juridico_data_flow_exports`.
- Tabelas no banco do Flow: `kanban_process_imports` (lote) e
  `kanban_process_import_rows` (linha). CPF e nome da linha sao apagados ao
  concluir o lote; resultado e auditoria guardam so HMAC do CPF/CNJ.
- Registro de CNJ em peticao (Sprint 2) passa a considerar tambem os cards
  importados na unicidade.

### Criterios De Aceite / sprint_gate

- [x] Conferencia antes de gravar, com situacao por linha e link do card ja
  existente.
- [x] CPF e CNJ validados; tribunal pelo numero; ESTADO divergente como aviso.
- [x] Um card por numero CNJ no tenant; reimportar nao duplica.
- [x] Cliente existente reaproveitado pelo CPF, sem sobrescrever.
- [x] Responsaveis do escritorio no card; pulados registrados no resumo.
- [x] STATUS como primeiro comentario.
- [x] Monitor diario e vinculo `flow_import`; movimentacoes chegam ao card.
- [x] Processamento em fila com andamento; retry nao duplica.
- [x] Isolamento tenant/escritorio/board testado.
- [x] CPF fora de logs, auditoria e payload de fila; linhas purgadas ao concluir.
- [x] Testes so com dados ficticios (nunca CPFs/processos reais da planilha do
  cliente).
- [x] API/Architecture Graph atualizados e gates aprovados.
- [x] Testes, type-check e build backend/frontend no container; telas existindo.

- [ ] Smoke autenticado no runtime com planilha ficticia (conferencia,
  importacao, card no board, monitor ativo).
- [ ] Primeira movimentacao real chegando a um card importado.

### Evidencias — 2026-11-06

- BFF (container): typecheck e ESLint do escopo; suite completa 932 testes,
  930 aprovados, 2 skips Gotenberg, zero falhas. PostgreSQL real: numero ja
  usado (card DataJud, card importado, outro tenant), lote, contagem, purga de
  nome/CPF/STATUS e responsaveis idempotentes. Unitarios: validacao das linhas,
  processamento por linha (novo, existente, retomada, compensacao do cliente),
  escritorio permitido, conferencia, criacao do lote, job (falha isolada por
  linha, entitlement revogado).
- Frontend (container): type-check, ESLint, 195 testes e build de producao.
- Migrations 120/121 aplicadas no Postgres local (aditivas).
- `make ai-api-graph-gate` e `make ai-architecture-graph-gate` sem erro.
- Seguranca: `docs/security/flow-process-import-checklist.md`.

Fora de escopo: `.csv`; mais de 2000 linhas por arquivo; mapear ADVOGADO para
usuario; STATUS definindo coluna; corrigir/excluir importacao concluida.

Deployment Boundary Gate: embedded feature em `bff-jboot-platform` e
`app-jboot-next-platform`; stack herdada; fila BullMQ/Valkey existente.
Stack Fit Gate: nao aplicavel. Nenhuma dependencia nova.
Open questions: nenhuma.
