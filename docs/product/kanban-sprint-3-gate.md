# Kanban Sprint 3 Gate

## Status

Gate criado e validado documentalmente quanto a escopo de produto. Modelo de dados revisado **aprovado pelo Architect** (ver secao "Decisao Do Architect"). Pontos remanescentes exigem confirmacao humana explicita antes de codigo — ver `docs/product/kanban-sprints.md` e secao "Pendencias" abaixo.

## Decisao Do Architect

Status: `approved_for_implementation`. Confirmacao humana do usuario registrada em 2026-06-19: troca de `role` fixo para `profile_id` (`MemberProfile`) aprovada, liberado para codigo.

1. **Modelagem `MemberProfile` + `MemberProfileTransition` + `BoardColumnPermission` (tabelas separadas): aprovada.** Nao deveriam ser fundidas em uma unica tabela. Transicao de coluna (`from -> to`, arestas de um grafo) e ACL de coluna (`view`/`edit` por coluna, vertices) sao dimensoes ortogonais com cardinalidade diferente — uma tabela unica forcaria nullable cruzado (`from_column` nulo para linhas de ACL, `can_view`/`can_edit` nulos para linhas de transicao) e geraria CHECK constraints condicionais frageis. Separar tambem bate com o padrao ja usado no schema atual (`kanban_board_columns`, `kanban_cards` como tabelas dedicadas por responsabilidade) e com a regra do `MODULE_CONTRACT.md` de "ACL dedicada, nunca array em membro". `MemberProfile` exclusivo por board (nao reutilizavel entre boards) tambem esta correto para este estagio: nao ha ainda caso de uso de template cross-board no escopo de produto, e prematuramente generalizar isso seria complexidade sem necessidade real (violaria a regra global de "nao escolher atalhos que gerem retrabalho", mas tambem a de nao introduzir abstracao sem demanda concreta).
2. **`board_admin` com bypass total: aprovado, e coerente com o sistema de auth atual.** O codigo de producao (`board-access.service.ts`, `cards.service.ts`, `kanban.gateway.ts`) ja usa `requireRole(context, boardId, ['board_admin', 'board_member'])` como porta de entrada grosseira antes de qualquer regra fina; `board_admin` sempre passa por ali. Adicionar bypass de perfil em cima disso e a mesma forma de checagem hierarquica que ja existe, nao um padrao novo. O scope `flow:admin` do Identity Hub mapeia para o papel `board_admin` (mesmo padrao de `juridico:admin`/`pdv:admin`), e o papel `board_admin` em si ja e a interface de "administrador de board" usada para customizar estrutura — perfil e uma further restriction do `board_member` operacional, nao uma camada que deveria se sobrepor a quem administra a estrutura. Bypass de admin sobre regra fina e o padrao em todo o restante do sistema (nenhum modulo do hub hoje submete `*_admin` a ACL granular de dados); inverter isso so para Kanban criaria inconsistencia arquitetural sem ganho de seguranca real, dado que `board_admin` ja pode editar/excluir a estrutura (colunas, perfis, ACL) que definiria a propria restricao.
3. **Membro sem perfil bloqueado: enforcavel de forma limpa, com um ajuste de implementacao a registrar (nao bloqueia o contrato).** O ponto de extensao certo e `BoardAccessService`: hoje `requireRole` resolve so o `role` (`findActiveRole`); a implementacao da Sprint 3 deve adicionar um metodo equivalente, ex. `requireProfileCapability(context, boardId, capability)`, que busca `BoardMember.profile_id` e so então decide bypass (`role === 'board_admin'`) vs. checagem em `MemberProfileTransition`/`can_delete_archived_cards`. Isso mantem a mesma forma usada em `CardsService.move`/`archive` (`access.requireRole(...)` antes da operacao) e nao exige duplicar logica em controller. `profile_id IS NULL` deve resultar em `ForbiddenException` explicita (nao em fallback silencioso para nenhuma transicao permitida via ausencia de linhas) — a ausencia de perfil e um estado distinto de "perfil sem nenhuma transicao cadastrada", e a mensagem de erro estruturado deve diferenciar os dois para facilitar suporte/operacao.
4. **Risco tecnico nao listado no gate, registrado aqui:** o `role` em `kanban_board_members` hoje (schema `013_kanban.sql`) so aceita `'board_admin'`/`'board_member'` via CHECK constraint — `board_viewer` ainda nao existe em banco, apesar de citado em `MODULE_CONTRACT.md` e na Sprint 1 data-model como "papel valido a partir da Sprint 3". A migration da Sprint 3 precisa alterar essa CHECK constraint (`DROP CONSTRAINT` + `ADD CONSTRAINT` com `board_viewer` incluso) alem de criar as tabelas novas — isso deve constar explicitamente no plano tecnico de implementacao, nao so a criacao de tabelas novas.

