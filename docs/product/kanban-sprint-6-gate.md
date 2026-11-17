# Kanban Sprint 6 Gate

## Status

Implementado em 2026-06-23. Escopo definido diretamente pelo usuario na conversa de implementacao (PO/PE/Architect informais — mesmo padrao incremental usado na Sprint 5); usuario confirmou explicitamente o inicio do codigo na mesma conversa (este documento e a materializacao do contrato dessa confirmacao).

Validado via: chamadas diretas ao endpoint `GET /kanban/metrics` (sem filtro, com `boardId`, com `boardId`+`assigneeId`, isolamento multi-tenant — board nao acessivel retorna 403, sem token retorna 401), typecheck/lint backend e frontend limpos, e smoke de SSR das rotas `/flow` e `/flow/boards` (200, sem erro de compilacao). Nao houve verificacao em navegador real interagindo com os 3 seletores (sem ferramenta de browser automatizado disponivel no ambiente de implementacao) — recomendado smoke manual do usuario antes de considerar a sprint encerrada do lado de UI.

**Bug corrigido durante a validacao**: `MetricsRepository.getByColumn` passava um parametro (`identityId`) nao referenciado na query SQL, causando erro do Postgres (`could not determine data type of parameter $2`). Corrigido removendo o parametro nao usado — a verificacao de membership do board ja ocorre antes, no `MetricsService`, via `BoardAccessService`.

## Escopo

Sprint 6: Dashboard De Metricas (Home Do Modulo Flow).

Projetos afetados:

- `implementations/bff-jboot-platform/modules/kanban`;
- `implementations/app-jboot-next-platform/modules/kanban`.

## Objetivo

Adicionar uma pagina "Home" ao modulo Flow, acima de "Boards" no menu lateral, com metricas agregadas sobre os cards do tenant (todos os boards que o usuario logado pode acessar), filtravel por board, responsavel e status.

Valor: usuario tem visao consolidada do andamento do trabalho sem precisar abrir board por board.

## Decisao Tecnica (Roteamento)

A pagina `/flow` atualmente E a listagem de boards (`BoardListPanel`). Para "Home" ficar na raiz do modulo (convencao natural de landing page):

- `/flow` passa a ser a nova pagina de metricas (Home).
- A listagem de boards (conteudo atual de `/flow/page.tsx`) move para `/flow/boards`.
- Menu lateral (`LayoutMenuData.tsx`): item "Home" (`link: "/flow"`) acima de "Boards" (`link: "/flow/boards"`, antes apontava para `/flow`).

Nenhuma outra rota existente muda (`/flow/boards/[boardId]/...` ja vive sob `/flow/boards`, sem conflito).

## Regras De Negocio

- Metricas sao calculadas em cima dos cards de **todos os boards onde o usuario logado e membro ativo** (`board_admin`/`board_member`/`board_viewer`) — mesmo escopo ja usado em `kanbanApi.boards.list`. Nunca incluir board de outro `client_id` (isolamento multi-tenant existente).
- Por padrao, considera apenas cards com `status = 'active'` (cards arquivados nao entram nas contagens "atuais"); a metrica de throughput (`Regra 6`) e a unica que olha explicitamente para arquivamento.
- Tres filtros combinaveis, aplicados a todas as metricas da pagina:
  - `boardId` (opcional) — restringe a um board especifico;
  - `assigneeId` (opcional) — restringe a cards onde a identidade esta entre os `assigneeIds`;
  - `statusId` (opcional) — restringe a cards com aquele `cardStatusId`.
