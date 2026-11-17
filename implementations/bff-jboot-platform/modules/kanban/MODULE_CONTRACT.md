# Module Contract: bff-jboot-platform/modules/kanban

## Conclusao Da IA E Movimento

- Contrato obrigatorio: `docs/product/flow-ai-completion-sprints.md`.
- Contratos de API/protocolo: `docs/api/flow-ai-completion.md` e
  `docs/runbooks/flow-ai-completion.md`.
- Comentario MCP nao conclui mais a automacao. Gera `ai.automation_completed` so a conclusao sem erro
  pelo resultado esperado da regra (ADR 020): confirmacao estruturada explicita de todas as tarefas
  (`comment`), Analise de Acoes concluida com ao menos uma acao (`action_analysis`) ou peticoes
  encerradas com ao menos uma peticao (`initial_petitions`).
- Movimento e decisao da regra do administrador, nunca ferramenta livre da IA.
- Dev Runtime Profile: mesmos processos e fila; migration `092_kanban_ai_completion_move.sql`;
  recuperacao de movimentos usa o job de recovery existente (a cada minuto).

## Contratos Obrigatorios — Acoes De Card

- `docs/product/flow-offices-sprints.md` (escritorio principal, escritorio ativo, barra superior e sino do monitoramento; escopo confirmado em 2026-11-11).

- `docs/product/flow-card-actions-sprints.md` (escopo confirmado em 2026-10-21).
- `docs/product/process-monitoring-sprints.md` (ADR 021: acompanhamento como capacidade `monitoramento-processual`, sem exigir o Juridico; Sprint 3 liga o Flow; S1-S3 `concluida`; runtime de teste: `make code-up TARGET=kanban-monitoring`, confirmado em 2026-11-08).
- `docs/product/flow-process-import-sprints.md` (importacao de processos por planilha; Sprint 1 pendente, escopo confirmado em 2026-11-06).
- `docs/api/flow-card-actions-openapi.yaml` (catalogo, associacao, execucao).
- Catalogo de acoes em `src/modules/kanban/actions`, com categoria, descricao,
  disponibilidade para board e handler explicito; cliente apenas associa.
- Configurar: `global_master` ou `client_admin` com `flow:admin`. Executar:
  esses administradores ou `flow:actions:execute`, com visibilidade e ACL do card.
- Sem efeitos reais de protocolo/monitoramento neste incremento; handlers
  devolvem somente mensagem de confirmacao, com auditoria sem conteudo do card.
- Dev Runtime Profile: target `code-up:kanban`, mesmos processos/containers;
  migrations aditivas `090_kanban_card_actions.sql` e
  `091_identity_flow_card_actions.sql`. Nenhum novo worker/dependencia/porta.

### Acao Monitorar E Numero Do Processo Da Peticao (Sprint 2, 2026-11-06)

- `docs/product/flow-card-actions-sprints.md` (Sprint 2) e
  `docs/api/flow-initial-petitions-openapi.yaml` (registro do CNJ).
- Peticao aprovada recebe o numero do processo (CNJ) por
  `POST .../initial-petitions/:petitionId/protocol`, reaproveitando
  `protocol_number`/`protocoled_at` (ADR 020, item 21). Quem registra:
  `board_admin` efetivo ou responsavel (assignee) `board_member` do card.
  Digito verificador e tribunal conferidos (`src/modules/shared/documents/cnj.ts`);
  unico por tenant (indice parcial da migration 118 + card DataJud com o mesmo
  numero). Corrigir/desvincular fora desta sprint.
- `monitorar` deixa de ser handler de confirmacao: `interaction: 'dialog'`,
  `perCardAvailability: true`. O endpoint generico responde 400
  `card_action_requires_dialog`; a listagem do board devolve
  `availableCardIds.monitorar` filtrado por `visibleCardScope`.
- `PetitionMonitoringService` (exportado para `domain-integrations`) cria o card
  na coluna padrao do board destino (origem `kanban/flow_petition/<peticao>`,
  escritorio do card de origem, cliente vinculado) e grava
  `monitoring_board_id`/`monitoring_card_id` na peticao (idempotencia entre
  boards). Card de origem so recebe `system_event`.
- `gerar-protocolo` continua handler de confirmacao.
- Dev Runtime Profile: mesmo target `code-up:kanban`; migrations aditivas
  `118_kanban_petition_monitoring.sql` (Flow) e
  `119_juridico_flow_exports_origin.sql` (Juridico). Nenhum novo
  worker/dependencia/porta.

### Importacao De Processos Por Planilha (Sprint 1, 2026-11-06)

- `docs/product/flow-process-import-sprints.md`,
  `docs/api/flow-process-import-openapi.yaml`,
  `docs/security/flow-process-import-checklist.md`.
- `src/modules/kanban/process-import`: validacao pura das linhas, lote
  (`kanban_process_imports`/`kanban_process_import_rows`, migration 120) e
  `ProcessImportCardsService` (exportado para `domain-integrations`): por
  linha, cliente por CPF sem sobrescrever (`createIfCpfAbsent`), card na coluna
  padrao do board destino (origem `kanban/flow_process_import/<cnj>`, escritorio
  do lote), STATUS como primeiro comentario e responsaveis do escritorio que
  enxergam o card (`is_responsible` + `identitiesWhoSeeCard`).
- Quem importa: `board_admin`/`board_member` do board destino, escritorio
  proprio (admin: qualquer ativo).
- Nome, CPF e STATUS da linha viram NULL ao concluir o lote.
- Registro de CNJ em peticao considera tambem os cards importados.
- Dev Runtime Profile: mesmo target `code-up:kanban`; migrations aditivas
  `120_kanban_process_imports.sql` (Flow) e
  `121_juridico_flow_exports_import_origin.sql` (Juridico); fila BullMQ
  `flow-process-import` no Valkey existente, worker in-process. Nenhum novo
  processo/dependencia/porta.

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: modulo NestJS Kanban, persistencia, realtime, sync Drive resiliente e testes versionados; automacao de IA permanece planejada e bloqueada por contratos externos/de efeitos
last_status_review: 2026-10-15
```

Modulo novo dentro da Platform backend. A implementacao runtime deve viver em `src/modules/kanban`. Nome tecnico: `kanban`. Nome de exibicao/login no Identity: `flow` (`application_slug = flow`, `token_audience = app:flow`).

## Responsabilidade

API do modulo Kanban (produto "Flow") para gestao de boards, colunas e cards de tarefas/projetos internos, incluindo sincronizacao realtime via WebSocket entre usuarios conectados ao mesmo board.

## Agents Do Modulo

- `agents/kanban-board-domain.md`

## Skills Do Modulo

- `skills/kanban-board-crud.md`
- `skills/kanban-realtime.md`

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/bff-jboot-platform`.

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/kanban
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
    - implementations/bff-jboot-platform/modules/kanban/agents/kanban-board-domain.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - implementations/bff-jboot-platform/modules/kanban/skills/kanban-board-crud.md
    - implementations/bff-jboot-platform/modules/kanban/skills/kanban-realtime.md
