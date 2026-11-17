# Kanban Sprint 1 Gate

## Status

Gate criado e validado documentalmente. Implementado: CRUD de board/coluna/card, drag-and-drop entre colunas e dentro da mesma coluna, arquivamento de card, realtime via WebSocket, e modal/slide-over de card com deep-link via `?card=:cardId` (`app-jboot-next-platform/src/modules/kanban/components/CardModal.tsx` e `BoardView.tsx`). `created_at` do card e imutavel desde a criacao (nenhuma rota de update o altera).

> **Revisao de contrato pela Sprint 3 (2026-06-19):** `DELETE /kanban/boards/:boardId/cards/:cardId` deixou de significar "arquivar" e passou a significar "excluir definitivamente um card ja arquivado" (`409` se o card nao estiver arquivado). Arquivar agora e feito via `PATCH` com `{ status: 'archived' }` — rota que ja existia desde esta sprint e ja aceitava esse campo, so o client mudou de verbo. Ver `docs/product/kanban-sprint-3-gate.md`, secao "Decisoes De Implementacao".

## Escopo

Sprint 1: Board, Coluna, Card e Realtime.

Projetos afetados:

- `implementations/bff-jboot-platform/modules/kanban`;
- `implementations/app-jboot-next-platform/modules/kanban`.

## Objetivo

Implementar a base operacional do board Kanban (produto "Flow"):

- CRUD de board;
- CRUD de coluna (nome, ordem, cor, `wip_limit`);
- CRUD basico de card (titulo, descricao);
- drag-and-drop de card entre colunas;
- sincronizacao realtime via WebSocket entre usuarios conectados ao mesmo board;
- papeis binarios `board_admin`/`board_member`, sem granularidade por coluna ainda;
- isolamento por `client_id` em banco dedicado.

## Artefatos Do Gate

| Artefato | Caminho | Status |
|---|---|---|
| Roadmap da sprint | `docs/product/kanban-sprints.md` | criado |
| Modelo de dados | `docs/data/kanban-sprint-1-data-model.md` | criado |
| Contrato OpenAPI + WebSocket | `docs/api/kanban-sprint-1-openapi.yaml` | criado |
| Contrato do modulo backend | `implementations/bff-jboot-platform/modules/kanban/MODULE_CONTRACT.md` | criado |
| Contrato do modulo frontend | `implementations/app-jboot-next-platform/modules/kanban/MODULE_CONTRACT.md` | criado |

## Regras De Negocio

- Um board pertence a exatamente um `client_id`.
- Uma `BoardColumn` pertence a exatamente um `Board` e tem ordem explicita (`position`).
- `wip_limit` quando definido (`> 0`) limita a quantidade de cards `active` simultaneos na coluna; o backend deve rejeitar movimentacao que exceda o limite com erro estruturado.
- Um `Card` pertence a exatamente uma `BoardColumn` em um dado momento; mover card altera `board_column_id` e `position` dentro da nova coluna.
- `BoardMember` define o papel (`board_admin` ou `board_member`) de uma identidade dentro de um board especifico.
- Toda mutacao de estrutura do board (criar/editar/remover coluna, configurar `wip_limit`) exige papel `board_admin`.
- Mutacao de card (criar, editar, mover) exige papel `board_admin` ou `board_member`.

## Fluxos

- Usuario autorizado lista boards do tenant ao acessar `/flow`.
- Usuario autorizado cria board informando nome.
- `board_admin` cria/edita/reordena/remove colunas do board.
- `board_admin`/`board_member` cria/edita card em uma coluna.
- `board_admin`/`board_member` move card entre colunas via drag-and-drop; movimentacao e persistida e emitida via WebSocket (`card.moved`) para os demais usuarios conectados ao mesmo board.
- Usuario conectado ao board recebe atualizacao realtime sem precisar recarregar a pagina.

## Realtime — Requisito Explicito Da Sprint 1

- Mecanismo: WebSocket Gateway nativo do NestJS (`@nestjs/websockets`), adapter padrao do ecossistema (`socket.io` ou `ws`).
- Namespace: `/flow/ws`.
- Evento principal: `card.moved` (card movido entre colunas).
- Escopo de broadcast: todos os clientes conectados ao mesmo `boardId`, exceto quando ACL de coluna (Sprint 3) determinar filtro — nao aplicavel nesta sprint, pois papeis sao binarios.
- Limitacao conhecida: sem Redis/pub-sub multi-instancia no MVP. Realtime funciona corretamente apenas com uma instancia de `platform-api`. Escala horizontal de realtime fica para decisao tecnica futura.

## Papeis

- `board_admin`: administra board, colunas e membros; opera cards.
- `board_member`: opera cards (criar, editar, mover); nao administra estrutura do board.

Scopes Identity mapeados (mesmo padrao de `juridico:read/write/admin`):

- `flow:read` — leitura de boards/colunas/cards.
- `flow:write` — criacao/edicao/movimentacao de cards.
- `flow:admin` — administracao de board/colunas (equivalente a `board_admin`).

## Casos De Erro

