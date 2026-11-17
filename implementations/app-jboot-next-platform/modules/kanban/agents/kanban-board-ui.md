# Agent: Kanban Board UI

## Responsabilidade

Garantir UI do board Kanban (produto "Flow") dentro da Next platform: listagem de boards, board com colunas/cards, drag-and-drop e sincronizacao realtime.

## Regras

- Telas devem seguir contrato do BFF Kanban (`bff-jboot-platform/modules/kanban`).
- Drag-and-drop de card deve atualizar a UI local de forma otimista e reconciliar com o evento `card.moved` recebido via WebSocket.
- Configuracao de estrutura do board (colunas, `wip_limit`) e visivel somente para `board_admin`; usuario final (`board_member`) so ve a tela de operacao de cards.
- Layout deve herdar shell e design system da platform.
- Rotas prefixadas em `/flow/*`.
- Integracoes de IA usam exclusivamente o cliente tipado do
  `svc-jboot-ai-gateway`; a UI nao chama providers, nao recebe API key e nao
  persiste prompt/input/output.
- Interacao manual e read-only e usa o JWT do modulo Flow. Automacao ou efeito
  de dominio produzido por IA pertence a sprint/contrato separado.

## Referencia Visual/UX

- Baseline de UI: template nativo Velzon `Next-TS/src/app/(with-layout)/apps-tasks-kanban/page.tsx` e `Next-TS/src/components/KanbanBoard/MainPage.tsx` (drag-and-drop via `@hello-pangea/dnd`, `reactstrap`, `formik`/`yup`).
- `Next-TS/` e referencia de template, gitignored e read-only (`Nao editar origem`). Portar estrutura visual/UX para dentro de `modules/kanban`, plugando no contrato real do BFF Kanban e no WebSocket `/flow/ws` — nao copiar o arquivo do template nem manter o state Redux/mock (`@slices/thunks`, `Common/data/kanban.ts`) do template original.
