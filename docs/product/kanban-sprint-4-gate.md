# Kanban Sprint 4 Gate

## Status

Implementado em 2026-06-19/20. `CardAssignee`, `CardActivity` (feed unico com geracao automatica de `system_event` em move/archive/title/description/assignee), `CardAttachment` via MinIO (upload multipart, download por URL assinada). Ver secao "Decisoes De Implementacao" para os pontos que o contrato deixava em aberto.

## Decisoes De Implementacao (Tomadas Durante O Codigo)

1. **Stack de upload**: `@nestjs/platform-express` (`FileInterceptor`) + `multer` (memory storage, sem gravar em disco) no controller; `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` no `StorageService` para falar com o MinIO (S3-compatible, `forcePathStyle: true`). Nenhuma dessas bibliotecas existia no projeto antes; instaladas especificamente para este modulo.
2. **URL de download assinada**: expira em 300s (5 min). O contrato so pedia "signed/temporary", sem definir duracao.
3. **Bucket criado automaticamente no boot** (`StorageService.onModuleInit`, via `HeadBucketCommand`/`CreateBucketCommand`), conforme `MODULE_CONTRACT.md` ja previa ("criacao idempotente no startup do modulo, nao via seed SQL").
4. **Geracao de `system_event` em `update()`**: só dispara quando o valor de fato muda (`dto.title !== existing.title`, idem para `description`/`status`) — uma chamada PATCH sem alteracao real nao poluí o feed com evento vazio.
5. **`CardsService.archive()`/`CardsRepository.archive()` removidos**: ja estavam mortos desde a Sprint 3 (arquivar virou `PATCH {status:'archived'}` no `update()`, o antigo metodo `archive()` nao era mais chamado por nenhuma rota). Aproveitei o trabalho nesta sprint para remover o codigo morto em vez de deixar acumular.
6. **Identidade exibida no histórico/atribuição**: frontend mostra só o UUID truncado (sem nome), pois não existe endpoint de resolução de identidade consumível pelo Kanban — mesma limitação já presente na tela de perfis da Sprint 3, não é regressão desta sprint.
7. **Bug real encontrado e corrigido na verificacao**: a URL assinada de download usava o mesmo `S3Client` configurado com o endpoint interno da rede docker (`http://minio:9000`), entao a URL gerada tinha esse host — irresolvivel pelo navegador real do usuario (so resolve dentro da rede docker). Corrigido com um segundo `S3Client` (`StorageService.presignClient`) configurado com `config.s3.publicEndpoint` (env `S3_PUBLIC_ENDPOINT`, default dev `http://localhost:9000`), usado exclusivamente para assinar a URL de download; upload/HEAD/CreateBucket continuam no endpoint interno. Validado fim a fim: GET no endpoint publico retorna o conteudo correto do arquivo.

## Decisao Do Architect

4. **`CardActivity` como feed unico (`type` + `text_content` nullable + `event_payload jsonb` nullable): modelagem aprovada e extensivel.** O padrao "tipo discriminado + payload JSONB para o ramo variavel" e adequado aqui porque `event_payload` e estritamente auxiliar/exibicao (nunca filtrado por chave especifica em query critica de autorizacao — diferente do caso de `CardFieldValue`, onde o `MODULE_CONTRACT.md` corretamente exige normalizacao por ser dado de negocio consultavel). Novos `event_payload.kind` (ex. futuro `card.due_date_changed`) entram sem migration de schema, so exigem nova chave de payload e atualizacao da lista de `kind` esperados na aplicacao/validacao — a tabela em si nao precisa mudar. Unico ajuste a registrar para a implementacao: o documento usa o nome de coluna `text_content` na regra de constraint mas declara o campo como `text content text null` (linha 48 do data-model) — ha um erro de digitacao no nome do campo (parece ter sido colado "text content text" em vez de "text_content text"); a migration deve usar `text_content`, consistente com a constraint descrita.
5. **`CardAttachment`/MinIO: gap de isolamento multi-tenant nao coberto pelo PE — aponto como bloqueante.** O modulo Kanban usa `dedicated_database` por `client_id` (um Postgres fisico por cliente), mas o bucket MinIO `kanban-card-attachments` e **compartilhado entre todos os clients** (um unico bucket para o modulo inteiro, nao um bucket por cliente). O data-model atual (`docs/data/kanban-sprint-4-data-model.md`) define `storage_bucket`/`storage_key` mas nao especifica a forma do `storage_key`, e o `MODULE_CONTRACT.md`/gate tambem nao tratam disso. Sem isolamento por `client_id` no path/key do objeto, um bug de autorizacao no service (ou uma chave adivinhada/vazada de outro tenant) chega direto a um arquivo de outro cliente dentro do mesmo bucket fisico — o isolamento de banco dedicado nao se estende ao storage de objetos compartilhado. **Decisao do Architect:** `storage_key` deve ser prefixado por `client_id` de forma obrigatoria e validada na aplicacao, formato recomendado: `{client_id}/{card_id}/{activity_id}/{attachment_id}-{file_name}`. O backend nunca deve aceitar `storage_key` vindo de input do cliente (mesma regra ja aplicada a `client_id` em request); a key e sempre derivada server-side a partir do contexto autenticado + IDs gerados, nunca do nome de arquivo crudo do client. Isso deve ser adicionado ao `docs/data/kanban-sprint-4-data-model.md` e ao `MODULE_CONTRACT.md` do backend antes do código de upload.