- Usuario sem `flow:write`/`flow:admin` tentando mutar recurso: erro estruturado `403`.
- Movimentacao de card para coluna que excede `wip_limit`: erro estruturado, movimentacao rejeitada.
- Card ou coluna referenciando `board_id` de outro `client_id`: erro estruturado `404` (nao expor existencia cross-tenant).
- Conexao WebSocket sem JWT valido: conexao rejeitada no handshake.
- Evento `card.moved` recebido para board ao qual o usuario nao pertence: gateway nao deve emitir (validar `BoardMember` antes de unir a sala/room do board).

## Fronteiras Backend/Web

Backend `bff-jboot-platform/modules/kanban`:

- valida contexto (JWT, `client_id`, scopes);
- aplica regra de negocio de board/coluna/card;
- acessa PostgreSQL dedicado (`postgres.kanban`);
- expoe OpenAPI REST e WebSocket Gateway;
- garante isolamento por `client_id`;
- registra auditoria de mutacoes administrativas.

Frontend `app-jboot-next-platform/modules/kanban`:

- consome OpenAPI via client tipado;
- conecta ao WebSocket Gateway e atualiza UI em tempo real;
- nao envia `client_id` em formularios comuns;
- nao duplica regra de autorizacao;
- exibe estados de loading, empty, error e success;
- usa identidade visual conforme `docs/design-system.md`.

## Criterios De Aceite Funcionais

- Usuario autorizado lista, cria e edita boards.
- `board_admin` cria, edita, reordena e remove colunas.
- `board_admin`/`board_member` cria e edita cards (titulo, descricao).
- `board_admin`/`board_member` move card entre colunas via drag-and-drop.
- Outro usuario conectado ao mesmo board ve a movimentacao em tempo real sem reload.
- Usuario sem permissao adequada recebe erro estruturado.
- `wip_limit` da coluna e respeitado na movimentacao.

## Criterios De Aceite Tecnicos

- CRUDs separados por dominio (Board, BoardColumn, Card, BoardMember).
- DTOs e responses tipados.
- Listagens paginadas com `limit` e `offset`.
- Filtros por `client_id` sempre aplicados no backend, em banco dedicado.
- `client_id` nunca vem de input livre do frontend.
- IDs em UUID.
- Mutacoes administrativas auditaveis.
- Contrato OpenAPI atualizado antes da implementacao; eventos WebSocket documentados em `x-websocket`.
- Testes cobrem isolamento multi-tenant e broadcast restrito ao board correto.

## Plano De Validacao

Backend:

- teste de contrato OpenAPI;
- teste unitario de services (board/coluna/card);
- teste de repository garantindo filtro por `client_id`;
- teste de autorizacao por scope/role;
- teste de gateway WebSocket garantindo que apenas membros do board recebem `card.moved`;
- teste de `wip_limit`;
- build/typecheck/lint quando houver codigo.

Frontend:

- type-check;
- testes de client API tipado;
- teste de conexao/reconexao WebSocket;
- estados loading/empty/error/success;
- validacao de formulario;
- smoke das rotas `/flow` e `/flow/boards/:id`;
- build quando houver codigo.

## Agents E Skills

Backend:

- `implementations/bff-jboot-platform/agents/backend-node-typescript.md`;
- `implementations/bff-jboot-platform/agents/platform-auth-context.md`;
- `implementations/bff-jboot-platform/agents/platform-postgres.md`;
- `implementations/bff-jboot-platform/modules/kanban/agents/kanban-board-domain.md`;
- `implementations/bff-jboot-platform/modules/kanban/skills/kanban-board-crud.md`;
- `implementations/bff-jboot-platform/modules/kanban/skills/kanban-realtime.md`.

Web:

- `implementations/app-jboot-next-platform/agents/frontend-next-typescript.md`;
- `implementations/app-jboot-next-platform/agents/platform-layout.md`;
- `implementations/app-jboot-next-platform/agents/backend-contract-client.md`;
- `implementations/app-jboot-next-platform/modules/kanban/agents/kanban-board-ui.md`;
- `implementations/app-jboot-next-platform/modules/kanban/skills/kanban-board-ui.md`.

## Riscos

- Realtime sem Redis/pub-sub limita a uma instancia de `platform-api` — risco aceito pelo usuario, documentado, nao resolvido nesta sprint.
- Permitir `client_id` no payload abre risco de vazamento entre tenants.
- Tratar papeis binarios como definitivos pode gerar retrabalho na Sprint 3 (ACL granular) se a estrutura de autorizacao nao for desenhada para extensao.
- WebSocket sem validacao de `BoardMember` antes de entrar na room pode vazar evento para usuario sem acesso ao board.

## Fora De Escopo

- campos customizados de card (`CardFieldDefinition`/`CardFieldValue`);
- form builder do board;
- `WorkflowTransitionRule`;
- `BoardColumnPermission` (ACL granular por coluna);
- Redis/pub-sub multi-instancia;
- feature de IA.

## Validacao Do Gate

Resultado: aprovado documentalmente (fluxo PO -> PE -> Architect -> confirmacao humana concluido antes deste artefato).

Pendencias antes de codigo funcional:

- nenhuma pendencia bloqueante registrada; decisoes de escopo, multi-tenancy, realtime e papeis foram confirmadas pelo usuario antes deste gate.