- Metricas da Home (todas reagem aos 3 filtros acima):
  1. **Total de cards** — contagem simples do conjunto filtrado.
  2. **Cards por status** — agrupamento por `CardStatus` (inclui um grupo "Sem status" para `card_status_id is null`).
  3. **Cards por responsavel** — agrupamento por `identity_id` em `CardAssignee` (um card com 2 responsaveis conta 1x para cada — visao de carga de trabalho, nao soma cards unicos).
  4. **Cards sem responsavel** — contagem de cards ativos sem nenhum `CardAssignee`.
  5. **Cards por coluna** — agrupamento por `BoardColumn`, **somente quando `boardId` esta selecionado** (nomes de coluna nao sao comparaveis entre boards diferentes); sem `boardId`, a API omite esse bloco e o frontend mostra uma chamada para selecionar um board.
  6. **Throughput (30 dias)** — `criados`: contagem de cards com `created_at >= now() - 30d` (respeitando os filtros, ignorando o corte de `status = 'active'` desta regra especifica, pois cria/arquiva sao a metrica); `concluidos`: contagem de cards com `status = 'archived' AND updated_at >= now() - 30d` (usa `updated_at` como proxy do momento de arquivamento — nao ha timestamp dedicado de archive nesta versao).
  7. **Colunas com WIP excedido** — somente quando `boardId` esta selecionado: lista de colunas onde `count(cards ativos na coluna) >= wip_limit` (quando `wip_limit` definido).
  8. **Tempo medio por coluna (lead time)** — **ultimo item a ser implementado nesta sprint**, somente quando `boardId` esta selecionado. Calculado a partir do historico de `CardActivity.system_event` com `event_payload.kind = 'card.moved'` (`fromBoardColumnId`/`toBoardColumnId`, ja gravados desde a Sprint 4) mais `Card.created_at`:
     - Para cada card do conjunto filtrado, reconstroi a linha do tempo de colunas em ordem cronologica: inicia em `created_at` na coluna inicial (o `fromBoardColumnId` do primeiro `card.moved`, ou a `boardColumnId` atual do card se ele nunca foi movido); cada `card.moved` fecha o segmento da coluna de origem e abre um novo segmento na coluna de destino; o ultimo segmento fecha em `updated_at` se o card estiver arquivado (mesmo proxy usado no throughput) ou em "agora" se ainda ativo.
     - Agrega por coluna: `avgDurationSeconds` (duracao media dos segmentos naquela coluna) e `visitsCount` (quantos segmentos/visitas a coluna teve no conjunto filtrado).
     - Reconstrucao feita em codigo da aplicacao (nao SQL puro) — unica metrica desta sprint que nao e um simples `group by`/`count`; aceitavel porque so roda com `boardId` definido (conjunto de cards limitado a um board, nao ao tenant inteiro).
- Nome de responsavel exibido via resolucao de identidade ja existente (`MembersRepository.resolveDisplayNames`), nunca o UUID crudo.

## Fluxos

- Usuario acessa `/flow` (Home) e ve as metricas acima, sem filtro algum aplicado por padrao (todos os boards que pode acessar).
- Usuario seleciona um board, um responsavel e/ou um status nos 3 seletores; todas as metricas da pagina recalculam respeitando a combinacao escolhida.
- Usuario limpa um filtro voltando ao estado "todos".

## Fronteiras Backend/Web

Backend `bff-jboot-platform/modules/kanban`:

- Novo endpoint `GET /kanban/metrics?boardId=&assigneeId=&statusId=` (scope `flow:read`), calculado via SQL de agregacao (nao busca todos os cards e agrega em memoria) sobre os boards ativos do usuario.
- Resposta (forma definitiva a ser detalhada no DTO durante a implementacao, nao um contrato OpenAPI separado — mesmo padrao leve da Sprint 5):
  ```
  {
    totalCards: number;
    byStatus: Array<{ statusId: string | null; statusName: string; count: number }>;
    byAssignee: Array<{ identityId: string; displayName: string | null; count: number }>;
    unassignedCount: number;
    byColumn: Array<{ columnId: string; columnName: string; count: number; wipLimit: number | null }> | null;
    columnsOverWip: Array<{ columnId: string; columnName: string; count: number; wipLimit: number }>;
    throughput: { createdLast30Days: number; archivedLast30Days: number };
    leadTimeByColumn: Array<{ columnId: string; columnName: string; avgDurationSeconds: number; visitsCount: number }> | null;
  }
  ```
