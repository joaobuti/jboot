# Sprints: Escritorio Principal, Escritorio Ativo E Barra Superior Do Flow

Branch: `feature/flow-offices-principal-active`.

```text
target_project: implementations/bff-jboot-platform (modules/kanban, modules/process-monitoring)
                implementations/app-jboot-next-platform (modules/kanban, layouts)
                implementations/bff-jboot-identity (catalogo de permissoes)
execution_mode: project (modulo existente; sem servico novo)
deployment_boundary_gate: embedded_module (stack herdada do host)
ui_ux: reuso do preset (topbar Velzon: ProfileDropdown, dropdown de notificacoes) e de
       platform-crud-ui.md (cadastro de escritorio); nenhum padrao novo
```

## Decisoes Confirmadas — 2026-11-11

1. Escritorio na ficha do cliente: so `flow:admin` (admin master) ou quem tiver
   `flow:customers:offices` escolhe; os demais cadastram no seu escritorio ativo.
2. Escritorio principal: marcacao no cadastro/edicao do escritorio, no maximo um por cliente
   (garantido pelo banco); o primeiro escritorio nasce principal; o principal nao pode ser
   inativado sem antes marcar outro. A "conta principal" da validacao passa a ser o agente do
   escritorio principal (a configuracao geral atual e migrada para ele). Ordem: agente do
   escritorio do cliente -> agente do escritorio principal -> recusa.
3. Permissoes de IA: `ai:agents:read` (nova) e `ai:agents:manage` (existente). Responsavel de
   escritorio com a permissao configura so o agente do seu escritorio; admin do cliente configura
   todos. As duas entram no pacote de admin e sao concedidas a quem e marcado responsavel.
   Credenciais de IA (`ai:credentials:manage`) continuam so com o admin do cliente.
4. So `flow:admin` atribui mais de um escritorio a um usuario.
5. Barra superior: primeiro nome do usuario e, abaixo, o escritorio ativo. Com mais de um
   escritorio, o menu do perfil escolhe o escritorio ativo; o usuario atua como desse escritorio
   para cadastro (cliente e card).
6. Carrinho da barra superior so no modulo PDV.
7. Sino: quantidade de processos atualizados no dia pelo monitoramento, separado em blocos
   DataJud e DJEN conforme as capacidades contratadas pelo cliente; contagem do dia em cache
   (Valkey/Redis). Cada item: "Nome do cliente - numero CNJ", link para o board do card que abre
   o card ao chegar.

## Premissas (registradas; confirmar na conferencia)

- O sino mostra so atualizacoes de cards que o usuario pode ver (mesma visibilidade do board).
- "No dia" = dia de Brasilia; a contagem zera a meia-noite.
- As notificacoes internas do Flow que o sino ja mostra hoje continuam, num bloco abaixo.
- Escritorio ativo guardado no servidor por usuario (vale em qualquer navegador); sem escolha,
  o escritorio principal do usuario (ou o unico).

## Sprint 1 — Escritorio Principal E Fallback Do Agente

Estado: `concluida` (2026-11-11).

- [x] Migration `134_kanban_principal_office.sql`: `kanban_offices.is_principal`, indice unico
  parcial (um por cliente), principal sempre ativo; cliente sem principal ganha o escritorio
  ativo mais antigo; a configuracao geral da validacao e copiada para o agente do principal.
- [x] Primeiro escritorio cadastrado nasce principal; `PATCH /kanban/offices/:id`
  `{ isPrincipal: true }` troca o principal; inativar o principal da 409
  `office_principal_must_stay_active`.
- [x] Validacao: agente do escritorio do cliente -> agente do escritorio principal -> recusa;
  "Conta principal" da tela de validacao grava o agente do principal (sem principal: 409
  `principal_office_required`).
- [x] Telas: selo "Principal" e marcacao no cadastro/edicao do escritorio (Inativar travado no
  principal); tela de validacao fala em "Escritorio principal (reserva)".
- [x] Testes: plataforma 107 (validacao, escritorios, clientes do Flow), tela 178; `tsc` e lint.
- Dados locais: no cliente do Edervandes "Manaus" virou principal (cadastrado primeiro).

## Sprint 2 — Escritorio Na Ficha Do Cliente E Escritorios Do Usuario

Estado: `concluida` (2026-11-11).

- [x] Escritorio ativo no servidor (migration `135_kanban_user_active_office.sql`):
  `GET|PUT /kanban/me/office`; sem escolha, o principal (se for do usuario) ou o primeiro por
  nome. A parte da barra superior fica na Sprint 3.