Nenhum dos dois pontos acima muda o escopo de produto aprovado pelo PO; sao reforco de contrato tecnico.

## Escopo

Sprint 4: Atribuicao Multipla, Historico Estilo Azure E Anexos.

Projetos afetados:

- `implementations/bff-jboot-platform/modules/kanban`;
- `implementations/app-jboot-next-platform/modules/kanban`.

## Objetivo

Permitir atribuir cards a um ou mais usuarios (N:N) e manter um historico unico por card (comentarios de texto livre + eventos de sistema automaticos), estilo Azure Boards (Discussion + History no mesmo feed), com anexos vinculados a um registro especifico do historico via MinIO.

## Regras De Negocio

- `CardAssignee` (card_id, identity_id): N:N. Qualquer `board_member` ativo atribui ou remove qualquer outro `board_member` ativo do mesmo board, livremente.
- Identidade atribuida deve ser `BoardMember` ativo do mesmo `board_id`/`client_id` do card; backend rejeita atribuicao fora do board com erro estruturado.
- `CardActivity` (card_id, tipo `comment` | `system_event`, autor, payload/texto, `created_at`): feed cronologico unico por card.
- `CardActivity.created_at` e imutavel desde a criacao — base para metricas futuras (lead time/cycle time); calculo/relatorio de metricas fica fora de escopo desta sprint (ver `docs/product/kanban-sprints.md`, secao "Observacao: Dados Para Metricas Futuras").
- Eventos de sistema gerados automaticamente como `CardActivity.system_event`: mudanca de coluna, atribuicao/remocao de `CardAssignee`, arquivamento do card, edicao de titulo/descricao.
- `CardAttachment` (activity_id, nome do arquivo, content_type, tamanho, referencia de storage): vinculado a um registro especifico de `CardActivity` (comentario ou evento), nunca ao card como um todo.
- Upload de anexo via MinIO (bucket dedicado `kanban-card-attachments`).

## Fluxos

- Qualquer `board_member` ativo atribui ou remove qualquer outro `board_member` ativo de um card.
- Toda atribuicao/remocao gera `CardActivity.system_event` automaticamente.
- Usuario escreve comentario de texto livre; comentario entra no feed cronologico do card como `CardActivity.comment`.
- Mudanca de coluna, arquivamento e edicao de titulo/descricao geram `CardActivity.system_event` automaticamente, misturados aos comentarios no mesmo feed.
- Usuario anexa um ou mais arquivos a um registro especifico do historico (comentario ou evento existente).

## Fronteiras Backend/Web

Backend `bff-jboot-platform/modules/kanban`:

- CRUD de `CardAssignee` restrito a `board_member` ativo do board (qualquer um, sem hierarquia adicional).
- Geracao automatica de `CardActivity.system_event` em toda mutacao relevante do card, antes de responder a requisicao que originou o evento.
- Upload de `CardAttachment` so aceito contra `activity_id` existente do mesmo card/board/client.
- Integracao com MinIO: bucket dedicado `kanban-card-attachments`, nunca compartilhado com outro modulo.

Frontend `app-jboot-next-platform/modules/kanban`:

- Aba/secao de historico no card: feed cronologico unificado (comentarios + eventos), composer de comentario com upload de anexo.
- Lista de responsaveis do card com avatar/badge; atribuir/remover livre entre membros ativos do board.
- UI nunca fala com MinIO diretamente — upload/download sempre via client tipado contra o BFF Kanban.