```

## Contratos Obrigatorios

- `implementations/bff-jboot-platform/modules/kanban/MODULE_CONTRACT.md`
- `implementations/bff-jboot-platform/modules/kanban/AI_CONTEXT.md`
- `docs/product/kanban-sprints.md`
- `docs/product/kanban-sprint-1-gate.md`
- `docs/product/kanban-sprint-3-gate.md`
- `docs/product/kanban-sprint-4-gate.md`
- `docs/product/kanban-sprint-7-gate.md`
- `docs/product/kanban-sprint-8-gate.md`
- `docs/product/kanban-sprint-9-gate.md`
- `docs/product/kanban-sprint-10-12-gate.md`
- `docs/product/flow-office-service-contract-sprints.md` (contrato de servicos por escritorio; Sprint 1 concluida; Sprints 2 a 4 replanejadas para o kit em 2026-10-22: S2 valores pela IA e documentos por etapa concluida; S3 modelo .docx e S4 kit .docx gerado sozinho na confirmacao concluidas em 2026-10-29, ADR 019 decisao 19)
- `docs/architecture/decisions/019-flow-office-kit-generated-by-flow.md` (kit gerado pelo Flow a partir dos valores da IA; documentos por etapa; aceita em 2026-10-22)
- `docs/product/flow-card-extra-documents-sprints.md` (documentos avulsos no bloco Documentos do card, com remocao e Drive; D1 concluida em 2026-10-30)
- `docs/product/flow-customer-promobank-sprints.md` (Promobank na ficha, HISCON obrigatorio para avancar; P1 concluida em 2026-11-02)
- `docs/product/flow-signed-kit-sprints.md` (requisitos de entrada da coluna, kit assinado, Validador de assinatura e e-mail do kit; S1 a S4 concluidas em 2026-11-02; S5 validar assinatura como acao da coluna em andamento)
- `docs/product/flow-signature-validator-routine-prompt.md` (prompt do Validador de assinatura; rascunho para revisao do escritorio)
- `docs/product/flow-office-kit-routine-prompt.md` (prompt adaptado da rotina de validacao e extracao do kit; aprovado; vale a partir da Sprint 2)
- `docs/api/flow-office-service-contract-openapi.yaml`
- `docs/api/kanban-sprint-13-openapi.yaml` (Sprint 13: envio duravel das automacoes de e-mail)
- `docs/runbooks/flow-email-automations.md`
- `docs/product/chatgpt-plan-usage-sprints.md`
- `docs/product/kanban-claude-connector-sprints.md` (conector MCP para assinatura Claude; C0-C2 concluidas, C3 e modo rotina da Sprint 12 aguardam smoke com conta real)
- `docs/api/kanban-claude-connector-openapi.yaml`
- `docs/product/flow-customer-documents-sprints.md` (anexos da ficha do cliente, validacao por agente Claude e Drive por CPF/CNPJ; S1-S5 concluidas, smokes externos pendentes)
- `docs/product/flow-action-analysis-sprints.md` (Analise de Acoes: retorno estruturado da rotina, acoes vinculadas ao card e card movido pelo Flow; A1 concluida, smoke com a rotina real pendente) e `docs/api/flow-action-analysis-openapi.yaml`
- `docs/product/flow-initial-petitions-sprints.md` (Peticoes iniciais de consignado JEC/JEF pela rotina, gerador Flow ou IA; S1 a S5, S7 e S8 concluidas, S0 e S6 pendentes) e `docs/architecture/decisions/020-flow-initial-petitions-generator.md`
- `docs/product/flow-realtime-card-updates-sprints.md` (avisos em tempo real `card.updated` e `customer.updated` pelo Socket.IO do Flow; R1 concluida)
- `docs/architecture/decisions/017-flow-customer-documents-validation-drive.md`
- `docs/architecture/decisions/018-flow-validation-by-office-claude-account.md` (validacao pela conta Claude do escritorio; responsavel por escritorio; permissao `flow:validation:approve`; tools do cliente do card para automacoes)
- `docs/api/flow-customer-documents-openapi.yaml`
- `docs/runbooks/flow-claude-connector.md`
- `docs/product/domain-flow-integration-sprints.md`
- `docs/product/domain-flow-integration-sprint-1-gate.md`
- `docs/product/juridico-datajud-flow-sprints.md`
- `docs/data/domain-flow-integration-sprint-1-data-model.md`
- `docs/api/domain-flow-integration-sprint-1-openapi.yaml`
- `docs/data/kanban-sprint-1-data-model.md`
- `docs/data/kanban-sprint-3-data-model.md`
- `docs/data/kanban-sprint-4-data-model.md`
- `docs/api/kanban-sprint-1-openapi.yaml`
- `docs/api/kanban-sprint-3-openapi.yaml`
- `docs/api/kanban-sprint-4-openapi.yaml`
- `docs/product/flow-crm-leads-sprints.md`
- `docs/product/sprint-juridico-flow.md`
- `docs/runbooks/flow-drive-sync.md`
- `docs/architecture/decisions/015-flow-shared-customers-drive-ai-boundaries.md` (aprovada em 2026-10-13)
- `docs/data/flow-juridico-foundation-data-model.md` (proposta)
- `docs/api/flow-juridico-foundation-openapi.yaml` (proposta)
- `docs/architecture/decisions/013-customer-core-auxiliary-tables.md`
- `docs/api/flow-crm-leads-sprint-1-openapi.yaml`
- `docs/api/flow-crm-leads-sprint-2-openapi.yaml`
- `docs/api/flow-crm-leads-sprint-3-openapi.yaml`
- `docs/api/flow-crm-leads-sprint-3-5-openapi.yaml`
- `docs/product/flow-crm-leads-sprint-4-9-gate.md`
- `docs/architecture/decisions/014-flow-lead-analysis-automation.md`
- `docs/api/flow-crm-leads-sprint-4-openapi.yaml`
- `docs/api/flow-crm-leads-sprint-5-openapi.yaml`
- `docs/api/flow-crm-leads-sprint-6-openapi.yaml`

## Banco De Dados

- Estrategia obrigatoria: `dedicated_database`.
- Cada cliente possui um banco fisico proprio para dados do Kanban.
- Todas as tabelas de negocio mantem `client_id` mesmo em banco dedicado, para auditoria/defesa.
- O banco deve ser resolvido somente via `database_ref` emitido pelo Identity.
- Nao inferir banco por parametro de request, subdominio, slug ou payload.

## Regras Multi-Tenant

- Toda query deve filtrar por `client_id` do contexto autenticado.
- Boards e cards de clientes diferentes nunca compartilham o mesmo banco Kanban.
- Operacoes administrativas (criar/editar estrutura do board) devem registrar `client_id`, `identity_id`, `database_ref` e evento auditavel.

## Contratos

- JWT vem do `bff-jboot-identity`.
- Scopes esperados: `flow:read`, `flow:write`, `flow:admin`.
- Roles do modulo: `board_admin`, `board_member`, `board_viewer`, mapeadas a partir dos scopes Identity acima (mesmo padrao de `juridico:read/write/admin`).
- `board_admin` customiza estrutura do board (colunas, campos, workflow, permissoes); `board_member` opera cards; `board_viewer` apenas le.
- A partir da Sprint 3, granularidade fina de movimentacao de card e exclusao definitiva de card arquivado e dada por `MemberProfile` (ver secao "Modelo De Autorizacao Por Perfil (Sprint 3+)"), nao mais inferida do papel fixo. Os papeis `board_admin`/`board_member`/`board_viewer` continuam existindo para porta de entrada grosseira (admin de estrutura vs operacao vs leitura); `board_admin` sempre bypassa `MemberProfile`.

## Modelo De Autorizacao Por Perfil (Sprint 3+)

> Revisao de premissa anterior: a versao original deste contrato definia "Permissao por coluna usa tabela ACL dedicada, nunca array em membro" com a chave de papel fixo (`board_admin`/`board_member`/`board_viewer`). O PO revisou o escopo da Sprint 3 (`docs/product/kanban-sprints.md`) para que a granularidade seja por `MemberProfile` nomeado e configuravel por board, nao por papel fixo. A tabela ACL dedicada (`kanban_board_column_permissions`) e mantida; apenas a chave estrangeira de "papel" passa a ser `profile_id` (`MemberProfile`), nao mais `role`. **Modelo aprovado pelo Architect e implementado em 2026-06-19** (ver `docs/product/kanban-sprint-3-gate.md`, secoes "Decisao Do Architect" e "Decisoes De Implementacao"). Runtime em `src/modules/kanban/profiles/`.
>
> Nota de implementacao registrada pelo Architect: o schema atual (`docker/postgres/init/013_kanban.sql`) restringe `kanban_board_members.role` via CHECK a `('board_admin', 'board_member')` — `board_viewer` ainda nao existe em banco. A migration desta sprint precisa alterar essa CHECK constraint para incluir `board_viewer`, alem de criar as tabelas novas (`kanban_member_profiles`, `kanban_member_profile_transitions`, `kanban_board_column_permissions`).

- `MemberProfile`: nomeado, exclusivo de um board (nao reutilizavel entre boards), com flag `can_delete_archived_cards`.
- `MemberProfileTransition`: por perfil, define quais transicoes `coluna origem -> coluna destino` sao permitidas. Membro sem perfil atribuido nao pode mover card entre colunas.
- `BoardColumnPermission`: ACL por `profile_id` x coluna (capacidades: ver/editar). Substitui qualquer ACL anterior chaveada por papel fixo.
- `BoardMember.profile_id` (nullable): perfil atribuido ao membro dentro do board. Atribuicao e exclusiva de `board_admin`.
- `board_admin` sempre bypassa `MemberProfile` em movimentacao de card e exclusao definitiva de card arquivado, independente de perfil atribuido.
- Exclusao de card arquivado e permitida para: autor do card (`Card.created_by_identity_id`), membro cujo `MemberProfile.can_delete_archived_cards = true`, ou `board_admin`. Demais tentativas retornam erro estruturado `403`.
- **A exclusao e sempre logica** (`status = 'deleted'`), nunca fisica — decisao do usuario em 2026-09-09, registrada em `docs/product/juridico-official-data-pendencias.md` (JUR-003). O Flow e o registro permanente do cliente. Ate a migration `057_kanban_card_soft_delete.sql` esta operacao executava `DELETE FROM kanban_cards`, o que apagava de vez inclusive card de origem juridica exportado do DataJud, contrariando a imutabilidade e permanencia do dado de origem. A permissao nao mudou: quem podia excluir continua podendo; o registro e que deixa de sair do banco. Card `deleted` sai das listagens e de `findById`, e nao bloqueia reimportacao da mesma origem.
- Eventos realtime (WebSocket) devem filtrar por ACL de coluna do perfil do destinatario antes de emitir — nunca emitir payload de coluna que o destinatario nao pode ver.

## Atribuicao, Historico E Anexos (Sprint 4+)

Implementado em 2026-06-19/20. Runtime em `src/modules/kanban/assignees/`, `activities/` e `attachments/`.

- `CardAssignee` (card_id, identity_id): N:N. Qualquer `board_member` ativo atribui/remove qualquer outro `board_member` ativo do mesmo board. `identity_id` atribuido deve ser `BoardMember` ativo do mesmo `board_id`/`client_id`; backend rejeita atribuicao de identidade fora do board com erro estruturado.
- `CardActivity` (card_id, tipo `comment` | `system_event`, autor, payload/texto, `created_at`): feed cronologico unico por card, estilo Azure Boards (Discussion + History). `created_at` e imutavel desde a criacao (base para metricas futuras de lead time/cycle time — calculo fora de escopo, ver `docs/product/kanban-sprints.md`, secao "Observacao: Dados Para Metricas Futuras").
- Geracao automatica de `CardActivity.system_event` nas mutacoes: mudanca de coluna (`card.moved`), atribuicao/remocao de `CardAssignee`, arquivamento (`Card.status = archived`), edicao de titulo/descricao. Toda mutacao relevante do card grava no feed antes de responder a requisicao.
- `CardAttachment` (activity_id, nome do arquivo, content_type, tamanho, referencia de storage): vinculado a um registro especifico de `CardActivity` (comentario ou evento), nunca ao card como um todo. Upload so e permitido contra `activity_id` existente.
- Storage de anexos via MinIO (S3-compatible), reutilizando a infra `jboot-minio` ja definida em `docker-compose.yml` a nivel do servico `jboot` (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). Bucket dedicado do modulo: `kanban-card-attachments` (nao compartilhar bucket com outros modulos). Variavel de ambiente especifica do modulo: `JBOOT_KANBAN_ATTACHMENTS_BUCKET` (default dev: `kanban-card-attachments`).
- **Gap de isolamento multi-tenant identificado pelo Architect**: o bucket `kanban-card-attachments` e compartilhado entre todos os clients do modulo (isolamento `dedicated_database` e por Postgres, nao se estende ao MinIO). `storage_key` deve ser obrigatoriamente prefixado por `client_id` (formato `{client_id}/{card_id}/{activity_id}/{attachment_id}-{file_name}`), gerado sempre server-side a partir do contexto autenticado; nunca aceito como input do client. Ver `docs/data/kanban-sprint-4-data-model.md`, secao "Storage De Anexos", e `docs/product/kanban-sprint-4-gate.md`, secao "Decisao Do Architect".
- Limites de upload confirmados e implementados: 25MB por arquivo (`MAX_ATTACHMENT_SIZE_BYTES` em `attachments.service.ts`, tambem aplicado no multer `FileInterceptor`), whitelist de `content_type` (`ALLOWED_ATTACHMENT_CONTENT_TYPES`), sem limite agregado por card na v1.
- Assinatura do conteudo (Backlog T5, 2026-10-11): `assertAttachmentFileAllowed` (anexos e documentos do checklist) confere os primeiros bytes contra o content-type declarado (`attachments/file-signature.ts`, uma regra por tipo da allowlist, tipo sem regra = rejeitado). Binarios exigem assinatura (PNG, JPEG, GIF87a/89a, RIFF+WEBP, `%PDF-` no inicio, OLE CFB para `application/msword`, entrada local ZIP para docx/xlsx/pptx, entrada local/vazio/dividido para `application/zip`); `text/plain`/`text/csv` rejeitam byte NUL e inicio `<!DOCTYPE html`/`<html`/`<script`/`<svg` (ignorando BOM UTF-8 e espacos). Divergencia = 415 `{ code: 'content_signature_mismatch' }`, sem ecoar o nome do arquivo. Tipo novo na allowlist exige regra nova em `CONTENT_SIGNATURE_RULES` (teste de cobertura reprova sem ela). Verificacao e so de cabecalho: nao inspeciona o conteudo interno do ZIP/OOXML nem substitui antivirus.
- Upload via `@nestjs/platform-express` (`FileInterceptor`, multer `memoryStorage`) + `@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` (`StorageService`) contra o MinIO (`forcePathStyle: true`). Download via URL assinada (expiracao de 300s).
- Realtime do feed (novo `CardActivity`/`CardAttachment` via WebSocket) continua fora de escopo desta sprint, conforme decisao do usuario — o gateway atual so emite `card.moved`. Fica registrado como melhoria incremental futura.

## Notificacoes E Vencimento (Sprint 7+)

Implementado em 2026-06-23. Runtime em `src/modules/kanban/notifications/` e hooks em `assignees/`, `activities/`, `cards/` e `realtime/`.

- `Card.due_date` e opcional. Criacao, atualizacao e limpeza explicita (`null`) devem ser preservadas em updates parciais; nao usar `COALESCE` sozinho para esse campo, pois ele impede distinguir "nao enviado" de "limpar".
- Alteracao de `due_date` gera `CardActivity.system_event` com `event_payload.kind = card.due_date_changed`.
- `GET /kanban/metrics` inclui `overdueCount`, definido como cards ativos com `due_date < CURRENT_DATE` no escopo dos boards acessiveis pelo usuario e filtros aplicados.
- `kanban_notifications` persiste notificacoes in-app por `recipient_identity_id`. Queries sempre filtram por `client_id` e destinatario autenticado.
- Eventos que geram notificacao: atribuicao (`card.assigned`), comentario em card atribuido (`card.commented`) e movimentacao de card atribuido (`card.moved`).
- O proprio autor da acao nunca recebe notificacao.
- WebSocket deve colocar toda conexao autenticada na room `user:{identityId}` no handshake e emitir `notification.created` apenas para essa room. Nao emitir notificacao por room de board.

## Motor De Automacao Por Coluna (Sprint 8+)

- `ColumnAutomationRule` (`kanban_column_automation_rules`): pertence a uma `BoardColumn`, generica por `trigger_type`/`action_type`. Fundacao implementa apenas `trigger_type=column_entered` e `action_type=send_email_notification`.
- CRUD de regra restrito a `board_admin` do board (mesmo guard de `MemberProfile`/`BoardColumnPermission`, `this.access.requireRole(context, boardId, ['board_admin'])`); nao criar nivel de admin novo.
- Disparo e sempre reativo ao hook existente de movimentacao de card (`cards.service.ts::move()`), nunca via endpoint publico de disparo manual.
- Disparo e assincrono via fila BullMQ (`kanban-column-automation`; identificador conceitual `kanban:column-automation` no gate, mas BullMQ proibe ":" em nome de fila) sobre Valkey, worker dentro do processo `platform-api`. Desde a Sprint 13 a intencao nasce no banco (outbox) e a fila so entrega o id; falha ao gravar ou publicar nunca bloqueia nem reverte a movimentacao do card. Ver secao "Envio Duravel Das Automacoes De E-mail (Sprint 13)".
- Idempotencia reativa garantida por `UNIQUE (card_id, board_column_id, automation_rule_id, source_activity_id) WHERE source_activity_id IS NOT NULL` em `kanban_automation_dispatch_log` (indice parcial desde a Sprint 9, ver secao seguinte), onde `source_activity_id` e o `id` (imutavel) do `CardActivity.system_event` que originou o disparo — a garantia e do banco, nao da fila.
- Envio de e-mail via `MailerService` proprio do modulo kanban (nodemailer + SMTP generico via env), **nao** via `src/modules/notifications` (que resolve notificacao in-app/WebSocket, escopo diferente). Se um segundo modulo precisar enviar e-mail no futuro, extrair para `src/modules/shared/mailer` nesse momento, nao antes.
- Retry/backoff: substituido na Sprint 13 por retentativa no banco (a retentativa do BullMQ encontrava a linha `failed` e nao reenviava).

## Gatilhos Adicionais De Automacao (Sprint 9+)

Ver `docs/product/kanban-sprint-9-gate.md` para o contrato completo (PE Decision + Stack Fit Gate).

- Quatro `trigger_type` novos no mesmo motor: `due_date_approaching`, `card_stale`, `column_left`, `juridico_process_moved`. Mesmo `action_type=send_email_notification`; nenhum `action_type` novo.
- `kanban_column_automation_rules.trigger_config jsonb` (separado de `action_config`) guarda a configuracao da condicao de disparo: `{daysBefore:N}` para `due_date_approaching`, `{daysStale:X}` para `card_stale`, `{}` para os demais.
- Idempotencia de gatilhos baseados em tempo (`due_date_approaching`, `card_stale`): `kanban_automation_dispatch_log.source_activity_id` e nullable; coluna irma `dispatch_date date` com `UNIQUE (card_id, board_column_id, automation_rule_id, dispatch_date) WHERE dispatch_date IS NOT NULL` e `CHECK` garantindo que exatamente uma das duas (`source_activity_id`, `dispatch_date`) esteja preenchida por linha. Maximo 1 disparo por `(regra, card, dia)`.
- Scheduler: **BullMQ repeatable job** (no-Redis-lock, dedup nativo do Valkey), nao `@nestjs/schedule` — decisao do Architect, diverge da redacao inicial do PO por motivo tecnico (evita duplicidade se `platform-api` escalar para mais de uma instancia; ver Stack Fit Gate do gate da Sprint 9). Roda na mesma fila `kanban-column-automation`, job name `send-scheduled-email-notification`, consumido pelo mesmo worker in-process. `@nestjs/schedule` nao deve ser adotado para nenhum caso futuro sem repetir esse raciocinio de dedup multi-instancia.
- `column_left`: reativo, mesmo hook de `move()` usado por `column_entered`, mas a regra fica configurada na coluna de origem e reaproveita o mesmo `CardActivity.system_event` `card.moved` como `source_activity_id`.
- `juridico_process_moved`: reativo ao `CardActivity.system_event` `juridico_process_changed` ja gravado por `DomainIntegrationsService.notifyProcessChanged()`; dispara so se o card estiver, no momento do evento, na coluna da regra. Sem monitor jurídico ativo, `notifyProcessChanged()` nunca e chamado — ausencia de fato gerador, nao erro.

## Envio Duravel Das Automacoes De E-mail (Sprint 13)

Decisao humana de 2026-10-17 (`docs/product/kanban-sprints.md`, Sprint 13): BullMQ/Valkey mantidos, sem RabbitMQ; outbox no PostgreSQL. Contrato HTTP em `docs/api/kanban-sprint-13-openapi.yaml`; operacao em `docs/runbooks/flow-email-automations.md`.

- `CardsRepository.move` grava o `system_event` `card.moved` na mesma transacao da troca de coluna. `juridico_process_changed` leva `boardColumnId` (coluna do card no evento).
- `kanban_automation_dispatch_log` e o outbox: `pending|processing|sent|skipped|failed`, `next_attempt_at`. A intencao reativa e derivada do evento + regras de e-mail ativas criadas antes do evento (`DispatchLogRepository.recordForActivity`), com `ON CONFLICT DO NOTHING` nas UNIQUE da Sprint 9. A varredura `recover-email-dispatches` (BullMQ repeatable, 1 min) recria a intencao de evento das ultimas 24 h, republica o vencido e mede o backlog.
- O job `process-email-dispatch` leva so `databaseRef` + id (`attempts: 1`, sem guardar job falho). Regra, card e destinatarios sao lidos no envio; regra inativa ou card removido vira `skipped`.
- Retentativa no banco: 5 tentativas, espera 1/2/4/8 min, depois `failed`. `processing` parado ha 5 min e retomado. Envio por destinatario em `kanban_automation_dispatch_recipients` (retentativa nao reenvia a quem recebeu). `last_error` sem endereco de e-mail, ate 200 caracteres.
- Agendados: `ScheduledAutomationEvaluatorService` grava as linhas do dia (idempotente por `dispatch_date`) e lanca no fim se um tenant falhou; o job diario tem 3 tentativas.
- Jobs legados (`send-email-notification`, `send-scheduled-email-notification`) ainda aceitos pelo worker e convertidos em linha do outbox.
- `GET /kanban/automation-dispatches` e `POST /kanban/automation-dispatches/:id/retry` (`flow:admin`; lista com `visibleCardScope`; reprocessar exige `requireVisibleCard` + `board_admin`; auditoria `kanban_automation_dispatch_retried`).
- Metricas OpenTelemetry `kanban.automation.email.dispatches` (`outcome`), `kanban.automation.email.backlog` (`status`) e `kanban.automation.email.oldest_pending_age`, sem atributo de tenant/card/destinatario.

## Automacao Com Agentes De IA (Sprint 12 Planejada)

- `execute_ai_agent` reutiliza os gatilhos existentes, mas exige outbox
  transacional; o enqueue fire-and-forget das notificacoes nao atende IA paga.
- A regra referencia agente, contrato de input, versao de tool policy e conexao
  designada; nao transporta prompt, token, API key nem conteudo integral na fila.
- O worker materializa snapshot minimo de card, cliente e anexos somente depois
  de revalidar tenant, board, escritorio, agente e policy de dados.
- O resultado e dado nao confiavel. O prompt pode solicitar uma ou mais tools
  do manifest versionado; cada chamada passa por schema estrito, reautorizacao
  de tenant/recurso/transicao e idempotencia antes do handler. Output livre
  nunca cria autoridade ou operacao.
- Em desenvolvimento a conexao e designada pelo operador do projeto; em
  producao cada tenant designa e autoriza sua identidade responsavel.
- ChatGPT Plan e a modalidade primaria obrigatoria; API key e opcional sem
  fallback. Execucao por plano permanece bloqueada ate a OpenAI aprovar o JBoot
  hospedado e autorizar automacoes server-side.
- `actionConfig.connectionMode` aceita tambem `claude_routine` (decisao humana
  de 2026-10-15), com `toolPolicyVersion = 'claude_routine.v1'`: o gateway
  dispara a rotina do Claude Code do dono e a linha do outbox fica
  `dispatched` (`084_kanban_ai_routine_dispatch.sql`: `dispatch_attempt`,
  `external_session_url`). Chave de idempotencia por tentativa
  (`kanban-ai-<id>:routine:<n>`); so falha com `retryAfterSeconds` reagenda,
  ate 5 tentativas. A rotina registra resultados pelo conector e confirma
  conclusao integral por `flow_complete_automation`; somente esta confirmacao
  chama `completeDispatched` para o mesmo dono/card/tenant.

## Cliente Final Do Card (CRM De Leads, Sprint 1+)

Implementado em 2026-10-10. Runtime em `src/modules/kanban/customers/`. Contrato:
`docs/api/flow-crm-leads-sprint-1-openapi.yaml`; estado e pendencias em
`docs/product/flow-crm-leads-sprints.md`.

- Tabela `kanban_card_customers` (banco do Flow, migration
  `061_kanban_card_customers.sql`): `card_id` PK (um titular por card) com FK
  para `kanban_cards`, `client_id`, `customer_id` (sem FK: o cliente vive em
  `jboot_pdv`), `created_by_identity_id`, `created_at` imutavel. Troca = DELETE +
  INSERT na mesma transacao com lock do card. Indice `(client_id, customer_id)`.
- Dependencia de modulo: `KanbanModule` importa `EstablishmentCustomersModule` e
  usa somente `CustomersService` (`findIdsByCpf`, `createIfCpfAbsent`,
  `findById`, `update`, `discardJustCreated`) e `CustomerJuridicoService` (`get`, `save`).
  Vinculo falhando depois de criar cliente novo: compensacao por
  `discardJustCreated` e erro original propagado; falha ao gravar o dado
  juridico depois do vinculo nao desfaz o vinculo. Nenhum SQL do
  kanban toca tabela de cliente.
- Regra de visibilidade (backend, obrigatoria; reescrita na Sprint 3.5): dado do
  cliente so e devolvido a quem ve ao menos um card nao excluido (arquivado
  conta) vinculado ao cliente, no mesmo `client_id` — card visivel pela regra
  unica de "Escritorios E Visibilidade Por Escritorio" (`visibleCardScope` em
  `CardCustomersRepository.filterVisibleCustomerIds`). Busca por CPF: ids pelo
  servico de clientes -> checagem no banco do Flow -> dados so se visivel.
  Respostas `not_found` | `found` | `outside_boards` (sem nenhum dado).
- Cliente existente fora dos quadros do usuario nao pode ser vinculado nem
  duplicado: 409 `customer_outside_boards` (decisao do usuario em 2026-10-09).
- Override do admin do tenant (Sprint 3, decisao de 2026-10-11, contrato
  `docs/api/flow-crm-leads-sprint-3-openapi.yaml`): `PUT .../customer` com
  `override: { reason }` (motivo aparado, 10..500 caracteres; 400 fora disso).
  Exige `flow:admin` em `KanbanRequestContext.scopes` (403 `override_not_allowed`,
  checado antes de resolver o CPF) alem das checagens normais de edicao do card.
  So muda o desfecho `outside_boards`: vincula o PRIMEIRO id por ordem de
  criacao (`findIdsByCpf`: `created_at, id`), nunca cria nem permite escolher id;
  CPF sem cliente com override = 422 `override_requires_existing_customer`;
  cliente visivel ignora o override (vinculo normal). `customer`/`juridico` sao
  ignorados no override. Lookup continua sem dados em `outside_boards`; para
  `flow:admin` traz `canOverride: true`. Evento/auditoria
  `card.customer_linked|changed` com `override: true` e `reason` (unico texto
  livre; nunca logado). Depois do vinculo, a visibilidade segue a regra normal.
- Painel do card: membro ativo do quadro (qualquer papel). Lookup, vinculo, troca
  e edicao: mesma regra das mutacoes de card (`flow:write`,
  `board_admin`/`board_member`, coluna editavel pelo `MemberProfile`).
- `CardActivity.system_event`: `card.customer_linked`, `card.customer_changed`,
  `card.customer_updated`; payload so com `customerId`/`previousCustomerId`/
  `created`/`fields` (e `override`/`reason` no vinculo por override). CPF e dado
  pessoal nunca em log, auditoria ou evento; CPF trafega so no corpo da
  requisicao.

## Leitura De Conteudo Exige Membresia Ativa (Correcao De Seguranca 2026-10-10)

> Sprint 3.5: com a visibilidade por escritorio LIGADA no tenant, `flow:admin`
> le e opera como `board_admin` efetivo sem ser membro, e conteudo de CARD exige
> tambem o card visivel (escritorio). Com a chave desligada esta secao vale como
> esta. Ver "Escritorios E Visibilidade Por Escritorio".

Aplica a decisao de 2026-10-09 (isolamento entre bases remotas por quadro;
`docs/product/flow-crm-leads-sprints.md`). `BoardAccessService.requireBoard` so
garante que o quadro existe no tenant e NUNCA autoriza leitura. Toda leitura de
conteudo do quadro usa `BoardAccessService.requireMember` (membresia ativa em
qualquer papel, inclusive `board_viewer`; 403 `board_membership_required`; outro
tenant 404): cards, colunas, activities, lista e download de anexos, checklist
de documentos, tags do quadro e do card, status, responsaveis e membros. Rota
nova de leitura de conteudo deve usar `requireMember` (ou checagem mais
restrita). `GET /kanban/boards` e `GET /kanban/boards/:id` continuam abertos ao
tenant (pendencia de produto). WebSocket: `board.join` usa `requireMember`
(mesma regra da leitura HTTP; `board_viewer` ativo entra so para receber
eventos, Backlog T6 de 2026-10-11); mutacao via socket (`card.move`) passa por
`CardsService`, que exige `board_admin`/`board_member`; `broadcastCardMoved`
revalida membresia ativa e ACL `can_view` do perfil por socket a cada evento
(admin ve tudo; member/viewer seguem o perfil; sem perfil/sem linha de ACL =
visivel), igual a `ColumnsService.list`. Teste: `realtime/kanban.gateway.spec.ts`.

## Escritorios E Visibilidade Por Escritorio (CRM De Leads, Sprint 3.5)

Implementado em 2026-10-12. Substitui a regra "isolamento entre bases remotas so
por quadro" (decisao de 2026-10-09) pela decisao do usuario de 2026-10-11 e pelas
confirmacoes P22-P30 de 2026-10-12. Desenho: ADR 014, Decisoes 6 e 7
(`docs/architecture/decisions/014-flow-lead-analysis-automation.md`) e "Architect
Decision" de `docs/product/flow-crm-leads-sprint-4-9-gate.md`. Contrato HTTP:
`docs/api/flow-crm-leads-sprint-3-5-openapi.yaml`. Runtime em
`src/modules/kanban/offices/` e `src/modules/kanban/shared/`.

- Dados (migration `063_kanban_offices.sql`, aditiva, sem backfill):
  `kanban_offices` (nome unico entre ativos; inativar, nunca apagar),
  `kanban_user_offices` (N:N, PK `client_id + identity_id + office_id`),
  `kanban_cards.office_id` (nulo ate o admin atribuir; FK composta
  `(client_id, office_id)`), `kanban_settings.office_visibility_enabled`
  (default false).
- Chave por tenant DESLIGADA: comportamento anterior sem nenhuma mudanca (so
  membresia; sem "admin ve tudo"; card novo sem escritorio; `officeId` enviado e
  ignorado). Prova: suites anteriores passam sem mudanca de expectativa.
- Card visivel (chave LIGADA): `flow:admin` ve qualquer card do tenant sem ser
  membro; demais usuarios (inclusive `board_admin` sem `flow:admin`, P25) so com
  membresia ativa no quadro E escritorio do card entre os seus escritorios atuais.
  Card sem escritorio so o admin ve. Escritorio inativo nao tira visibilidade.
- Ponto UNICO (`CardVisibilityService` + regra pura em `shared/card-visibility.ts`):
  `requireVisibleCard` em toda rota com `:cardId` (invisivel = 404 `Card not
  found`, igual a inexistente); `visibleCardScope` como unico filtro SQL de
  conjuntos (lista do quadro, resumos, tags, completude, metricas, busca de
  cliente por CPF); `canSeeCard`/`identitiesWhoSeeCard` no realtime (por socket e
  por evento), notificacao in-app e e-mail da automacao (por destinatario no
  envio; de outro escritorio e ignorado sem erro) e candidatos/validacao de
  responsavel. `resolveViewer` memoizado por objeto de contexto (o socket usa uma
  copia por evento). `BoardAccessService.resolveEffectiveRole`: `flow:admin` =
  `board_admin` efetivo com a chave ligada (`requireRole`, `requireMember`,
  capacidades, `board.join`, `GET /kanban/boards[/:id]`).
- Garantia: `shared/card-visibility-matrix.spec.ts` (banco real; 23 leituras e
  mutacoes de card x 10 perfis x chave ligada/desligada; lista, metricas, CPF,
  vinculo entre escritorios, responsaveis) e `shared/card-visibility.static.spec.ts`
  (SQL sobre `kanban_cards` e tabelas filhas fora do escopo unico so com entrada
  comentada na allowlist; entrada obsoleta reprova). Rota/consulta nova de card
  deve usar o ponto unico ou entrar na allowlist com motivo.
- Criacao de card (tela, coluna e importacao de dominio): `CardOfficePolicy`.
  1 escritorio ativo = automatico; N = `officeId` obrigatorio (422
  `office_required`); sem escritorio ativo = 403 `user_without_office`; admin =
  `officeId` obrigatorio, qualquer escritorio ativo (422 `office_not_allowed`).
- Responsavel: membro ativo do quadro que ve o card (422
  `identity_not_in_card_office`); `GET .../assignees/candidates` lista so esses.
- Cliente entre escritorios (P30): vincular cliente que ja tem card so em outro
  escritorio exige `flow:admin` (409 `cross_office_link_requires_admin`) com
  `override.reason` (409 `cross_office_override_required`); evento/auditoria com
  `override: true`, `reason`, `crossOffice: true`. Lookup devolve `found` com
  `crossOffice` (e `canOverride` para o admin).
- Administracao (somente `flow:admin`, scope no controller e checagem no
  servico): CRUD de escritorios, vinculo usuario -> escritorios (`PUT
  /kanban/office-users/:identityId/offices`; vinculo novo so com escritorio ativo;
  ao sair de um escritorio o usuario deixa os responsaveis dos cards dele com
  `system_event` `card.assignee_removed` e o admin recebe a lista, P28),
  pre-visualizacao e ativacao (`/kanban/office-settings`; ligar exige escritorio
  ativo, 422 `no_active_office`; desligar e rollback sem perda), atribuicao em
  lote por quadro (`card.office_assigned` por card) e transferencia com motivo
  (`card.office_changed`, P23). Contexto do usuario: `GET
  /kanban/offices/context` (todo usuario do Flow).
- `FlowAdminDirectory` (Decisao 7): ponto unico de leitura SOMENTE LEITURA de
  `jboot_identity.entitlements`/`identities` (aplicacao `flow`, entitlement e
  identidade ativos, `flow:admin` em `scopes`), cache de 60 s por tenant; usado
  fora da requisicao (destinatario) e na lista de usuarios do Flow. Na
  requisicao, a autoridade e o scope do JWT.
- Auditoria (`kanban_audit_events`) e eventos sem dado pessoal: ids, nome do
  escritorio e o motivo digitado pelo admin.
- Row Level Security do Postgres segue rejeitado nesta fase (ADR 014).

## Envio Do Lead E Fila Do Gestor (CRM De Leads, Sprint 4)

Implementado em 2026-10-12. Desenho: ADR 014, Decisao 3 (estado em campo
proprio; gatilho = ato de envio) e "Architect Decision" de
`docs/product/flow-crm-leads-sprint-4-9-gate.md`. Contrato HTTP:
`docs/api/flow-crm-leads-sprint-4-openapi.yaml`. Runtime em
`src/modules/kanban/leads/`.

- Dados (migration `064_kanban_lead_intake.sql`, aditiva e idempotente):
  `kanban_boards.lead_intake_enabled` (default false; PE1),
  `kanban_lead_required_fields` + `kanban_settings.lead_required_fields_configured_at`
  (P16; nulo = default), `kanban_lead_submissions` (um ciclo por envio: autor,
  data, escritorio do card no envio, snapshot do cadastro e dos documentos
  usados, devolucao com autor/data/motivo) e `kanban_card_leads` (estado do
  lead; sem linha = `rascunho`).
- Estado do lead em CAMPO PROPRIO (`lead-state.ts`), nunca derivado da coluna;
  mover card ou automacao de coluna nao muda o estado. Transicoes da S4:
  `submit` (rascunho|devolvido -> enviado) e `return`
  (enviado|aguardando_revisao|falha_processamento -> devolvido). PE14
  (`enviado -> aguardando_revisao` ao gerar o primeiro rascunho) esta na tabela
  para a S6, sem caller na S4. Transicao em transacao com lock do card.
- Envio (R1, P13, P16): `flow:write`, `board_admin`/`board_member`, card
  visivel, coluna editavel, captacao ligada no quadro (422
  `lead_intake_disabled`), cliente vinculado, campos obrigatorios do tenant
  preenchidos e todo documento obrigatorio ativo com envio mais recente
  `enviado` ou `aceito` (aceite nao exigido). Incompleto = 422 `lead_incomplete`
  com `customerLinked`, `missingFields` e `pendingDocumentTypes`; nada muda.
  Lead ja enviado = 409 `lead_not_submittable`.
- Congelamento (P21, PE10; `LeadEditLock`): fora de `rascunho`/`devolvido`,
  409 `lead_frozen` para QUALQUER usuario em PATCH card, DELETE card, PUT/PATCH
  customer do card e POST documento. Nao congela: revisao de documento, mover,
  comentario/anexo do historico, tags, status, responsaveis e transferencia de
  escritorio pelo admin. Mutacao nova que altere dado enviado deve chamar
  `LeadEditLock.assertEditable` depois de `requireVisibleCard`.
- Cadastro compartilhado: o snapshot do envio fica no banco do tenant;
  `GET .../lead` devolve so `customerSnapshot.outdated` e os NOMES dos campos
  alterados por outro caminho (sha256 do cadastro achatado).
- Devolucao: somente `flow:admin` (scope no controller + servico, 403
  `lead_admin_required`), motivo 10..500 apos trim, card visivel; notifica
  criador, responsaveis e quem enviou que ainda veem o card.
- Fila do gestor `GET /kanban/leads`: somente `flow:admin`; `visibleCardScope`
  (chave de escritorio desligada = so quadros em que o admin e membro);
  filtros por escritorio ATUAL do card, quadro, estado e data do envio;
  paginada (limit <= 100).
- `leadStatus` no `GET .../cards` (uma consulta por quadro, `visibleCardScope`).
- Notificacao in-app: `card.lead_submitted` aos administradores do
  `FlowAdminDirectory` (filtrados por `identitiesWhoSeeCard`) e
  `card.lead_returned`; payload so ids e o motivo. `system_event`
  `card.lead_submitted` (`submissionId`) e `card.lead_returned`
  (`submissionId`, `reason`); auditoria `kanban_lead_submitted|returned`,
  `kanban_lead_required_fields_updated`.
- Ponto de acoplamento da S7: a transacao de `LeadsRepository.submit` e onde a
  execucao da analise (outbox `kanban_lead_analysis_runs`, ADR 014) sera criada.
  A S4 nao tem fila, outbox nem IA.
- Testes: `leads/*.spec.ts` (banco real + ROLLBACK), matriz
  `shared/card-visibility-matrix.spec.ts` (GET lead e envio como operacoes de
  card; devolucao por perfil) e teste estatico com `kanban_card_leads` e
  `kanban_lead_submissions` entre as tabelas de card.

## Tipos De Caso E Modelos De Documento (CRM De Leads, Sprint 5)

Implementado em 2026-10-12. Desenho: ADR 014, Decisoes 1 (geracao `.docx`) e 4
(armazenamento). Contrato HTTP: `docs/api/flow-crm-leads-sprint-5-openapi.yaml`.
Runtime em `src/modules/kanban/case-types/` e `src/modules/kanban/document-templates/`.
Configuracao do tenant, nao conteudo de card: nao passa pelo `CardVisibilityService`.

- Autorizacao: toda rota exige `flow:admin` (`@RequireScopes` + `requireFlowAdmin`
  no servico, 403 `template_admin_required`); operador de escritorio e
  `board_admin` sem `flow:admin` recebem 403.
- Dados (migration `065_kanban_case_types_templates.sql`, aditiva e idempotente):
  `kanban_case_types` (nome unico entre ativos, descricao, criterios de
  classificacao, evidencias esperadas, `default_template_id`, ativo; sem
  exclusao), `kanban_case_type_templates` (N:N; o padrao precisa estar entre os
  vinculados por FK composta adiavel), `kanban_document_templates` (nome unico
  entre ativos, `current_version_id` = ultima versao enviada; sem exclusao),
  `kanban_document_template_versions` (IMUTAVEL por trigger: `sha256`, versao do
  catalogo, `validation_status` `valid|invalid_variables`, relatorio sem dado de
  cliente) e `kanban_template_version_variables` (chave/tipo imutaveis por
  trigger; so `required` muda, default obrigatoria).
- Dependencia nova (runtime): `docxtemplater` 3.71.0 (MIT, somente o core; sem
  modulos PRO) e `pizzip` 3.3.0 (`MIT OR GPL-3.0`, usado sob MIT), versoes
  exatas no `package.json`. Transitivas: `@xmldom/xmldom` 0.9.12 (MIT), `pako`
  2.2.0 (MIT AND Zlib). Proibido `angular-expressions` ou qualquer parser de
  expressao: o parser e `catalogParser` (caminho com pontos, so propriedade
  propria).
- Sintaxe unica: `{{namespace.campo}}`, laco `{{#lead.casos}}...{{/lead.casos}}`
  so sobre colecao do catalogo, condicional `{{#x}}`/`{{^x}}` so sobre booleano;
  sem filtros; `{{@...}}` recusado. Catalogo versionado em codigo
  (`template-variable-catalog.ts`, `TEMPLATE_CATALOG_VERSION`), com a formatacao
  (CPF/CEP/telefone com mascara, datas `dd/mm/aaaa` e por extenso). Mudar,
  remover ou acrescentar variavel exige incrementar a versao.
- Upload (falha fechada): `assertTemplateFileAllowed` (regras dos anexos +
  `.docx` + 10 MB) -> `TemplateValidationRunner` (worker thread, timeout 20 s,
  heap 512 MB, 2 por processo) executa `validateDocxTemplate`: limites anti
  zip-bomb no diretorio central ANTES de descompactar (`TEMPLATE_LIMITS`: 10 MB,
  50 MB, 2.000 entradas, 100:1), descompactacao propria limitada ao tamanho
  declarado com CRC, pacote Word sem macro/OLE/ActiveX/vinculo externo (exceto
  hyperlink), compilacao, `inspect-module`, catalogo, aviso de tag quase certa,
  render de prova sintetico -> objeto -> versao + variaveis em transacao (falha
  remove o objeto). Variavel desconhecida = versao `invalid_variables`.
- Storage: mesmo bucket do modulo (`kanban-card-attachments`), prefixo
  `{client_id}/templates/{template_id}/{version_id}.docx` (CHECK no banco; sem
  nome de arquivo na chave; nome original so em `file_name`). Objeto nunca
  sobrescrito. Download por URL assinada com nome `<modelo> - v<n>.docx`.
- Geracao (S6): `DocumentTemplatesService.resolveForGeneration(context,
  caseTypeId, templateId?)` -> `generation-template.ts`: tipo ativo, modelo
  padrao (ou vinculado escolhido), modelo ativo, versao ATUAL `valid`; sem
  fallback para versao anterior. A S6 le o objeto por `storageKey`, confere o
  `sha256` antes de renderizar com `buildTemplateData` do catalogo e grava
  `template_version_id` + `sha256` no documento gerado.
- Auditoria (sem dado pessoal, sem nome de arquivo): `kanban_case_type_created|updated`,
  `kanban_document_template_created|updated`,
  `kanban_document_template_version_uploaded` (ids, versao, status, sha256) e
  `kanban_template_variables_updated`. Recusa de upload so em log (`code`, ids).
- Testes: `document-templates/*.spec.ts` (validador: zip bomb, `{{@raw}}`,
  desconhecida, `.docm`/macro, OLE, imagem externa, DDE, render de prova;
  repositorio em banco real com ROLLBACK: versionamento, imutabilidade por
  trigger, FK do padrao, resolucao da geracao; servico: permissao, upload,
  compensacao; runner em worker com timeout).

## Analise Do Lead, Documento Gerado E PDF (CRM De Leads, Sprint 6)

Implementado em 2026-10-12 (estado da sprint no artefato: `em andamento` ate o
aceite com modelo real do cliente, P2). Desenho: ADR 014, Decisoes 1, 2 e 4.
Contrato HTTP: `docs/api/flow-crm-leads-sprint-6-openapi.yaml`. Runtime em
`src/modules/kanban/lead-analysis/` e `src/modules/kanban/pdf/`.

- Autorizacao: `.../cards/:cardId/analysis/*` exige `flow:admin`
  (`@RequireScopes` + `requireAdmin` no servico, 403 `lead_admin_required`) e
  card visivel (`requireVisibleCard`; chave de escritorio desligada = admin
  precisa ser membro, como a devolucao da S4). `.../cards/:cardId/lead/documents*`
  (documentos ENTREGUES, P11): qualquer leitor do card visivel; so documento
  `aprovado` de caso ativo do ciclo atual (o resto = 404). Matriz de
  visibilidade com as 2 rotas de leitura e as 9 de gestao.
- Dados (migration `066_kanban_lead_analysis_documents.sql`, aditiva e
  idempotente): `kanban_lead_cases` (caso por ciclo de envio, N por lead; troca e
  remocao com `superseded_*` + motivo, troca aponta `replaces_case_id`; `source`
  reserva `ai` para a S8) e `kanban_card_generated_documents` (versao por caso;
  origem `generated|uploaded_edit`; FK para a versao do modelo + `template_sha256`
  + `catalog_version`; `filled_variables` com valor, origem e marca obrigatoria;
  estado `rascunho|aprovado|substituido`; colunas do PDF `pdf_status
  pending|done|failed`, tentativas, erro, lease, chave e `sha256`). Trigger
  `kanban_generated_documents_guard_trg`: documento nunca e apagado; arquivo,
  origem, modelo e valores sao imutaveis. CHECKs: chave do objeto, aprovador e
  data juntos, rascunho sem PDF, `done` com chave e `sha256`.
- Estado do lead (regra unica `lead-analysis/lead-analysis-state.ts`, na mesma
  transacao com o card travado): primeiro documento do ciclo `enviado ->
  aguardando_revisao` (PE14); todo caso ativo com documento aprovado ->
  `aprovado`; caso acrescentado/trocado/removido sem aprovado -> volta a
  `aguardando_revisao`. Analise so com lead `enviado|aguardando_revisao|aprovado`.
- Geracao: `resolveForGeneration` (S5) -> leitura do objeto e conferencia do
  `sha256` (409 `template_integrity_mismatch`) -> dados: `cliente.*` do SNAPSHOT do
  envio atual, `escritorio.nome` atual do card, casos ativos, data -> obrigatoria
  sem valor = 422 com a lista (nada gravado) -> render no `TemplateValidationRunner`
  (worker thread, mesmo teto de tempo/heap; tarefa `render`) -> objeto
  `{client_id}/{card_id}/generated/{id}.docx` -> linha + evento + transicao (falha
  remove o objeto).
- Versao editada: `assertEditedDocumentFileAllowed` (regras dos anexos + `.docx` +
  10 MB) + `inspectEdited` no worker (limites anti zip-bomb, macro, OLE/ActiveX,
  vinculo externo; sem exigir variaveis; marcador restante = aviso). Nasce
  `aprovado` com PDF novo e substitui rascunho/aprovado do caso.
- PDF (outbox): aprovar/substituir grava `pdf_status = 'pending'` na mesma
  transacao; enqueue em `kanban-document-pdf` (jobId `pdf-<id>`, 3 tentativas com
  backoff) + varredura a cada 2 min (`listActiveFlowTenants`). Worker in-process,
  concorrencia 1: claim com lease no banco, reaproveita `{id}.pdf` ja gravado
  (sem segundo arquivo), confere o `sha256` do `.docx`, chama o Gotenberg
  (`PdfConverterClient`: `fetch` nativo, basic auth, multipart com nome
  `document.docx`, timeout 60 s, `%PDF-` conferido). Falha nunca desfaz a
  aprovacao: `failed` + "Gerar PDF novamente" (`pdf/retry`).
- Eventos (`system_event`, so ids/versao/estado/motivo):
  `card.lead_case_classified|changed|removed`, `card.lead_document_generated|replaced`
  (estes 5 so aparecem no historico para `flow:admin`, P11),
  `card.lead_document_approved`, `card.lead_analysis_status_changed`.
  Notificacao `kanban.card.lead_document_approved` ao criador, responsaveis e
  quem enviou, filtrada por quem ve o card. Auditoria
  `kanban_lead_case_*`, `kanban_lead_document_generated|approved|replaced|pdf_retry`.
- Testes: `lead-analysis/*.spec.ts` (fluxo completo em banco real, R5, permissao,
  versao editada, N casos, estados, PDF retry, historico P11),
  `pdf/document-pdf.service.spec.ts` (claim, retentativa, falha permanente,
  idempotencia, varredura), `pdf/pdf-converter.client.spec.ts` (fetch falso),
  `pdf/gotenberg.integration.spec.ts` (Gotenberg REAL; pula com instrucao se o
  container nao estiver de pe), `document-templates/docx-render.spec.ts`.

## Checklist De Documentos (CRM De Leads, Sprint 2+)

Implementado em 2026-10-10. Runtime em `src/modules/kanban/documents/`. Contrato:
`docs/api/flow-crm-leads-sprint-2-openapi.yaml`; estado, premissas e pendencias em
`docs/product/flow-crm-leads-sprints.md`.

- Migration `062_kanban_card_documents.sql`: `kanban_board_document_types`
  (por quadro; nome unico entre os ativos; desativar, nunca apagar),
  `kanban_card_documents` (uma linha por envio; estado do item = envio mais
  recente; `attachment_id` UNIQUE para `kanban_card_attachments`),
  `kanban_member_profiles.can_review_documents` e
  `kanban_board_columns.requires_complete_checklist` (default false).
- Configuracao (tipos, lista inicial idempotente): `flow:admin` + `board_admin`.
- Envio: mesma regra das mutacoes de card; mesma validacao de arquivo dos anexos
  (`assertAttachmentFileAllowed`, nao duplicar limites); activity
  `card.document_uploaded` + `CardAttachment` + documento numa transacao;
  objeto sobe antes e e removido (`StorageService.deleteQuietly`) se a transacao
  falhar. O mesmo tratamento passou a valer para `AttachmentsService.upload`.
- Revisao: so `board_admin` ou `board_member` com perfil `can_review_documents`
  (`BoardAccessService.requireCanReviewDocuments`); so sobre o envio mais recente
  ainda `enviado`; `system_event` `card.document_accepted|rejected` na mesma
  transacao; rejeicao notifica responsaveis e criador (kind
  `card.document_rejected`), nunca o revisor.
- Payload de evento/auditoria/notificacao so com ids, nome do tipo e motivo de
  rejeicao; nome de arquivo nunca em evento ou log.
- Completude no `GET .../cards` (`documentChecklist`) por uma consulta agregada
  por quadro; nunca por card.
- `ChecklistGateService.assertCanEnterColumn` e obrigatorio em todo caminho
  MANUAL que coloca card numa coluna (hoje: `CardsService.create` e `move`
  quando muda de coluna). Caminho manual novo que mude `board_column_id` ou
  insira card deve chamar o gate. Erro: 422 `checklist_incomplete` com
  `pendingDocumentTypes [{id, name}]`. Sem efeito retroativo; vale para
  qualquer papel.
- Excecao (Sprint 3, decisao de 2026-10-11): `createInDefaultColumnFromSource`
  (importacao de dominio, ex. DataJud) NAO chama o gate; o card entra na coluna
  padrao mesmo com `requires_complete_checklist`.
- Sinalizacao `checklistPending` (Sprint 3, `documents/checklist-pending.ts`):
  card em coluna ATIVA com `requires_complete_checklist` e obrigatorio ativo
  cujo envio mais recente nao esta `aceito`. Exposta em `GET .../cards`
  (`completenessForBoard` + `ColumnsRepository.list`: duas consultas por quadro,
  sem N+1) e em `GET .../cards/:cardId/documents` (modal). Cobre importacao e o
  caso nao retroativo (rejeicao depois da entrada). Coluna sem a flag ou quadro
  sem obrigatorio ativo nunca sinaliza.

## Documentos Da Ficha Do Cliente (S1, ADR 017)

Plano: `docs/product/flow-customer-documents-sprints.md`. Runtime em
`src/modules/kanban/customer-documents/`; contrato em
`docs/api/flow-customer-documents-openapi.yaml`.

- Catalogo fixo: `identidade` (RG ou CNH), `cpf`, `comprovante_residencia`,
  `declaracao_residencia_terceiro` (exigida so com comprovante de terceiro) e
  `extrato_beneficio` (HISCON; conserva os arquivos anteriores) e `hiscred`
  (HISCRED). Uploads opcionais para salvar;
  `complete` so com todos os exigidos (condicao da validacao, S2).
- `kanban_customer_documents` e `kanban_customer_document_profiles`
  (`085_kanban_customer_documents.sql`): versao imutavel por envio, corrente
  unica por tipo (indice parcial), lock consultivo serializa envios do mesmo
  tipo; remocao logica preserva o historico. So o ID do cliente, sem FK cruzada.
- Revisao do catalogo em 2026-10-21: migration idempotente
  `095_kanban_customer_hiscred.sql`, no mesmo banco/target `code-up:kanban`,
  sem novos processos, portas ou dependencias. Cinco documentos exigidos para
  validar (seis com declaracao de terceiro); validacoes antigas ficam no historico.
- Visibilidade igual a da ficha (`FlowCustomersService.requireVisibleCustomer`):
  cliente invisivel = 404. Escrita com `flow:customers:write`/`flow:admin`.
- Arquivo: validacao unica do Flow (tamanho, allowlist, assinatura) restrita a
  PDF/PNG/JPEG/WebP; chave MinIO `{client}/customers/{customer}/documents/{id}`
  sem nome de arquivo; download por URL assinada de 5 min.
- Auditoria sem dado pessoal: `kanban_flow_customer_document_uploaded|removed`
  e `kanban_flow_customer_document_profile_updated` (cliente, tipo, versao).
- CPF obrigatorio na criacao do cliente; edicao sem o campo mantem o atual e
  `null` e recusado (ADR 017).

## Contrato De Servicos Do Escritorio (Modelo Do Kit, Sprints 1 E 3)

- Um modelo por escritorio, versoes imutaveis em `kanban_office_service_contract_versions` (migrations
  `089` e `107_kanban_office_service_contract_docx.sql`). Somente `flow:admin`; escritorio de outro
  tenant responde 404. Contrato HTTP: `docs/api/flow-office-service-contract-openapi.yaml`.
- Desde a Sprint 3 (ADR 019, decisao 14) o modelo e o `.docx` do escritorio:
  `POST /kanban/offices/{officeId}/service-contract/versions` (multipart, ate 10 MB). Versoes HTML do
  editor Quill (Sprint 1) ficam so como historico (`format = 'html'`); o `PUT` do HTML saiu.
- Analise do arquivo na worker thread dos `.docx` (`TemplateValidationRunner.analyzeOfficeKit`,
  `offices/service-contract/office-kit-docx.ts`), com falha fechada: limites anti zip-bomb e recusa de
  macro, OLE/ActiveX e vinculo externo (`docx-package`); ao menos uma tag; blocos `[[SE_X]]`/`[[FIM_SE_X]]`
  abertos e fechados, sem aninhamento; tags `_1` de contrato dentro de linha de tabela (linha-molde).
  Tags lidas por paragrafo com os runs juntados (formatacao no meio nao quebra a tag).
- Avisos (nao bloqueiam): tag mal escrita, linhas `_2+` no modelo, sem linha-molde, bloco diferente de
  JEC/JEF, termo de renuncia sem os dois blocos. Marcas de genero (`(a)`) e plural (`(s)`, `(es)`,
  `(oes)`) coladas na palavra sao separadas em reconhecidas e nao reconhecidas; a nao reconhecida fica
  com o texto original na geracao (decisao 19, Q3).
- Arquivo no storage em `{client_id}/offices/{office_id}/service-contract/{version_id}.docx`; o mesmo
  arquivo (sha256) nao cria versao e o objeto repetido e removido. Download por URL assinada (5 min)
  so de versao `.docx`. `tags` da versao continua alimentando o pedido da validacao (Sprint 2).
- Auditoria `kanban_office_service_contract_saved` sem conteudo: escritorio, versao, formato,
  quantidade de tags e de marcas nao reconhecidas, sha256.
- Kit do cliente (Sprint 4; ADR 019, decisao 19): `OfficeKitGenerationService` gera o kit sozinho depois da
  confirmacao da validacao e do card de entrada, fora da transacao (falha nao desfaz a confirmacao). So
  parecer aprovado e modelo `.docx` da versao enviada no pedido; valores revisados, senao os da IA. Montagem
  em `office-kit-render.ts` (worker thread): linha-molde por contrato, bloco JEC/JEF escolhido, tag sem valor
  fica `[[TAG]]`, genero pelo `gender`, plural de contrato(s)/emprestimo(s)/parcela(s)/desconto(s) (e do
  artigo logo antes) pela quantidade de contratos e o resto pela de instituicoes, marca nao resolvida fica
  como no modelo, `DATA_POR_EXTENSO` (fuso de Brasilia) e `LISTA_BANCOS` calculados. Modelo validado do
  escritorio entra como esta (decisao 20): linhas fixas `_2+` saem e a numeracao acompanha os contratos,
  renuncia sem blocos troca o trecho para o JEF, a secao "DECLARACAO DE RESIDENCIA" sai (e fica fora das tags
  da analise) e valor preenchido perde o destaque amarelo.
- Kit gravado em `kanban_customer_office_kits` (migration `108`) e no storage em
  `{client_id}/customers/{customer_id}/kits/{kit_id}.docx` (nao aparece na ficha); resultado em `kit_result`/`kit_id` do run. Fila do Drive com origem `office_kit`: pasta do escritorio
  do modelo e do CPF, `KIT_<NOME>_<AAAA-MM-DD>.docx`; Drive desligado envia na reconciliacao. Auditoria
  `kanban_customer_office_kit_generated|not_generated` sem valor do kit. Revisao dos valores depois da
  confirmacao e recusada (`customer_validation_kit_already_generated`).
- Kit no card (ADR 019, decisao 19 revisada em 2026-10-30; `CardOfficeKitController`/`CardOfficeKitService`):
  `GET kanban/boards/:boardId/cards/:cardId/office-kit` devolve o kit mais recente do cliente vinculado ao
  card (`{ kit: { id, fileName, sizeBytes, createdAt } | null }`, sem chave de storage) e
  `GET .../office-kit/:kitId/download` devolve URL assinada `{ url, expiresAt }` so para kit do mesmo cliente
  e tenant. Mesma visibilidade do card (`requireVisibleCard`), sem scope extra; vale com ou sem Drive.
  Auditoria `kanban_customer_office_kit_downloaded` com card, cliente e kit, sem conteudo.
- Documentos avulsos do card (`docs/product/flow-card-extra-documents-sprints.md`, D1; migration `112`):
  `kanban_card_extra_documents` (anexo do card, descricao opcional ate 200, sha256, remocao logica
  `removed_at`/`removed_by_identity_id`). `GET|POST kanban/boards/:boardId/cards/:cardId/extra-documents`
  (multipart `file` + `description`) e `DELETE .../extra-documents/:documentId` (204), escrita com
  `flow:write`. Envio com as regras do checklist (papel `board_admin`/`board_member`, coluna editavel, lead
  nao congelado, `assertAttachmentFileAllowed`); remove quem enviou ou quem revisa documentos
  (`canReviewDocuments`), com as mesmas regras de envio; `canUpload` e `canRemove` vem do backend. Eventos
  `card.extra_document_added|removed` no historico e auditoria `kanban_card_extra_document_added|removed`
  sem conteudo. Download pelo anexo (`attachments/:attachmentId/download`).
- Drive dos avulsos: `source_type = card_extra_document` (pasta do cliente do card; sem cliente com CPF,
  caminho legado do card), nome `<arquivo> (<8 primeiros do id>).<ext>`; reconciliacao sobe so os que
  continuam no card. Remocao: `remove_requested_at`; envio ainda nao feito vira `deleted` sem chamar o
  Drive; enviado vai para a lixeira (`DocumentSyncPort.trash`, `PATCH trashed=true`); envio em andamento
  termina e volta a fila para remover; 404 conta como removido; 403 e falha final `drive_delete_forbidden`.

## Promobank E HISCON Para Avancar (P1, 2026-11-02)

Plano: `docs/product/flow-customer-promobank-sprints.md`; migration `113`.

- Tipo `promobank` no catalogo da ficha. Para validar: identidade, CPF (salvo `cpfOnIdentity`), comprovante,
  HISCRED, declaracao (com comprovante de terceiro) e **HISCON ou Promobank** (`EXTRACT_ALTERNATIVES`); sem
  nenhum dos dois, `missing` traz `extrato_beneficio`. Itens da resposta com `oneOf: 'extrato' | null`.
- HISCON enviado depois da validacao confirmada sem ele nao reabre a validacao (`sameDocuments` so olha o
  snapshot). As automacoes leem, alem do snapshot, o HISCON atual fora dele (`LATE_DOCUMENT_TYPES`,
  `AutomationCustomerService.readableDocuments`), respeitando a lista da regra. No envio (e na reconciliacao)
  ele entra na fila do Drive como `customer_document`.
- Requisitos de entrada da coluna (`docs/product/flow-signed-kit-sprints.md`, S1; migration `114`; substitui o
  bloqueio deduzido das regras de agente da P1): regra `require_to_enter` (gatilho `column_entered`, sem
  destinatario, `actionConfig.requirements`, hoje `customer_hiscon`), validada em `AutomationRulesService`
  e ignorada pelos disparadores (filtram pelo tipo de acao). `EntryRequirementsService`: (a) gate no
  `CardsService.move` (junto do checklist; tambem nos movimentos por regra) -> 422
  `column_requirements_unmet` com `unmetRequirements`; `customer_hiscon` nao barra card sem cliente;
  (b) `CardDto.customerWithoutHiscon` no `GET` dos cards do quadro: quadro com coluna que exige o HISCON e
  cliente com validacao confirmada sem HISCON atual (uma consulta por quadro, escopo unico). A migration
  criou `require_to_enter` com `customer_hiscon` nas colunas que o bloqueio deduzido barrava.
- `GET kanban/boards/:boardId/cards/:cardId/customer/hiscon` (`CardHisconController`): `{ customerId, missing,
  canUpload }`, mesma visibilidade do card; `canUpload` = scope `flow:customers:write` ou `flow:admin` (o envio
  usa `POST kanban/customers/:customerId/documents/extrato_beneficio`).
- Envio e remocao de documento da ficha avisam o tempo real (`customer.document_uploaded|removed`): o selo
  some nos quadros abertos.
- Prompt da validacao v4: sem HISCON, o extrato e o Promobank, com as mesmas regras.

## Kit Assinado E Validador De Assinatura (S2 De flow-signed-kit-sprints.md)

- Migration `115`. `kanban_customer_signed_kits`: versoes do assinado por kit (uma atual), arquivo no storage em
  `{client}/customers/{customer}/kits/{kit}/signed/{id}`. So o kit mais recente do cliente do card pode ser
  assinado. Versao nova expira a validacao em andamento (`signed_kit_replaced`) e tira a aprovacao anterior.
- Disparo (S5, migration `122`): so pela acao `validar-assinatura` do catalogo de Acoes por coluna, com o agente de
  rotina em `kanban_column_actions.config` e executor = `configured_by_identity_id`. A tabela
  `kanban_signed_kit_validation_settings` e as rotas `GET|PUT kanban/signature-validation/settings` sairam.
  Disponibilidade por card (`SignedKitRepository.validatableCardIds`): assinado atual sem parecer util.
- `kanban_signed_kit_validations`: `dispatching -> dispatched -> answered` (ou `failed`/`expired`, mesmos prazos
  5/15 min da validacao de cadastro), parecer `aprovado|pendencias` com `findings` por documento, confirmacao
  humana so do aprovado da versao atual. Disparo pelo gateway com `sourceType = flow_signature_validation` e
  `payload = { run_id }`.
- Rotas do card (`SignedKitController`): `GET .../office-kit/signature` (tela: situacao, `canUpload`,
  `canConfirm`), `POST .../office-kit/:kitId/signed` (multipart; PDF sem senha ou imagem; so grava a versao),
  `GET .../signed/:signedKitId/download` e `POST .../signature-validation/:runId/confirm` (`flow:validation:approve`).
  Validar: `POST .../cards/:cardId/actions/validar-assinatura/execute` (S5). Historico
  `card.signed_kit_uploaded|approved`; auditoria `kanban_signed_kit_*` sem conteudo.
- Conector: `flow_get_signature_validation_request`, `flow_get_signed_kit_original` (texto do `.docx` do kit em
  partes de 12 mil caracteres), `flow_get_signed_kit_page` (imagem) e `flow_submit_signature_validation`; so o
  executor da acao, so execucao `dispatched` da versao atual; mesma permissao de documentos do conector.
- Requisito de entrada `signed_kit` (`EntryRequirementsService`): o kit mais recente do cliente com o assinado
  atual aprovado e confirmado; selo `CardDto.signedKitPending` quando o quadro exige o kit assinado e o cliente ja
  tem kit sem assinado aprovado. Drive: `signed_kit` na pasta do cliente, `KIT_<NOME>_<data>_ASSINADO.<ext>`.
- Gatilho `signed_kit_approved` (S3; migration `116`): so com `move_card`; o motor de movimento cria a execucao a
  partir do evento `card.signed_kit_approved` do card que esta na coluna da regra.
- Gatilho `djen_publication_received` (ADR 022, Sprint 8 de `docs/product/process-monitoring-sprints.md`;
  migration `127`): evento `djen_publication_received` gravado pelo destino Flow da capacidade
  `publicacoes-processuais` (um por publicacao nova); aceita `send_email_notification` (outbox duravel,
  coluna gravada no evento) e `move_card` (coluna atual do card), como `juridico_process_moved`.
- E-mail do kit ao cliente (S4; migration `117`; `OfficeKitEmailService`): configuracao por escritorio
  (`GET|PUT kanban/offices/:officeId/kit-email`, `flow:admin`; texto com [[NOME]] e [[ESCRITORIO]]); na geracao do
  kit, com envio ligado e e-mail valido na ficha, um envio por kit entra em `kanban_office_kit_emails` com o texto
  montado; o `AutomationWorker` (passada `RECOVER_AI_AUTOMATIONS_JOB`) envia pelo `MailerService` com o `.docx`
  anexo, com reserva e novas tentativas (5), e grava `card.office_kit_emailed` nos cards do cliente.
  `GET .../office-kit` traz `kit.email` (situacao, destinatario, envio).

## Validacao Da Ficha Por Agente Claude (S2, ADR 017)

Runtime em `src/modules/kanban/customer-validation/`; rotas em
`docs/api/flow-customer-documents-openapi.yaml`.

- `086_kanban_customer_validation.sql`: `kanban_customer_validation_settings`
  (agente + identidade central executora), `kanban_customer_validation_runs`
  (um em andamento por cliente; snapshot das versoes enviadas; parecer;
  confirmacao humana) e aceite proprio de documentos em
  `kanban_claude_connector_settings`.
- "Validar dados" exige ficha completa e agente configurado; dispara o gateway
  com `sourceType = flow_customer_validation` e `requesterIdentityId` = identidade
  central (destino central), payload so com `run_id` e `document_count` (o prompt usa so o `run_id`;
  nenhuma instrucao vai no disparo). A conclusao por `flow_submit_customer_validation`, nunca por
  `flow_complete_automation`, esta no prompt, na descricao da ferramenta e no pedido lido pela rotina
  (`VALIDATION_COMPLETION_INSTRUCTIONS`). As instrucoes fixas do servidor MCP valem para toda sessao e
  nao mandam chamar ferramenta de conclusao (2026-10-28). Agente
  que nao responde `dispatched` (modo API) vira run `failed`
  (`validation_agent_not_routine`). Run `dispatched` expira e libera novo pedido:
  sem leitura do pedido pela rotina em 5 min (`routine_not_reached`, `picked_up_at`
  nulo; migration 099) ou 15 min sem chamada ao conector depois da leitura
  (`routine_no_answer`).
- Tools do conector `flow_get_customer_validation_request`,
  `flow_get_customer_document` e `flow_submit_customer_validation`: exigem
  `allowCustomerDocuments`, atendem so a identidade central do run
  `dispatched`; pagina de documento sai como `image/jpeg` (PDF renderizado por
  pagina com `pdfjs-dist`, imagens reduzidas com `@napi-rs/canvas`, lado maior
  1568 px, ate 100 paginas, `MAX_DOCUMENT_PAGES`).
- `extractedData` juridico preenche so campo vazio da ficha; valor fora de formato ou maior que a coluna e
  descartado, nunca truncado (`extracted-customer-data.ts`). Endereco do comprovante de residencia
  (`addressZip` com 8 digitos, `addressStreet`, `addressNumber`, `addressComplement`,
  `addressNeighborhood`, `addressCity`, `addressState` entre as 27 UFs; 2026-10-29) vai a
  `pdv_establishment_customers` por `CustomersService.replaceAddressFromDocument`: o documento prevalece
  (decisao do usuario de 2026-10-29) e substitui o endereco inteiro da ficha, campo ausente fica vazio
  (nunca mistura dois enderecos); leitura sem logradouro, cidade e UF nao toca a ficha; `appliedFields`
  lista so os campos que mudaram; falha nele nao desfaz os dados juridicos. `rg_orgao_emissor` vai ate 120 caracteres
  (RG modelo novo traz o nome do instituto; migration `106_customer_juridico_rg_orgao_emissor_120.sql`,
  mesmo limite nos DTOs da ficha e do card).
- Card de entrada (ADR 019, decisao 16): criado na confirmacao no BACKLOG do board do escritorio, com os
  responsaveis do escritorio (`kanban_user_offices.is_responsible`) como responsaveis do card, via
  `AssigneesService.assignBySystem` (sem exigir papel de quem confirmou; cada responsavel precisa ser membro
  ativo do board e ver o card). Quem fica de fora e o motivo vao para `intake_assignees` do run (migration
  `109`) e para a auditoria `kanban_customer_validation_intake_card`; o status devolve os nomes.
- O parecer nao altera o cliente. So `POST .../confirm` (humano, mesma versao
  dos documentos) torna o cliente `validado`; documento novo depois disso volta a
  `nao_validado`.
- Auditoria sem conteudo: `kanban_customer_validation_requested|answered|confirmed`
  e `kanban_customer_validation_settings_updated`.
- Replica Drive (S3, `087_kanban_drive_customer_documents.sql`): a confirmacao
  enfileira as versoes validadas como `customer_document` quando o Drive da
  empresa esta ativo; a reconciliacao cobre Drive ligado depois. O worker
  resolve a origem (`DocumentSyncRepository.source`) e grava em
  `<raiz>/<CPF>/` (`driveLocation`); peticoes de cliente com CPF tambem vao para
  essa pasta, sem cliente mantem o caminho legado.

### Analise De Acoes (A1)

Plano: `docs/product/flow-action-analysis-sprints.md`; ADR 019, decisao 18.

- `100_kanban_card_action_analyses.sql`: `kanban_card_action_analyses` (uma por
  execucao da rotina, vinculada ao card e ao cliente) e
  `kanban_card_action_analysis_actions` (uma linha por acao de bloco, contratos em
  `jsonb`); `picked_up_at` em `kanban_ai_automation_outbox`.
- Tool `flow_submit_action_analysis` (`ActionAnalysisService.connectorSubmit`):
  so a execucao `dispatched` do dono da regra, com `allowCustomerDocuments`;
  valida campos por bloco e um contrato em um bloco so (`invalid_analysis`, sem
  gravar); grava e encerra a execucao na mesma transacao (`completed` ou
  `failed`/`routine_reported_failure`). Concluida com ao menos uma acao e a conclusao sem erro: grava
  `ai.automation_completed` na mesma transacao (`recordAutomationCompleted`). Evento
  `card.action_analysis_registered` no historico e auditoria `kanban_action_analysis_registered` sem
  conteudo.
- Movimento: so pelas regras `ai_completed -> move_card` da coluna (secao "Conclusao Da IA E Movimento");
  a IA nao move card. A unificacao de 2026-10-28 (`docs/product/flow-branch-unification.md`) retirou o
  "Ao concluir sem erro, mover o card para" da regra do agente; `105_kanban_move_rule_from_agent_rule.sql`
  converte o destino antigo numa regra `ai_completed -> move_card` da mesma coluna.
- `GET /kanban/boards/:boardId/cards/:cardId/action-analysis`: analise mais
  recente do card visivel.
- Execucoes de rotina das automacoes: `touchDispatched` a cada tool da execucao;
  o scheduler expira `dispatched` sem chamada em 5 min (`routine_not_reached`) ou
  parada 15 min depois disso (`routine_no_answer`) e registra
  `card.automation_run_failed` no card.
- Resultado esperado (ADR 020, S1 de `docs/product/flow-initial-petitions-sprints.md`):
  `actionConfig.expectedResult` (`comment` | `action_analysis` | `initial_petitions`) obrigatorio em
  `execute_ai_agent`; `action_analysis` e `initial_petitions` so com `claude_routine`;
  `documentGenerator` (`flow` padrao | `ai`) so em `initial_petitions`. Define quem conclui:
  `comment` pela confirmacao explicita (`flow_complete_automation`/`kanban.automation.complete`);
  `action_analysis` e `initial_petitions` pela ferramenta propria (`flow_complete_automation` responde
  `wrong_completion_tool`; `flow_submit_action_analysis` recusa execucao de outro resultado com
  `wrong_expected_result`). Comentario nunca conclui. A rotina recebe `completion_instructions` pelo
  resultado esperado. Migration `101_kanban_automation_expected_result.sql`: `dispatched_at` no outbox e
  `expectedResult` nas regras existentes. Peticoes iniciais expiram 30 min sem chamada ou 3 h depois do
  disparo (`routine_time_limit`).

### Acoes Ja Ajuizadas E Advogados Por UF (S2 De Peticoes Iniciais)

Plano: `docs/product/flow-initial-petitions-sprints.md` (S2); ADR 020; contrato HTTP
`docs/api/flow-initial-petitions-openapi.yaml`.

- `102_kanban_prior_lawsuits_office_lawyers.sql`: `kanban_customer_prior_lawsuits` (banco, numero CNJ,
  remocao logica; numero unico por cliente entre as vigentes), `kanban_customer_prior_lawsuit_declarations`
  (confirmacao "sem acoes anteriores"; uma vigente por cliente; revogada por `lawsuit_added` ou
  `withdrawn`) e `kanban_office_lawyers` (nome, OAB, UF; um ativo por escritorio e UF).
- `prior-lawsuits/`: `GET|POST /kanban/customers/:id/prior-lawsuits`, `DELETE .../:lawsuitId`,
  `POST|DELETE .../declaration`. Leitura `flow:customers:read|flow:admin`, escrita
  `flow:customers:write|flow:admin`, visibilidade de `FlowCustomersService.requireVisibleCustomer`.
  Incluir e confirmar serializados por cliente (lock consultivo); confirmar com acao na lista responde
  `prior_lawsuits_listed`. Auditoria `kanban_customer_prior_lawsuit_added|removed`,
  `kanban_customer_prior_lawsuits_declared_none|declaration_withdrawn`, sem banco nem numero.
- `111_kanban_prior_lawsuits_default_none.sql` (2026-10-29, ADR 020 decisao 7 revisada): coluna `origin`
  (`manual|default`). `markDefaultNoPriorLawsuits` marca "sem acoes anteriores" com `origin = default`
  na transacao de `FlowCustomersRepository.replaceOffices` (cadastro com escritorio) e de
  `CardCustomersRepository.replace` (vinculo ao card), so para cliente sem nenhuma acao nem confirmacao,
  vigente ou revogada; desfeita ou com acao listada nunca volta sozinha. A migration faz o backfill dos
  clientes do Flow intocados.
- Advogados por escritorio sairam na S7 (ADR 020, emenda de 2026-10-29): rotas, servico e aba removidos;
  `kanban_office_lawyers` fica como historico, sem leitura nem escrita.

### Leitura Pelo Conector E Pre-Condicoes (S3 De Peticoes Iniciais)

- `initial-petitions/PetitionPreconditionsService.evaluate`: cliente do card com validacao aprovada, UF
  valida no endereco da ficha (`customers.address_state`, 27 UFs) e acoes ja ajuizadas vigentes ou
  confirmacao vigente. Devolve o contexto (endereco, nascimento, genero da validacao, acoes e, desde a
  S7, `closing`: local, quem assina e `gaps`). Fecho incompleto nao bloqueia.
- Disparo (`AiAutomationProcessorService`, `expectedResult = initial_petitions`): pre-condicao falhando
  marca a execucao `failed` com o codigo e registra `card.automation_run_failed`, sem chamar a rotina.
- `flow_get_card_customer` nessa automacao repete a checagem (falha encerra a execucao com
  `failDispatched` e o mesmo evento) e devolve `petition`; nas demais automacoes nada muda.
- Tool `flow_get_card_action_analysis` (`ActionAnalysisService.connectorLatestConcluded`): so em
  `initial_petitions`; analise concluida mais recente (`latestConcludedForCard`) com `actionId`; auditoria
  `kanban_automation_action_analysis_read` sem conteudo.

### Motores Do Documento E Do Print (S4 De Peticoes Iniciais)

- `initial-petitions/document/`: esquema do conteudo (`petition-content.ts`, zod), recusas
  deterministicas (`petition-validation.ts`), montagem do `.docx` pela secao 11 do prompt do escritorio
  (`petition-docx.ts`, biblioteca `docx` 9.8.1 fixa) e recorte do HISCON (`hiscon-print.ts`, via
  `DocumentRasterizerService.renderCanvas`). Funcoes puras; usadas pela S5.

### Modo Flow Ponta A Ponta (S5 De Peticoes Iniciais)

- `103_kanban_initial_petitions.sql`: prints e rascunhos da execucao (`kanban_petition_figures`,
  `kanban_petition_drafts`, descartados pelo scheduler quando a execucao deixa de estar `dispatched`),
  `kanban_card_petition_runs` (relatorio em `report`, `completed`), `kanban_card_initial_petitions`,
  `kanban_card_initial_petition_actions` (acao em uma peticao por execucao), `kanban_petition_precedents`
  e, em `kanban_card_generated_documents`, origem `routine_petition` com `petition_id` (lead e modelo
  nulos por CHECK; versao por peticao). `104_identity_flow_petition_approve.sql`: scope
  `flow:petition:approve` no catalogo do Flow e para quem tem `flow:admin`.
- Tools `flow_create_hiscon_print`, `flow_submit_initial_petition` e `flow_finish_initial_petitions`
  (`InitialPetitionsService`): so execucao `initial_petitions` do dono; recusas sem gravar; fechamento
  sobe os .docx antes da transacao e os remove se ela nao fechar; com ao menos uma peticao grava
  `ai.automation_completed` na mesma transacao (o card anda pelas regras `ai_completed -> move_card`);
  evento `card.initial_petitions_registered`; auditoria sem conteudo.
- `GET /kanban/boards/:boardId/cards/:cardId/initial-petitions`, `.../documents/:id/download` e
  `POST .../documents/:id/approve` (`flow:petition:approve` ou `flow:admin`): aprovacao pede o PDF e o
  gatilho do banco enfileira o Drive; evento `card.initial_petition_approved`. No Drive o arquivo tem o
  nome da peticao em todas as versoes.

### Fecho Pelo Flow E Versao Corrigida (S7 E S8 De Peticoes Iniciais)

Plano: `docs/product/flow-initial-petitions-sprints.md` (S7, S8); ADR 020, emenda de 2026-10-29 (decisoes
15 a 21); contrato HTTP `docs/api/flow-initial-petitions-openapi.yaml`.

- `110_kanban_petition_signature.sql`: `kanban_user_lawyer_profiles` (nome para assinatura) e
  `kanban_user_oabs` (uma OAB por UF); `kanban_offices.city|uf`; `kanban_card_petition_runs.closing_gaps`;
  `kanban_card_initial_petitions.protocol_number|protocoled_at`; gatilho do Drive herda o
  `remote_file_id` da versao anterior ja sincronizada da mesma peticao.
- `lawyers/`: `GET /kanban/settings/users/lawyers`, `GET|PUT /kanban/settings/users/:identityId/lawyer`,
  so `flow:admin`; cadastro substituido por inteiro; auditoria `kanban_user_lawyer_replaced` so com as UFs.
  `UserLawyersRepository.signerForCard`: responsavel do card com OAB na UF da acao, ordem responsavel pelo
  escritorio do card > `board_admin` ativo > demais, empate pelo mais antigo no card.
- Escritorio: `city`/`uf` opcionais em `POST|PATCH /kanban/offices` (os dois ou nenhum,
  `office_place_incomplete`).
- `PetitionPreconditionsService.closing` resolve local e quem assina; `flow_finish_initial_petitions`
  monta o fecho (`document/petition-closing.ts`: "Nesses termos," / "pede deferimento." / Cidade/UF e data
  da geracao por extenso / nome em negrito / OAB/UF nº) depois do corpo e grava `closing_gaps`.
  `flow_submit_initial_petition` recusa o corpo com fecho. O conector entrega `signer`, `closingPlace`
  e `closingGaps` em `petition`.
- `POST .../initial-petitions/documents/:id/corrected-version` (`flow:petition:approve` ou `flow:admin`):
  `.docx` com `inspectEditedDocx`; so sobre a versao atual (`petition_document_not_current`) e sem
  protocolo (`petition_protocoled`); a corrigida (`uploaded_edit`) entra `rascunho` e a anterior vira
  `substituido`; evento `card.initial_petition_corrected`; auditoria `kanban_initial_petition_corrected`.

## Avisos Em Tempo Real Do Que Foi Gravado (R1)

Plano: `docs/product/flow-realtime-card-updates-sprints.md`.

- `realtime/flow-live-events.ts` (`FlowLiveEvents`, RxJS em memoria): `ActivitiesRepository` publica cada
  atividade gravada no card (comentario, evento de sistema, comentario e pedido de revisao da IA);
  `CustomerValidationService.connectorSubmit` publica a ficha do cliente.
- `KanbanGateway` assina e emite `card.updated` `{ boardId, cardId, kind }` na sala do board, com a mesma
  regra do `card.moved` (card e coluna visiveis, revalidado por evento), e `customer.updated`
  `{ customerId, kind }` na sala do tenant (`tenant:<clientId>`, entrada na conexao), alem de
  `card.updated` aos cards vinculados ao cliente. So ids e o tipo; a tela busca pelo HTTP.
- Uma instancia: com mais de uma, o Socket.IO precisa de adapter compartilhado (debito registrado).

## Conector Claude (MCP)

Plano e decisoes: `docs/product/kanban-claude-connector-sprints.md`. Runtime em
`src/modules/kanban/claude-connector/`.

- O usuario usa a propria assinatura Claude; o Flow e um conector MCP remoto.
  O Kanban nao executa modelo e nao usa `src/ai`.
- `POST /kanban/mcp` (Streamable HTTP stateless) autentica por token opaco
  emitido pelo Identity e validado por introspeccao s2s a cada requisicao
  (`svc:identity-oauth`, sem cache). O token do conector nunca e JWT, entao nao
  passa no `KanbanAuthGuard`; o JWT de usuario nao e aceito no MCP.
- `KanbanRequestContext` vem somente da introspeccao (identidade, tenant,
  `database_ref`, scopes/roles Flow atuais). Sem `flow:read` a chamada e `401`.
- Tools: `flow_list_boards`, `flow_search_cards`, `flow_get_card` (scope
  `flow:connector:read`) e `flow_add_card_comment` (`flow:connector:comment`).
  Reutilizam `BoardsService`, `CardsService`, `CardVisibilityService` e
  `ActivitiesService`: membresia, perfil/coluna e escritorio iguais aos da UI.
  `sourcePayload`, anexos e payload de `system_event` nunca saem.
- Comentario do conector: `kanban_card_activities.event_payload =
  {"origin": "claude_connector"}`; autor e o usuario conectado; reenvio identico
  em 2 minutos devolve o mesmo comentario (`findRecentConnectorComment`, apos
  `requireVisibleCard`).
- Configuracao por tenant em `kanban_claude_connector_settings`
  (`082_kanban_claude_connector.sql`): desligado por default; ligar exige
  `flow:admin` e aceite registrado da politica de dados; mascaramento de
  CPF/CNPJ/e-mail/telefone ligado por default. `GET
  /kanban/settings/claude-connector` para qualquer usuario Flow, `PUT` so
  `flow:admin`.
- Auditoria: `claude_connector.tool_called` (tool, grant, card, resultado; sem
  conteudo) e `claude_connector.settings_updated`.
- Limite: 120 requisicoes/min por conexao (grant), por processo; excedente
  recebe `429` com `Retry-After`.
- `flow_add_card_comment` aceita `runId` opcional apenas como referencia.
  Desde 2026-10-21, somente `flow_complete_automation` com confirmacao integral
  explicita conclui o run dispatched do mesmo dono/card/tenant
  (`docs/runbooks/flow-ai-completion.md`).
- Dev Runtime Profile: nenhum container ou processo novo; `make code-up
  TARGET=kanban` ja sobe Identity, Platform API e Platform Web. Smoke com
  claude.ai exige URL publica (tunel opt-in, fora do `code-up`); com Claude
  Code, `localhost` basta (`docs/runbooks/flow-claude-connector.md`).

## Coluna Padrao E Integracoes De Dominio

A partir de `docs/product/domain-flow-integration-sprint-1-gate.md`, todo board
novo deve criar imediatamente uma coluna padrao `BACKLOG`, ativa, posicao `0`,
com UUID recuperavel por metadado (`is_default`), nao por nome. O usuario pode
renomear a coluna; o backend deve continuar reconhecendo-a como padrao.

Integracoes de dominio que criam cards no Flow devem usar essa coluna padrao e
devem passar pelo modulo interno `modules/domain-integrations`, preservando a
referencia externa estruturada do registro de origem.

Card de origem externa e copia autossuficiente: `title`, `description` e
`source_payload` sao gravados no banco do Flow e o modulo nunca le o banco do
dominio de origem. O Flow e o dono do dado permanente do cliente.

Por `docs/product/juridico-datajud-flow-sprints.md` (escopo confirmado em
2026-09-09, sprints 5-8 concluidas), card de origem externa tem dados de origem
**imutaveis**: o card e editavel nas regras do Flow (coluna, responsavel, tags),
mas `title`, `description` e `source_payload` nao sao reescritos por reexport
nem por mudanca no dominio de origem. Mudanca de estado na origem entra como
`CardActivity` do tipo `system_event`, o que exige expor escrita programatica de
`system_event` para chamador interno — hoje o `ActivitiesService` expoe apenas
`createComment`.

## Dev Runtime Profile

## Replica Assincrona Google Drive

A replica opcional usa `kanban_document_syncs` como outbox transacional e DLQ
persistida. A aprovacao de uma versao canonica cria uma linha `pending` somente
quando a configuracao do tenant esta ativa; o relay periodico tambem reconcilia
documentos aprovados sem outbox, inclusive depois de ativacao posterior. A fila
`kanban-drive-sync` carrega apenas `databaseRef`, `clientId` e `syncId`.
Reserva com fencing (trazido do checkout principal na unificacao de 2026-10-28): `complete` e `fail` so
gravam com a mesma tentativa e o mesmo fim de reserva ainda valido (senao o worker devolve `skipped`), e
`claim`/`stale` recuperam itens presos em `syncing` com reserva vencida (`sync_lease_expired`, ate 100 por
varredura; na ultima tentativa fica terminal ate o reprocessamento).

O worker revalida tenant, configuracao ativa, lease e limite de tentativas no
banco, relê o objeto canonico e confere SHA-256 antes do upload. Retry e backoff
sao persistidos em `next_attempt_at`; `failed` com `next_attempt_at = NULL` e a
DLQ operacional e so retorna por `POST /kanban/document-syncs/:syncId/reprocess`
com `flow:admin`. Desde 2026-10-30 o envio acha cada pasta e o arquivo pelo nome exato
(`GoogleDriveDocumentSyncAdapter`): pasta igual e reaproveitada (a mais antiga, se duplicada), arquivo
igual e substituido, senao cria; repeticao apos falha entre o upload e o commit local cai no mesmo
arquivo pelo nome. `DocumentSyncRepository.withClientDriveLock` serializa os envios do cliente
(`pg_advisory_xact_lock`, valido entre instancias). Jobs usam somente UUIDs.

O relay reconcilia a cada seis horas ate 100 replicas `synced` por tenant,
consultando apenas `remote_file_id`, estado de lixeira e `jbootChecksum`. Arquivo
ausente ou checksum divergente volta a `pending`; indisponibilidade do provider
adia nova verificacao sem alterar o canonico. `GET /kanban/document-syncs`
(`flow:admin`, rate-limited) retorna contagens agregadas, atraso do item mais
antigo e no maximo 50 entradas terminais da DLQ contendo somente IDs, versao,
codigo sanitizado e timestamp.

Exclusao remota nao e disparada por exclusao logica de card. A semantica
aprovada — legal hold bloqueia expurgo e, fora dele, a replica acompanha apenas
exclusao canonica aprovada e auditada — permanece bloqueada ate existir esse
workflow canonico; nao inferir exclusao a partir de `card.status = deleted`.

Cada cliente conecta a propria conta Google pela tela `Configuracoes ->
Google Drive` (OAuth 2.0, escopo `drive.file` + `openid email`) e escolhe a pasta
de destino no seletor do Google (Picker). O refresh token fica em
`kanban_drive_configurations.refresh_token_enc` (AES-256-GCM, chave derivada por
`client_id` de `JBOOT_FLOW_DRIVE_ENCRYPTION_KEY`) e nunca e devolvido pela API.
Rotas (`flow:admin`): `GET|PUT|DELETE /kanban/settings/google-drive`,
`POST .../connect`, `POST .../connect/complete` e `POST .../picker-token`. O
callback do Google volta para a propria pagina do Flow, que chama
`connect/complete` autenticada; o `state` e assinado (HMAC), expira em 10 min e
precisa pertencer ao mesmo `client_id` e `identity_id` da sessao. O app OAuth e
unico do JBoot (`JBOOT_FLOW_DRIVE_OAUTH_CLIENT_ID/SECRET`, Picker API key e app
id); sem essas variaveis a tela informa indisponibilidade e o resto do modulo
continua funcional. Token revogado ou expirado pausa a integracao
(`status = invalid`) sem consumir tentativas dos documentos; reconectar retoma.
O fluxo antigo `secret_ref`/`env:JBOOT_FLOW_DRIVE_OAUTH_SECRET` foi removido
(ADR 016).

### Target Runtime Matrix

- target: `code-up:kanban` (Sprint 1/2/3 — sem anexos)
  - purpose: desenvolvimento do backend Platform para o modulo Flow (Kanban), incluindo WebSocket gateway de realtime e perfis de movimentacao.
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `otel-collector` quando a sprint exigir observabilidade; `mailpit` (Sprint 8+, SMTP fake dev-only para o `MailerService` do motor de automacao por coluna — necessario para o smoke de e-mail, nao para o boot basico do modulo).
    - forbidden_by_default: `mongodb`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api` (inclui WebSocket gateway nativo do NestJS), `platform-web`.
    - optional: nenhum.
    - forbidden_by_default: BFF/worker standalone para Kanban — modulo vive dentro de `platform-api`.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET /health` em Identity e Platform; conexao WebSocket em `/flow/ws`.
  - seed_dependencies: `013_kanban.sql` (DDL banco dedicado; migrations incrementais ate `065_kanban_case_types_templates.sql`) e `014_identity_flow_dev_seed.sql` (application `flow`, database_ref dedicado, entitlement administrativo do `Operador Senior`, cpf `00000000191`, no cliente `JBoot` cnpj `63784101000110`, e entitlement administrativo do `Usuario Teste`, cpf `00011122233`, no cliente `Demo JBoot` cnpj `22345678000199`).
  - expected_resource_profile: medio, instancia unica (sem Redis/pub-sub multi-instancia no MVP).

- target: `code-up:kanban-attachments` (Sprint 4+ — com anexos)
  - purpose: desenvolvimento do backend Platform para o modulo Flow incluindo upload/download de `CardAttachment` via MinIO.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `minio` (MinIO passa de `forbidden_by_default` para `required` somente neste target).
    - optional: `otel-collector`.
    - forbidden_by_default: `mongodb`, `rabbitmq`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
    - optional: nenhum.
    - forbidden_by_default: BFF/worker standalone para Kanban.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`, `9000` (MinIO API), `9001` (MinIO console).
  - healthchecks: `GET /health` em Identity e Platform; `GET /minio/health/live`; bucket `kanban-card-attachments` provisionado no bootstrap do target.
  - seed_dependencies: mesmas da Sprint 3, mais provisionamento do bucket `kanban-card-attachments` (criacao idempotente no startup do modulo, nao via seed SQL).
  - expected_resource_profile: medio-alto (objeto storage local); sem CDN/limite de tamanho definido (ver pendencias).

- target: `code-up:kanban-leads` (CRM de leads, Sprint 6+ — anexos + documento gerado + PDF)
  - purpose: CRM de leads completo (envio, checklist com upload, modelos `.docx`, geracao, revisao e PDF do aprovado).
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `jboot-fiscal`, `minio`, `gotenberg` (conversor `.docx -> PDF`, profile `pdf`; `required` somente neste target).
    - optional: `otel-collector`, `mailpit`.
    - forbidden_by_default: `mongodb`, `rabbitmq`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `temporal-ui`. Nos demais targets `gotenberg` e `forbidden_by_default`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api` (inclui os workers BullMQ in-process `kanban-column-automation` e `kanban-document-pdf`), `platform-web`.
    - optional: nenhum.
    - forbidden_by_default: BFF/worker standalone para Kanban; `soffice` dentro do container `jboot` (ADR 014, Deployment Boundary).
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`, `9000`, `9001`. `gotenberg` NAO publica porta (so `jboot` o alcanca, em `http://gotenberg:3000`).
  - healthchecks: os do `kanban-attachments` + `docker compose exec gotenberg curl -fsS http://127.0.0.1:3000/health` (healthcheck do compose).
  - seed_dependencies: as do `kanban-attachments` + `066_kanban_lead_analysis_documents.sql`.
  - network: `jboot-pdf-internal` (`internal: true`, sem egress); `gotenberg` so nela e com DNS externo bloqueado (`dns: 127.0.0.1`); `jboot` nela e na `default`. Evidencia (2026-10-12): de dentro do `gotenberg`, `curl https://example.com` = `Could not resolve host`, `curl http://1.1.1.1` = timeout; `docker port jboot-gotenberg` vazio; do `jboot`, `GET http://gotenberg:3000/health` = 200 e `POST /forms/libreoffice/convert` sem credencial = 401.
  - env (servico `jboot`, derivadas do compose): `JBOOT_PDF_CONVERTER_URL` (default `http://gotenberg:3000`), `JBOOT_PDF_CONVERTER_USER`, `JBOOT_PDF_CONVERTER_PASSWORD` (as MESMAS variaveis alimentam `GOTENBERG_API_BASIC_AUTH_*`; valores de dev em `.env.example`, segredo real so no deploy).
  - expected_resource_profile: alto; `gotenberg` limitado a 1 CPU, 1 GB, 256 pids, rootfs somente leitura (tmpfs `/tmp` 512 MB e `/home/gotenberg` 64 MB), `cap_drop: ALL`, `no-new-privileges`, usuario `gotenberg` (uid 1001). Imagem `gotenberg/gotenberg:8.37.0-libreoffice` fixada por digest `sha256:c85f019d6ae4927714507254331cc0ed72da7b619ee798e3a45de01f54372c12` (tag publicada em 2026-09-11, conferida no Docker Hub em 2026-10-12); flags `--api-enable-basic-auth --api-disable-download-from --webhook-disable --api-timeout=60s --libreoffice-max-queue-size=10 --libreoffice-restart-after=10`.

### Rules

- `make code-restart TARGET=kanban-leads` reinicia os processos Identity/Platform e garante os containers do target (inclui `gotenberg`). `code-down` so para processos (containers continuam, como nos demais targets).
- Fontes dos modelos (risco do Architect): a imagem traz Liberation (metricas de Arial/Times/Courier), Carlito (Calibri), Caladea (Cambria), DejaVu e Noto; nao traz fontes proprietarias do Office. Verificacao com o modelo real: listar as fontes do `.docx` (`word/fontTable.xml` e `w:rFonts` de `word/document.xml`/`styles.xml`), comparar com `docker compose exec gotenberg fc-list : family`, converter e comparar texto (`src/test/pdf-text.ts`) e layout. Faltando fonte: imagem derivada versionada (`FROM` fixado + fonte com licenca de uso), nunca substituicao silenciosa.
- `make code-restart TARGET=kanban` reinicia somente os processos Identity/Platform exigidos pelo modulo (Sprint 1-3, sem MinIO).
- `make code-restart TARGET=kanban-attachments` inclui o container `minio` (Sprint 4+).
- WebSocket gateway usa `@nestjs/websockets` com adapter padrao do ecossistema NestJS (`socket.io` ou `ws`), executando dentro do processo `platform-api`.
- Sem Redis/pub-sub multi-instancia no MVP: realtime funciona apenas com uma instancia de `platform-api`. Limitacao conhecida para escala horizontal futura — documentada aqui, nao resolvida nesta sprint.
- MinIO e infra compartilhada do `docker-compose.yml` (servico `jboot`); o modulo Kanban consome via bucket dedicado, nunca compartilhando bucket com outro modulo/projeto.

### Runtime (resolvido em 2026-10-11)

- O target `code-up:kanban-attachments` (e `make code-restart TARGET=kanban-attachments`)
  existe em `tools/code-up.sh` e `tools/code-down.sh`: mesmos containers e
  processos do `kanban`, mais `minio` em `containers.required`. Decisao: target
  dedicado; `kanban` permanece sem `minio` (este contrato o mantem em
  `forbidden_by_default` do target `kanban`), entao quem usa anexos ou o checklist
  de documentos do CRM de leads sobe `kanban-attachments`.
- `npm run start:dev` do `bff-jboot-platform` usa `nest start --watch --exec "bash scripts/dev-exec.sh"`:
  o executor espera a porta liberar antes de subir o node. Causa do EADDRINUSE: o
  Nest CLI sobe o novo processo assim que o `sh` pai sai, enquanto o node antigo
  ainda executa `sdk.shutdown()` do OTel no SIGTERM (lento sob carga/coletor
  indisponivel). Somente dev; `npm start`/build de producao nao mudam.

## Banco De Dados — Conexao

- `connection_name`: `postgres.kanban`.
- `database_name` (dev): `jboot_kanban_demo_dev`.
- Variavel de ambiente: `JBOOT_KANBAN_DATABASE_URL`.

## Storage De Anexos — Conexao (Sprint 4+)

- Infra: MinIO compartilhado (`jboot-minio`), variaveis `S3_ENDPOINT`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` ja definidas a nivel do servico `jboot` em `docker-compose.yml`.
- Bucket dedicado do modulo: `kanban-card-attachments`.
- Variavel de ambiente especifica do modulo: `JBOOT_KANBAN_ATTACHMENTS_BUCKET` (default dev: `kanban-card-attachments`).
- Prefixos no bucket: anexos/documentos do checklist `{client_id}/{card_id}/{activity_id}/{attachment_id}-{arquivo}`; modelos de documento (Sprint 5) `{client_id}/templates/{template_id}/{version_id}.docx` (sem nome de arquivo).
- **Variavel adicional `S3_PUBLIC_ENDPOINT`** (default dev: `http://localhost:9000`): usada exclusivamente para assinar a URL de download (`StorageService.presignClient`). `S3_ENDPOINT` (`http://minio:9000`) e o hostname interno da rede docker, irresolvivel pelo navegador do usuario final — bug real encontrado e corrigido durante a verificacao da Sprint 4 (ver `docs/product/kanban-sprint-4-gate.md`, secao "Decisao Do Architect", item 7). Em producao, `S3_PUBLIC_ENDPOINT` deve apontar para o dominio publico do MinIO/CDN.
- `app-config.service.ts` expoe essas chaves em `config.s3` (`endpoint`, `publicEndpoint`, `accessKeyId`, `secretAccessKey`, `region`), no mesmo espirito do `connectionUrls` (nao espalhar `process.env` direto pelos services do modulo).

## Restricoes

- Nao criar autenticacao propria.
- Nao aceitar `client_id` vindo do payload.
- Nao acessar banco de outro modulo diretamente.
- Nao usar `src/ai` neste modulo — Kanban nao tem feature de IA.
- Nao introduzir Redis/pub-sub multi-instancia para o gateway WebSocket sem decisao explicita do Architect e do usuario (realtime do board continua instancia unica).
- **Excecao autorizada (Sprint 8, Motor de Automacao por Coluna)**: uso de Valkey como broker de fila de background job via BullMQ (`kanban-column-automation`) e permitido e implementado. Decisao explicita do usuario e do Architect em 2026-09-13 (ver `docs/product/kanban-sprint-8-gate.md`, secao "Decisao Do Architect"). Nao e pub/sub de broadcast realtime multi-instancia (que segue restrito acima): e fila de job assincrono, consumida por um Worker BullMQ rodando dentro do mesmo processo `platform-api` (sem app process/worker standalone novo). Valkey ja era container `required` no target `code-up:kanban` antes desta sprint. CRM de leads, Sprint 6 (ADR 014, Decisao 2): a fila `kanban-document-pdf` (PDF do documento aprovado, outbox + relay, worker in-process com concorrencia 1) entra nesta mesma excecao; payload so com `databaseRef`, `clientId` e `documentId`.
- Permissao por coluna usa tabela ACL dedicada (`BoardColumnPermission`), chaveada por `profile_id` a partir da Sprint 3 (nunca array em membro, nunca por papel fixo a partir da confirmacao do Architect).
- Campos customizados de card usam modelo normalizado (`CardFieldDefinition` + `CardFieldValue`), nunca JSONB direto.
- `CardActivity.created_at` e os demais timestamps de auditoria do card sao imutaveis: nenhuma rotina de update pode alterar `created_at` apos a criacao do registro.
- Anexo (`CardAttachment`) nunca e aceito sem `activity_id` valido do mesmo card/board/client; nao permitir upload "solto" vinculado direto ao card.
- Nao compartilhar bucket MinIO entre modulos/projetos diferentes.
- CRM de leads (`docs/product/flow-crm-leads-sprints.md`): cliente final do card vem de `establishment-customers` somente pelo servico Nest exportado; dados do cliente so sao exibidos a quem ve card vinculado a ele (regra unica de visibilidade por escritorio, Sprint 3.5).
- Lead enviado (Sprint 4) congela as mutacoes do dado enviado pelo `LeadEditLock`; estado do lead nunca derivado da coluna.
- Visibilidade de card: toda leitura/mutacao de card passa por `CardVisibilityService` (rota com `:cardId`) ou `visibleCardScope` (consulta de conjunto); SQL novo sobre `kanban_cards` ou tabela filha fora disso exige entrada comentada na allowlist de `shared/card-visibility.static.spec.ts`.
- Leitura do banco Identity pelo modulo: somente SELECT e somente por `MembersRepository` (nomes/candidatos), `ScheduledAutomationRepository` (tenants), `AutomationWorker` (contatos) e `FlowAdminDirectory` (admins e usuarios do Flow).
- Documento de checklist reutiliza `CardAttachment` vinculado a `CardActivity`; nao criar storage nem bucket paralelo para documentos. Modelos de documento (S5) e documentos gerados (S6) usam o MESMO bucket do modulo com prefixos e tabelas proprias (`{client_id}/templates/...`, `{client_id}/{card_id}/generated/...`), fora do feed do card e sem `CardAttachment` (ADR 014, Decisao 4).
- Conversao para PDF so pelo container `gotenberg` (rede `jboot-pdf-internal`, basic auth, URL fixa do deploy); nunca LibreOffice/`soffice` no processo `platform-api`, nunca URL vinda de usuario, nunca nome original do arquivo no multipart. Documento gerado: so o gestor (`flow:admin`) ve rascunho, classificacao e historico de geracao; o escritorio so o aprovado (P11).
- Modelo `.docx` do tenant e entrada nao confiavel: so passa pelo pipeline de `validateDocxTemplate` em worker; nunca usar parser de expressao, modulo PRO do docxtemplater nem tag raw; versao de modelo nunca e alterada nem apagada.
- Limites de arquivo de documento e anexo vem de uma unica funcao (`assertAttachmentFileAllowed`); nao duplicar constantes.