Nenhuma das pendencias acima e um problema de modelagem; sao detalhes de implementacao a serem seguidos pelo PE/codigo, registrados aqui para nao se perderem.

## Decisoes De Implementacao (Tomadas Durante O Codigo)

Implementado em 2026-06-19. O contrato (gate + OpenAPI) deixou duas coisas subespecificadas; resolvidas durante a implementacao e registradas aqui para nao ficarem implicitas:

1. **Rota `DELETE /kanban/boards/:boardId/cards/:cardId` foi repropositada.** O OpenAPI da Sprint 3 documenta esse mesmo verbo+path como "permanently delete an archived card", mas a Sprint 1 ja usava `DELETE` para arquivar (soft-remove). Os dois comportamentos nao cabem na mesma rota. Decisao: `DELETE` agora significa exclusao definitiva, e so e aceito quando o card ja esta `archived` (`409 card_not_archived` caso contrario); arquivar passou a ser feito via `PATCH` com `{ status: 'archived' }` (rota generica de update que ja existia desde a Sprint 1 e ja aceitava esse campo). O client (`kanbanApi.cards.archive`) foi atualizado para chamar `PATCH`, nao `DELETE`. Isso e uma mudanca de contrato da Sprint 1 (nao so uma adicao da Sprint 3) — registrado tambem em `docs/product/kanban-sprint-1-gate.md`.
2. **Comportamento de `BoardColumnPermission` quando nao ha linha de ACL para `(profile_id, board_column_id)`:** nem o gate nem o data-model definiam o default da ausencia de registro (so o default da coluna `can_view`/`can_edit` quando uma linha E inserida). Decisao: ausencia de linha = acesso liberado (`can_view = true`, `can_edit = true`), nao bloqueado. Isso preserva o comportamento da Sprint 1 em boards onde `board_admin` ainda nao configurou nenhuma ACL — a restricao e estritamente opt-in, condizente com o risco ja registrado ("complexidade de ACL crescer sem necessidade real do tenant"). So uma linha explicita com `can_view = false`/`can_edit = false` restringe.
3. **Escopo de enforcement de `can_edit`:** o gate descreve `BoardColumnPermission` como "quais colunas o membro ve/edita", mas os criterios de aceite so testam `can_view` explicitamente. Decisao: `can_edit` da coluna de destino e exigido para criar card na coluna, editar/arquivar um card que esta naquela coluna, e mover um card para aquela coluna (alem da regra de transicao). Nao e exigido `can_edit` da coluna de origem ao mover um card PARA FORA dela (saida nunca e bloqueada por ACL de edicao, so a entrada no destino).
4. **Filtragem de `card.moved` no realtime** e feita por destinatario: ao emitir, o gateway resolve o `kanbanContext` de cada socket conectado na room do board e so envia se aquele usuario tem `can_view` na coluna de destino (ou e `board_admin`). Isso exigiu trocar `server.to(room).emit(...)` por iteracao via `fetchSockets()` + emissao individual — unico jeito de filtrar por destinatario com Socket.IO sem salas adicionais por perfil (fora de escopo criar uma sala por combinacao perfil x coluna).