## Criterios De Aceite Funcionais

- Atribuir/desatribuir gera evento no historico com autor e timestamp corretos.
- Comentario e evento de sistema aparecem juntos, em ordem cronologica, no mesmo feed.
- Anexo so pode ser adicionado vinculado a um registro existente do historico.
- Apenas `board_member` ativo do board pode ser atribuido a um card do mesmo board.
- Historico de um card nunca mistura dados de `client_id` diferente.

## Criterios De Aceite Tecnicos

- `CardAssignee`, `CardActivity`, `CardAttachment` modelados como tabelas normalizadas com FK para `card_id`/`board_id`/`client_id`.
- `CardActivity.created_at` imutavel (sem rotina de update que o altere apos criacao).
- Geracao de `system_event` centralizada (nao duplicada em múltiplos pontos do service).
- Upload de anexo validado contra `activity_id` existente antes de gravar referencia de storage.
- Contrato OpenAPI atualizado (`docs/api/kanban-sprint-4-openapi.yaml`) antes da implementacao.
- Variaveis de ambiente de storage documentadas em `MODULE_CONTRACT.md` do backend (`JBOOT_KANBAN_ATTACHMENTS_BUCKET`).

## Plano De Validacao

Backend:

- teste de geracao automatica de `system_event` para cada tipo de mutacao (coluna, atribuicao, arquivamento, edicao);
- teste de ordenacao cronologica do feed (comentario + evento intercalados);
- teste de rejeicao de upload sem `activity_id` valido;
- teste de rejeicao de atribuicao de identidade fora do board;
- teste de isolamento multi-tenant no feed e nos anexos;
- teste de integracao com MinIO (upload/download via bucket dedicado);
- build/typecheck/lint.

Frontend:

- type-check;
- smoke da aba de historico (comentario + evento no mesmo feed, ordem cronologica);
- smoke de upload de anexo vinculado a um registro do feed;
- smoke de atribuir/remover responsavel;
- estados loading/empty/error/success;
- build.

## Agents E Skills

Backend:

- `implementations/bff-jboot-platform/agents/backend-node-typescript.md`;
- `implementations/bff-jboot-platform/agents/platform-auth-context.md`;
- `implementations/bff-jboot-platform/agents/platform-postgres.md`;
- `implementations/bff-jboot-platform/modules/kanban/agents/kanban-board-domain.md`;
- `implementations/bff-jboot-platform/modules/kanban/skills/kanban-board-crud.md`.

Web:

- `implementations/app-jboot-next-platform/agents/frontend-next-typescript.md`;
- `implementations/app-jboot-next-platform/agents/platform-layout.md`;
- `implementations/app-jboot-next-platform/agents/backend-contract-client.md`;
- `implementations/app-jboot-next-platform/modules/kanban/agents/kanban-board-ui.md`;
- `implementations/app-jboot-next-platform/modules/kanban/skills/kanban-board-ui.md`.

## Riscos

- Volume de eventos automaticos poluir o feed e exigir filtro/paginacao desde o inicio.
- Custo de storage de anexos sem limite definido (ver pendencias).
- Realtime do feed (novo comentario/evento via WebSocket) nao estava no escopo do gateway atual (`card.moved` apenas) e precisa ser avaliado — registrado como pendencia tecnica, nao bloqueante para o contrato de dados/API.

## Fora De Escopo

- @mencoes com notificacao.
- Edicao/exclusao de comentario apos um prazo.
- Cards relacionados (bloqueia/e bloqueado por).
- Labels/tags, due date e demais melhorias candidatas futuras.

## Pendencias

- **Resolvida — confirmacao humana (2026-06-19)**: limite de upload aprovado conforme recomendacao tecnica do Architect — 25 MB por arquivo, whitelist de `content_type` (imagens comuns, PDF, office docs, texto/zip), sem limite agregado por card na v1 (monitorar custo de bucket antes de fechar um teto agregado futuramente).
- **Resolvida — confirmacao humana (2026-06-19)**: `storage_key` prefixado por `client_id` (formato `{client_id}/{card_id}/{activity_id}/{attachment_id}-{file_name}`), derivado sempre server-side. Ver secao "Decisao Do Architect", item 5.
- **Resolvida — confirmacao humana (2026-06-19)**: extensao do gateway WebSocket para `card.activity.created` fica para depois desta sprint. Feed funciona via reload/fetch nesta sprint; realtime do feed e melhoria incremental futura.