- Nenhuma tabela nova — leitura agregada sobre `kanban_cards`, `kanban_card_assignee_links` (Sprint 4), `kanban_card_statuses`/`kanban_board_columns` existentes, e `kanban_card_activities` (Sprint 4) para o lead time por coluna.

Frontend `app-jboot-next-platform/modules/kanban`:

- Nova pagina `/flow` (Home): 3 seletores (board, responsavel, status) + cards de metricas (numeros, listas/barras simples).
- `BoardListPanel` (conteudo atual de `/flow`) move para `/flow/boards`.
- Menu lateral: novo item "Home" acima de "Boards".

## Criterios De Aceite Funcionais

- Metricas nunca incluem board de outro `client_id` ou board onde o usuario nao e membro ativo.
- Os 3 filtros (board/responsavel/status) combinam com AND e recalculam todas as metricas da pagina.
- "Cards por coluna", "Colunas com WIP excedido" e "Tempo medio por coluna" ficam ausentes/desabilitados quando nenhum board esta selecionado.
- "Cards sem responsavel" e "Cards por responsavel" usam nome de exibicao, nunca UUID.
- Menu lateral mostra "Home" acima de "Boards"; "Boards" continua levando a listagem de boards (agora em `/flow/boards`).
- Tempo medio por coluna reflete corretamente cards nunca movidos (1 segmento, da criacao até agora/arquivamento) e cards movidos varias vezes (multiplos segmentos, inclusive revisitas a mesma coluna).

## Criterios De Aceite Tecnicos

- Agregacao feita via SQL (`count`/`group by`/`FILTER`), nao via fetch de todos os cards + reduce em JS.
- Endpoint novo protegido pelo mesmo guard/scope (`KanbanAuthGuard`, `flow:read`) dos demais endpoints de leitura do modulo.
- Sem migration de schema (sem tabela nova).
- Rota `/flow/boards` criada sem quebrar `/flow/boards/[boardId]` existente.

## Plano De Validacao

Backend:

- teste de isolamento multi-tenant (metricas nunca cruzam `client_id`);
- teste de combinacao dos 3 filtros (cada um isolado e os 3 juntos);
- teste de "cards por coluna"/"WIP excedido" ausente sem `boardId`;
- teste de contagem de "sem responsavel" e "por responsavel" com card multi-assignee;
- teste de reconstrucao de linha do tempo para lead time: card nunca movido, card movido 1x, card movido varias vezes (inclusive revisita a mesma coluna), card arquivado (fecha ultimo segmento em `updated_at`, nao em "agora");
- build/typecheck/lint.

Frontend:

- type-check;
- smoke da Home com os 3 filtros isolados e combinados;
- smoke de `/flow/boards` (listagem preservada na nova rota);
- smoke do menu lateral (Home acima de Boards, navegacao correta);
- estados loading/empty/error/success.

## Riscos

- Throughput usando `updated_at` como proxy de "quando foi arquivado" pode distorcer a metrica se um card arquivado for editado depois (raro, mas possivel) — aceito por agora, mesma logica simplificada ja usada em outros lugares do modulo.
- Performance da agregacao em tenants com muitos cards: sem paginacao (metricas sao sempre agregadas, nao listagem), risco baixo mas a query precisa ter indice em `board_id`/`status`/`card_status_id` (ja existem da Sprint 1/5).
- Lead time por coluna reconstroi a timeline em codigo da aplicacao (nao em SQL) — custo cresce com o numero de cards e de eventos `card.moved` do board selecionado; aceitavel porque o calculo so roda com `boardId` definido (escopo de um board, nao do tenant inteiro), mas deve ser o ultimo item implementado para nao bloquear as demais metricas (mais simples) caso a reconstrucao exija mais iteracao.

## Fora De Escopo

- Exportar metricas (CSV/PDF).
- Dashboard configuravel pelo usuario (adicionar/remover widgets).
- Metricas historicas com selecao de periodo customizado (so "ultimos 30 dias" fixo nesta sprint).