## Escopo

Sprint 3: Perfis De Movimentacao E Permissao Granular Por Coluna.

Projetos afetados:

- `implementations/bff-jboot-platform/modules/kanban`;
- `implementations/app-jboot-next-platform/modules/kanban`.

## Objetivo

Permitir que cada board defina perfis nomeados (`MemberProfile`), mais granulares que os 3 papeis fixos (`board_admin`/`board_member`/`board_viewer`), controlando:

- quais transicoes `coluna origem -> coluna destino` um membro pode executar;
- se o membro pode excluir definitivamente cards arquivados;
- quais colunas o membro ve/edita (`BoardColumnPermission`, agora chaveada por perfil, nao por papel).

## Revisao De Escopo Vs. Versao Anterior

O `MODULE_CONTRACT.md` do backend continha a premissa "Permissao por coluna usa tabela ACL dedicada, nunca array em membro", com a chave de papel fixo. O PO revisou o escopo (`docs/product/kanban-sprints.md`) para que a granularidade seja por `MemberProfile` nomeado e exclusivo de um board (nao reutilizavel entre boards). A tabela ACL dedicada e mantida; apenas a chave estrangeira passa de `role` para `profile_id`. `board_admin` continua bypassando qualquer restricao de perfil, tanto em movimentacao quanto em exclusao definitiva.

## Regras De Negocio

- `MemberProfile` pertence a exatamente um `board_id` (nao reutilizavel entre boards).
- `MemberProfile.can_delete_archived_cards` (boolean) habilita o membro com esse perfil a excluir definitivamente cards arquivados do board.
- `MemberProfileTransition` define pares `(from_board_column_id, to_board_column_id)` permitidos por perfil. Ausencia de registro para um par = transicao bloqueada para esse perfil.
- `BoardMember.profile_id` (nullable) associa um perfil ao membro. Membro sem perfil atribuido nao move card entre colunas nem exclui card arquivado (mesmo que tenha `flow:write`).
- `board_admin` sempre bypassa `MemberProfile` (movimentacao livre entre quaisquer colunas, exclusao definitiva livre), independente de perfil atribuido ou ausencia de perfil.
- Exclusao definitiva de card arquivado e permitida para: autor do card (`Card.created_by_identity_id`), membro cujo perfil ativo tem `can_delete_archived_cards = true`, ou `board_admin`.
- `BoardColumnPermission` define, por `(profile_id, board_column_id)`, capacidades `can_view`/`can_edit`. Usuario sem `can_view` na coluna nao a recebe na listagem nem em eventos realtime.

## Fluxos

- `board_admin` cria/edita/remove `MemberProfile` dentro do board.
- `board_admin` define `MemberProfileTransition` por perfil.
- `board_admin` define `can_delete_archived_cards` por perfil.
- `board_admin` atribui/remove `profile_id` de cada `BoardMember`.
- Movimentacao de card que viole `MemberProfileTransition` do perfil do usuario retorna erro estruturado `403`, nao falha silenciosa.
- Exclusao definitiva de card arquivado fora das regras acima retorna erro estruturado `403`.
- Backend filtra colunas sem `can_view` do perfil do usuario antes de responder listagem e antes de emitir evento realtime.

## Fronteiras Backend/Web

Backend `bff-jboot-platform/modules/kanban`:

- CRUD de `MemberProfile`, `MemberProfileTransition`, `BoardColumnPermission` restrito a `board_admin`.
- Valida transicao de coluna e exclusao definitiva antes de persistir, usando `profile_id` do `BoardMember` autenticado (ou bypass se `board_admin`).
- Filtra colunas por `BoardColumnPermission.can_view` em toda resposta de leitura e em todo evento WebSocket emitido.

Frontend `app-jboot-next-platform/modules/kanban`:

