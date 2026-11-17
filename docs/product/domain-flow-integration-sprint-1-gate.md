# Domain Flow Integration Sprint 1 Gate

## Status

Gate criado apos confirmacao humana da arquitetura em 2026-08-26.

## Escopo

Sprint 1: Juridico -> Flow.

Projetos afetados:

- `implementations/bff-jboot-platform/modules/kanban`;
- `implementations/bff-jboot-platform/modules/juridico`;
- `implementations/bff-jboot-platform/src/modules/domain-integrations`;
- `implementations/app-jboot-next-platform/modules/juridico`;
- `implementations/app-jboot-next-platform/modules/kanban`.

## Objetivo

Permitir que uma comunicacao/processo juridico capturado no Juridico seja
exportado como card para um board Flow escolhido pelo usuario, usando a coluna
padrao do board.

## Stack Fit Gate

| Alternativa | Decisao |
|---|---|
| Modulo interno no `bff-jboot-platform` | Escolhida. Reusa contexto Identity, `client_id`, `database_ref`, pools de banco e contracts dos modulos existentes sem criar auth S2S. |
| Projeto/servico separado | Rejeitada para Sprint 1. Nao ha fila duravel, processamento pesado, SLA separado, deploy isolado ou consumidor externo que justifique custo operacional. |
| Integracao no frontend | Rejeitada. Criaria acoplamento entre modulos e permitiria burlar regras server-side de entitlement, board access e coluna padrao. |

## Regras De Negocio

- A acao nasce no contexto autenticado do Juridico.
- A exportacao so executa quando o cliente tambem possui Flow contratado.
- O usuario deve selecionar o board destino.
- A coluna destino e sempre a coluna padrao do board selecionado.
- Todo board criado apos esta sprint deve nascer com coluna `BACKLOG` ativa,
  posicao `0`, renomeavel pelo usuario.
- O backend deve conseguir recuperar a coluna padrao mesmo apos renome.
- A UI nao envia `client_id`, `database_ref` nem `boardColumnId`.
- O card criado deve guardar referencia estruturada ao registro de origem para
  auditoria e idempotencia futura.

## Fluxos

1. Usuario abre a listagem de comunicacoes/processos no Juridico.
2. A linha mostra `Export to Flow`.
3. Frontend consulta capability/listagem de boards de importacao.
4. Sem Flow contratado, o botao fica desabilitado.
5. Com Flow contratado, o clique abre modal com boards acessiveis.
6. Usuario seleciona board e confirma.
7. Backend valida acesso ao registro juridico.
8. Backend valida que o cliente possui Flow e que o usuario acessa o board.
9. Backend resolve a coluna padrao do board.
10. Backend cria card no Flow e retorna `{ boardId, cardId, cardUrl }`.

## Contrato De Dados

- `kanban_board_columns.is_default boolean not null default false`;
- indice unico parcial por `client_id, board_id` onde `is_default = true`;
- card deve suportar origem externa estruturada:
  - `source_module`;
  - `source_type`;
  - `source_id`;
  - `source_payload`;
  - `source_url`.

## Contrato De API

- `GET /domain-integrations/flow/boards`;
- `POST /domain-integrations/juridico/pje/comunicacoes/:id/export-flow`.

Detalhes em `docs/api/domain-flow-integration-sprint-1-openapi.yaml`.

## Criterios De Aceite Funcionais

- Board Flow novo retorna uma coluna `BACKLOG` imediatamente apos a criacao.
- Modal no Juridico lista boards Flow acessiveis.
- Cliente sem Flow contratado ve a acao, mas nao consegue clicar.
- Chamada HTTP forcada sem Flow contratado retorna erro estruturado.
- Exportacao de comunicacao PJe cria card no board selecionado.
- Resposta inclui link para abrir o card no Flow.

## Criterios De Aceite Tecnicos

- Teste automatizado cobre criacao de board com `BACKLOG`.
- Teste automatizado cobre recuperacao da coluna padrao apos renome.
- Teste automatizado cobre bloqueio sem Flow contratado.
- Teste automatizado cobre adapter Juridico -> Flow.
- Queries continuam filtrando por `client_id`.
- Sem chamada direta do frontend juridico para client interno do Kanban.
- Type-check/build do backend e frontend rodam dentro do container.

## Agent Activation

Backend:

- `implementations/bff-jboot-platform/agents/backend-node-typescript.md`;
- `implementations/bff-jboot-platform/agents/platform-auth-context.md`;
- `implementations/bff-jboot-platform/agents/platform-postgres.md`;
- `implementations/bff-jboot-platform/modules/kanban/agents/kanban-board-domain.md`;
- `implementations/bff-jboot-platform/modules/kanban/skills/kanban-board-crud.md`;
- `implementations/bff-jboot-platform/skills/nest-module-pattern.md`;
- `implementations/bff-jboot-platform/skills/tenant-context.md`;
- `implementations/bff-jboot-platform/skills/api-contract.md`.

Frontend:

- `docs/agents/orchestration/ui-ux.md`;
- `implementations/app-jboot-next-platform/agents/frontend-next-typescript.md`;
- `implementations/app-jboot-next-platform/agents/platform-layout.md`;
- `implementations/app-jboot-next-platform/agents/backend-contract-client.md`;
- `implementations/app-jboot-next-platform/modules/juridico/agents/juridico-web.md`;
- `implementations/app-jboot-next-platform/modules/juridico/agents/juridico-api-client.md`;
- `implementations/app-jboot-next-platform/skills/next-module-pattern.md`;
- `implementations/app-jboot-next-platform/skills/platform-design-system.md`;
- `implementations/app-jboot-next-platform/skills/api-client.md`;
- `implementations/app-jboot-next-platform/modules/juridico/skills/juridico-web-ui.md`;
- `implementations/app-jboot-next-platform/modules/juridico/skills/juridico-api-client.md`.

## Riscos

- A forma atual de token por modulo pode nao carregar scopes do Flow quando o
  usuario esta no Juridico; por isso a validacao de cliente com Flow deve ser
  server-side e explicitamente testada.
- Idempotencia por origem externa evita duplicidade, mas pode exigir decisao de
  UX sobre "abrir card existente" em sprint posterior.

## Fora De Escopo

- Importacao reversa dentro do Flow.
- Exportacao em lote.
- Selecao manual de coluna.
- Mapeamento de campos customizados.
- Anexos do processo/comunicacao no card.

## Validacao Do Gate

Resultado: aprovado para implementacao apos confirmacao humana em 2026-08-26.

Pendencias:

- Nenhuma pendencia funcional da Sprint 1. A decisao confirmada e retornar o
  card existente e registrar a operacao de forma idempotente. Hardening
  cross-domain posterior e rastreado em
  `docs/product/domain-integrations-hardening-sprints.md`.