- [x] Permissao `flow:customers:offices` (migration `136`, no pacote de admin; concedida a quem ja
  tem `flow:admin`). Sem ela e sem `flow:admin`, o cliente vai para o escritorio ativo de quem
  cadastra (o pedido nao escolhe); a ficha mostra o escritorio em vez dos campos.
- [x] Card novo de quem tem varios escritorios e nao escolhe: escritorio ativo (antes, 422
  `office_required`); vale tambem para importacao.
- [x] So `flow:admin` atribui mais de um escritorio: cadastro de usuario com `users:manage` sem
  `flow:admin` escolhe um (403 `multiple_offices_admin_only` para varios); gestor delegado cadastra
  no seu escritorio ativo (antes herdava todos); tela de usuario usa selecao unica nesses casos.
- [x] Testes: plataforma 995 (0 falhas), tela 178, Identity 47 (consistencia do catalogo); `tsc`
  e lint.

## Sprint 3 — Escritorio Ativo Na Barra Superior

Estado: `concluida` (2026-11-11).

- [x] Barra superior: primeiro nome do usuario (do `identity.displayName` do cookie de sessao) e,
  no Flow, o escritorio ativo abaixo.
- [x] Menu do perfil: com mais de um escritorio, lista "Escritorio ativo" para escolher
  (`PUT /kanban/me/office`); a pagina recarrega para as telas releram.
- [x] Itens de demonstracao do template no menu (perfil, mensagens, saldo, configuracoes,
  bloqueio de tela) comentados, nao removidos; "Logout" virou "Sair".
- [x] Testes: tela 180 (inclui `platform-session.spec.ts`); `tsc` e lint.

## Sprint 4 — Permissoes De IA Por Escritorio

Estado: `concluida` (2026-11-11).

- [x] `ai:agents:read` no catalogo (migration `137`, no pacote de admin; concedida a quem ja tinha
  `ai:agents:manage`). Alterar continua `ai:agents:manage`; credenciais de IA sem mudanca.
- [x] Marcar responsavel de escritorio (tela de usuarios do escritorio, `flow:admin`) concede
  `ai:agents:read` e `ai:agents:manage` no Identity com o token de quem marca; falha no Identity nao
  desfaz a troca e a tela avisa (`aiPermissionsGranted: false`).
- [x] Validacao de cadastro: `flow:admin` ve e altera todos; responsavel com permissao de IA ve os
  seus escritorios e altera o agente do seu (e o do principal, se for responsavel dele); politica de
  documentos e board de entrada continuam so do admin. Menu mostra o item com `ai:agents:read` ou
  `ai:agents:manage`.
- [x] Testes: plataforma 997 (0 falhas), tela 216, Identity 47; `tsc` e lint.

## Sprint 5 — Carrinho So No PDV

Estado: `concluida` (2026-11-11). O carrinho da barra superior so aparece no modulo PDV.

## Sprint 6 — Sino Com Atualizacoes Do Monitoramento

Estado: `concluida` (2026-11-11).

- [x] A entrega do monitoramento no card registra o processo atualizado no cache do dia
  (Valkey/Redis, `flow:monitoring-updates:{cliente}:{dia}:{datajud|djen}`, um campo por card,
  vence em 2 dias); cache fora do ar nunca quebra a entrega.
- [x] `GET /domain-integrations/flow/monitoramento/hoje`: blocos DataJud e DJEN so com a
  capacidade contratada; so cards que o usuario ve; total = soma dos blocos.
- [x] Sino do Flow: numero = processos atualizados hoje; ao abrir, blocos "Monitoramento
  processual (DataJud)" e "Publicacoes processuais (DJEN)" com "Cliente - CNJ", link para o board
  abrindo o card (`?card=`); notificacoes internas continuam abaixo ("Outras notificacoes").
- [x] Testes: plataforma 1000 (0 falhas), tela 218; `tsc`, lint e `next build`.
- Contagem comeca nas entregas depois desta versao (as de hoje anteriores nao estao no cache).

## Ajuste — flow:admin Administra Todo Board (2026-11-11)

Decisao do usuario: `flow:admin` e `board_admin` efetivo em todo board do cliente, membro ou nao,
com a visibilidade por escritorio ligada ou desligada (antes, so com a chave ligada). Preferida a
incluir os admins como membros ao criar o board: vale para boards antigos e para quem vira admin
depois. `seesAllCards` e `BoardAccessService` usam so `flow:admin`; destinos de importacao e do
Monitorar listam todo board ativo para o admin. A lista de membros do board segue mostrando so
quem foi incluido. Plataforma: 1000 testes, 0 falhas; lint.