- Tela `/flow/boards/:id/settings/profiles`: CRUD de perfis, matriz de transicoes, matriz de ACL por coluna, atribuicao de perfil a membro.
- Board (`/flow/boards/:id`) renderiza apenas as colunas/acoes que a resposta do backend já filtrou para o perfil do usuario logado — UI nunca reimplementa a logica de ACL localmente.

## Criterios De Aceite Funcionais

- `board_admin` cria, edita e remove perfis do board.
- `board_admin` configura transicoes permitidas por perfil.
- `board_admin` configura `can_delete_archived_cards` por perfil.
- `board_admin` atribui perfil a membro.
- Membro sem perfil atribuido recebe erro estruturado ao tentar mover card ou excluir card arquivado.
- Movimentacao fora das transicoes do perfil do usuario retorna erro estruturado.
- Exclusao definitiva de card arquivado e permitida apenas para autor, perfil com `can_delete_archived_cards`, ou `board_admin`.
- `board_admin` nunca e bloqueado por perfil em nenhum cenario de teste.
- Usuario sem `can_view` em uma coluna nao a ve no board.

## Criterios De Aceite Tecnicos

- `MemberProfile`/`MemberProfileTransition`/`BoardColumnPermission` modelados como tabelas normalizadas, com FK para `board_id`/`client_id`.
- `BoardColumnPermission` chaveada por `profile_id`, nunca por `role` ou array em `BoardMember`.
- Validacao de transicao e exclusao definitiva centralizada no backend (nao duplicada no frontend).
- Eventos realtime (`card.moved` e correlatos) filtrados por ACL de coluna do perfil do destinatario antes de emitir.
- Testes cobrem bypass de `board_admin` em todos os cenarios de perfil.
- Contrato OpenAPI atualizado (`docs/api/kanban-sprint-3-openapi.yaml`) antes da implementacao.

## Plano De Validacao

Backend:

- teste unitario de validacao de `MemberProfileTransition` (permitido/bloqueado);
- teste de exclusao definitiva (autor, perfil com flag, `board_admin`, e negativo para os demais);
- teste de filtro de `BoardColumnPermission` em listagem e em emissao de evento realtime;
- teste de bypass de `board_admin` em todos os cenarios acima;
- teste de isolamento multi-tenant nas novas tabelas;
- build/typecheck/lint.

Frontend:

- type-check;
- smoke da tela `/flow/boards/:id/settings/profiles` (CRUD de perfil, matriz de transicao, matriz de ACL);
- teste de que o board oculta coluna sem `can_view` do perfil do usuario logado;
- estados loading/empty/error/success;
- build.

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

- Complexidade de perfis crescer sem necessidade real do tenant (muitos perfis por board).
- Eventos realtime vazarem dados de coluna restrita se o gateway nao filtrar por ACL antes de emitir.
- Retrabalho se algum tenant ja estiver operando com o modelo antigo por papel antes desta revisao (mitigado: modulo ainda nao tem dados de producao para este caso).

## Fora De Escopo

- Automacoes condicionais alem de transicao de coluna.
- Notificacoes externas (email/push) de mudanca de workflow.
- Perfis reutilizaveis entre boards.

## Pendencias

- **Resolvida pelo Architect**: revisao de modelo de ACL por coluna — troca da chave de `role` fixo para `profile_id` (`MemberProfile`) e tabelas separadas para transicao/ACL. Aprovada tecnicamente, ver secao "Decisao Do Architect".
- **Resolvida — confirmacao humana (2026-06-19)**: usuario aprovou a liberacao para codigo da troca `role` -> `profile_id`. Nenhuma pendencia de aprovacao restante para a Sprint 3.
- Registrado como item de implementacao (nao bloqueia o contrato, mas deve constar no plano tecnico): migration da Sprint 3 precisa atualizar a CHECK constraint de `kanban_board_members.role` para incluir `board_viewer`, alem de criar as tabelas novas.
