# Module Contract: app-jboot-next-platform/modules/kanban

## Conclusao Da IA E Movimento

- Contrato obrigatorio: `docs/product/flow-ai-completion-sprints.md`.
- `docs/api/flow-ai-completion.md` e `docs/runbooks/flow-ai-completion.md`.
- Automacoes: gatilho `ai_completed` e acao `move_card`, com seletor de coluna
  ativa do mesmo board e distinta da origem; reuso do modal existente.

## Contratos Obrigatorios — Acoes De Card

- `docs/product/flow-offices-sprints.md` (escritorio principal, escritorio ativo, barra superior e sino do monitoramento; escopo confirmado em 2026-11-11).

- `docs/product/flow-card-actions-sprints.md` (escopo confirmado em 2026-10-21).
- `docs/product/flow-process-import-sprints.md` (importacao de processos por planilha; Sprint 1 pendente, escopo confirmado em 2026-11-06).
- `docs/product/process-monitoring-sprints.md` (ADR 021; Sprint 3 concluida em 2026-11-08: Monitorar, importacao e botao do card usam `monitoringEnabled` e os avisos da capacidade `monitoramento-processual`, sem exigir o Juridico; Sprint 4: painel do card mostra a ultima e a proxima consulta ao DataJud; Sprint 5: lista de movimentacoes do processo no card; Sprint 7: sinalizacoes DataJud e DJEN no cabecalho e secao Publicacoes e intimacoes; Sprint 8: gatilho "Quando houver publicacao nova no DJEN" nas automacoes da coluna; Sprint 9: "Ver no DJEN" nas movimentacoes e dados do processo no painel Origem).
- `docs/api/flow-card-actions-openapi.yaml` (cliente HTTP tipado).
- `docs/product/flow-card-extra-documents-sprints.md` (documentos avulsos no bloco Documentos do card; D1 concluida em 2026-10-30).
- `docs/product/flow-customer-promobank-sprints.md` (Promobank na ficha, HISCON obrigatorio para avancar; P1 concluida em 2026-11-02).
- `docs/product/flow-signed-kit-sprints.md` (requisitos de entrada da coluna, kit assinado, Validador de assinatura e e-mail do kit; S1 a S4 concluidas em 2026-11-02; S5 validar assinatura como acao da coluna em andamento).
- `/flow/boards/:id/settings/actions`: configuracao por coluna para master do
  cliente e Operador Senior; categoria e descricao do catalogo vindo do backend.
- Cards exibem acoes da coluna atual; execucao manual via cliente tipado com
  loading, retorno e erro no proprio card, sem abrir seu modal de edicao.
- Permissoes efetivas `canConfigure`/`canExecute` vem do BFF; nenhuma tarefa
  juridica real e disparada pelos handlers de confirmacao desta sprint.
- Dev Runtime Profile: mesmo target `code-up:kanban`; migrations aditivas
  `090_kanban_card_actions.sql` e `091_identity_flow_card_actions.sql`.
- Sprint 2 (2026-11-06), acao Monitorar: botao so nos cards de
  `availableCardIds.monitorar`; abre `PetitionMonitoringModal` (peticoes com
  numero, board destino ou "Criar novo board" para `flow:admin`) e chama
  `POST /domain-integrations/flow/cards/:cardId/peticoes/monitoramento`.
  Painel de peticoes mostra o numero do processo, o link "em monitoramento" e o
  botao "Registrar nº do processo" (`RegisterProcessNumberModal`) quando
  `canRegisterProtocol`. Cabecalho/painel de monitoramento valem tambem para
  cards `flow_petition`. Padroes reaproveitados de `ExportToFlowModal` e
  `CorrectedPetitionModal`; nenhum padrao visual novo.
- Importacao de processos por planilha (2026-11-06): rota
  `/flow/importar-processos` e item "Importar processos" no menu do Flow.
  `ProcessImportPage` em 3 etapas (planilha, conferencia, importacao) com
  `.xlsx` lido no navegador (`xlsx` ja existente), mapeamento de colunas pelo
  cabecalho, conferencia por linha e andamento do lote com "Retomar". Card,
  tabela e badges `bg-*-subtle` do template; etapas com icone, sem numero.

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: board Kanban, administracao e testes versionados na Next Platform; conexao ChatGPT Plan permanece planejada e bloqueada por aprovacao externa
last_status_review: 2026-10-15
```

Modulo novo, criado diretamente na Next platform (sem origem standalone). Nome tecnico: `kanban`. Nome de exibicao/login no Identity: `flow` (`application_slug = flow`).

## Responsabilidade

UI do board Kanban (produto "Flow") dentro da Next platform: gestao visual de tarefas/projetos internos do tenant. Administrador do tenant customiza estrutura do board (colunas, campos, workflow, permissoes); usuario final opera cards.

## Agents Do Modulo

- `agents/kanban-board-ui.md`

## Skills Do Modulo

- `skills/kanban-board-ui.md`

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/app-jboot-next-platform`.

```text
Agent Activation:
  project: implementations/app-jboot-next-platform
  module: modules/kanban
  using_agent:
    - implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
    - implementations/app-jboot-next-platform/agents/platform-layout.md
    - implementations/app-jboot-next-platform/agents/backend-contract-client.md
    - implementations/app-jboot-next-platform/modules/kanban/agents/kanban-board-ui.md
  using_skill:
    - implementations/app-jboot-next-platform/skills/next-module-pattern.md
    - implementations/app-jboot-next-platform/skills/platform-design-system.md
    - implementations/app-jboot-next-platform/skills/api-client.md
    - implementations/app-jboot-next-platform/modules/kanban/skills/kanban-board-ui.md
```

## Rotas

- `/flow` — home do modulo Flow (Sprint 6: dashboard de metricas agregadas dos cards do tenant, filtravel por board/responsavel/status; ver `docs/product/kanban-sprint-6-gate.md`)
- `/flow/boards` — listagem de boards do tenant (conteudo que antes vivia em `/flow`, movido na Sprint 6)
- `/flow/boards/:id` — board Kanban (colunas, cards, drag-and-drop, realtime)
- `/flow/boards/:id?card=:cardId` — mesma rota do board, com card aberto em modal/slide-over (ver "Card Modal E Deep-Link")
- `/flow/boards/:id/settings` — configuracao do board pelo `board_admin` (colunas, campos, workflow, permissoes)
- `/flow/boards/:id/settings/profiles` — administracao de `MemberProfile` por board (Sprint 3): CRUD de perfis, `MemberProfileTransition`, `can_delete_archived_cards`, `can_review_documents` (CRM de leads, Sprint 2), `BoardColumnPermission` por perfil, atribuicao de perfil a `BoardMember`.
- `/flow/escritorios` — escritorios do tenant (CRM de leads, Sprint 3.5), somente `flow:admin`: abas Escritorios (CRUD no padrao `skills/platform-crud-ui.md`, inativar sem excluir), Usuarios (vinculo usuario -> um ou mais escritorios) e Ativacao (pre-visualizacao de cards e usuarios sem escritorio, atribuicao em lote por quadro, ligar/desligar com confirmacao). Item de menu "Escritórios" so para quem tem `flow:admin` no token (navegacao; a barreira e o backend).
- `/flow/usuarios` — cadastro e manutencao de usuarios do modulo pelo `ModuleUserManager`; item "Usuários" no sidebar somente com `users:manage` no token.
- `/flow/configuracoes/ia/credenciais` e `/flow/configuracoes/ia/agentes` — cofre BYOK e agentes versionados no submenu `Configuracoes -> IA`, visiveis apenas com scopes dedicados; segredo e prompt sao write-only. A listagem de agentes oferece modal `Testar` read-only: envia uma mensagem ao gateway com JWT Flow, mostra texto/JSON e diagnostico sanitizado, sem persistir historico de conteudo.
- A modalidade primaria planejada e `ChatGPT Plan`, vinculada por consentimento
  OAuth quando o JBoot obtiver aprovacao comercial; `API key` permanece opcional
  e a UI nunca faz fallback silencioso entre modalidades. Nao exibir botao de
  conexao antes de client ID/scopes/callbacks reais estarem aprovados.
- Em desenvolvimento, a identidade do operador designa sua propria conexao. Em
  producao, cada tenant designa a identidade responsavel; a UI exibe owner,
  status, uso pelo plano e revogacao sem expor token ou permitir grant cruzado.
- `/flow/clientes` — etapa "Documentos" no modal do cliente (`CustomerDocumentsStep`, ADR 017): catalogo fixo, marcacao de comprovante de terceiro, progresso "x de N"; no cadastro novo os arquivos ficam na fila e sobem apos salvar (falha reabre em edicao), na edicao cada envio grava na hora. CPF obrigatorio na criacao e editavel so quando o cliente ainda nao tem.
- `/flow/clientes` — etapa "Validação" no modal (`CustomerValidationStep`): status da ficha, escolha do escritório quando o cliente tem mais de um (ADR 018), "Validar dados" (so com documentos completos e rotina configurada), parecer por documento, link da sessão no Claude e "Confirmar validação" so com `flow:validation:approve`; atualiza a cada 15 s enquanto em validação. O "Validar" da lista abre esta etapa quando o cliente tem mais de um escritório. Órgão emissor do RG aceita até 120 caracteres na ficha e no cliente do card (mesmo limite do BFF). Campos preenchidos pela IA (`APPLIED_FIELD_LABEL`) incluem o endereço do comprovante (CEP, logradouro, número, complemento, bairro, cidade, UF), que substitui o endereço da ficha (o documento prevalece; jurídicos só preenchem campo vazio); o endereço não está no formulário de `/flow/clientes`, é editado no cliente do card (`CardCustomerModal`). Data de nascimento na ficha de `/flow/clientes` é exibida e digitada como DD/MM/AAAA e vai à API como AAAA-MM-DD (`lib/br-date.ts`, também no resumo do cliente do card).
- `/flow/configuracoes/ia/validacao-cadastro` — `flow:admin` escolhe o agente de rotina da conta principal (reserva) e, em "Contas Claude dos escritórios", o agente de cada escritório com os responsáveis e alerta sem responsável (ADR 018); copia o prompt da rotina; a página do conector ganha a liberação de leitura de documentos com aceite próprio.
- `/flow/escritorios` — aba Usuários: marcação "Responsável pelo escritório" por vínculo (ADR 018).
- `/flow/clientes` — etapa "Validação", cartão "Valores do kit" (ADR 019, Sprint 2 de `docs/product/flow-office-service-contract-sprints.md`): uma linha por tag do modelo do escritório usado no parecer aprovado, gênero e Termo de Renúncia (JEC/JEF), sugestão da IA visível quando alterada; editável e salvo só com `flow:validation:approve` e só antes da confirmação (depois, só consulta: o kit sai na confirmação). Depois de confirmar, o aviso do card de entrada diz quem virou responsável do card (responsáveis do escritório) e quem ficou de fora e por quê; aviso do kit do escritório (Sprint 4): motivo de não gerar, envio ao Drive e campos que ficaram `[[CAMPO]]` para o advogado; o modal de confirmação diz que o kit é gerado. Pendências gerais e alertas do parecer em listas. Etapa "Documentos": selo "Não conferido pela IA" para documento não liberado à rotina.
- `/flow/configuracoes/ia/validacao-cadastro` — cartão "Documentos que a rotina de validação pode ler" (`flow:admin`); a regra "Executar agente" de rotina Claude ganha a mesma lista (componente `CustomerDocumentTypeChecklist`).
- Modal do card — seção "Ações identificadas" (`CardActionAnalysisPanel`, `docs/product/flow-action-analysis-sprints.md`, A1): ações por bloco do cliente (Caixa, E, A, B, C, D) com contagem, contratos, contrato-raiz e observações; se a análise contou como conclusão sem erro da IA; motivo da análise não concluída. Somente leitura; sem análise, a seção não aparece. Regras de automação: gatilho "Quando a IA concluir a automação sem erro" com a ação "Ir para a coluna" (coluna de destino; `docs/product/flow-ai-completion-sprints.md`), e botão Editar na lista de regras. "Resultado esperado" (Comentário, Análise de ações, Petições iniciais; as duas últimas só para rotina Claude) e, só em Petições iniciais, "Quem gera o documento" (Flow padrão ou IA), com o aviso do modal e o critério de "concluir sem erro" pelo resultado escolhido (ADR 020, S1 de `docs/product/flow-initial-petitions-sprints.md`).
- `/flow/clientes` — passo "Ações ajuizadas" do modal de cliente (`CustomerPriorLawsuitsStep`, S2 de `docs/product/flow-initial-petitions-sprints.md`): ações já ajuizadas (banco, processo CNJ) com inclusão e remoção, confirmação "Cliente não tem ações anteriores" só com a lista vazia, desfazer a confirmação e histórico; cliente novo no Flow já vem com "sem ações anteriores" marcado por padrão (`declaration.origin = default`, texto e botão "Desmarcar" próprios; 2026-10-29); grava na hora, sem `<form>` próprio (vive dentro do formulário do cliente); leitura sem os botões para quem não tem `flow:customers:write`/`flow:admin`.
- Modal do card — seção "Petições iniciais" (`CardInitialPetitionsPanel`, S5 de `docs/product/flow-initial-petitions-sprints.md`): peças da execução mais recente com JEC/JEF, banco, situação (pendente de aprovação, aprovada), Baixar e Aprovar (só com `flow:petition:approve`/`flow:admin`, com confirmação), e o relatório (pendências XXXX, decisões pendentes, alertas, juízo a conferir, contratos fora, temas sem ementa, julgados com link). S7/S8: aviso "Fecho incompleto" com onde resolver cada pendência; "Enviar corrigida" (`CorrectedPetitionModal`, mesma permissão de aprovar) até a petição ter protocolo, com a versão corrigida exibida quando maior que 1. Na seção "Ações identificadas", cada ação mostra a petição que virou ou o motivo de ficar sem peça.
- `/flow/usuarios` — botão "Advogado" por usuário e coluna "OAB" (`FlowUserLawyerModal`, S7 de `docs/product/flow-initial-petitions-sprints.md`): nome para assinatura e uma OAB por UF; só aparece para `flow:admin`. `/flow/escritorios`: cidade e UF no modal do escritório (local do fecho); a aba "Advogados" saiu na S7.
- `/flow/escritorios` — aba "Contrato Serviços" (`docs/product/flow-office-service-contract-sprints.md`, Sprint 3; `flow:admin`): envio do `.docx` do kit do escritório (mesmo campo de arquivo e regras de 10 MB dos modelos de documento), arquivo atual com "Baixar", cartões "Tags" (tags detectadas, linha dos contratos, blocos, tags fora do formato e avisos) e "Marcas de gênero e plural" (reconhecidas e as que ficam com o texto original). "Versões": `.docx` baixa; versão do editor antigo (HTML) abre só para consulta, sem restaurar. O editor Quill saiu da aba.
- `/flow/configuracoes/envios-email` — Envios de e-mail das automacoes (Sprint 13 de `docs/product/kanban-sprints.md`): contadores do outbox, falhas e fila com Reprocessar, no padrao do painel operacional do Google Drive (registry `module-settings`, scope `flow:admin`).
- `/flow/configuracoes/ia/conector-claude` — Conector Claude (`docs/product/kanban-claude-connector-sprints.md`): URL e passo a passo para todo usuario Flow (registry `module-settings`, scope `flow:read`), politica da empresa (ligar, aceite, mascaramento) so com `canManage` vindo do BFF, e "Minhas conexoes" com revogacao (chamadas ao Identity com o token Flow).
- `/oauth/consentimento` — consentimento OAuth do conector, fora do layout com menu e fora do matcher do `middleware.ts` (a propria tela trata ausencia de sessao levando ao login do Identity Admin com `returnTo`). Identifica o app pelo host do `client_id`; alerta para redirect loopback.
- `/flow/leads` — leads do tenant (CRM de leads, Sprints 4 e 5), somente `flow:admin`: abas Fila (fila do gestor com filtros por estado, escritorio, quadro e data de envio, paginada no backend; "Abrir" leva ao card pelo deep-link `?card=`), Tipos de caso (CRUD no padrao `skills/platform-crud-ui.md`, Sprint 5), Modelos (CRUD de modelos `.docx` com versoes e catalogo de variaveis, Sprint 5) e Configuracao (campos cadastrais obrigatorios do envio por tenant e captacao de leads ligada/desligada por quadro). Item de menu "Leads" (`ri-inbox-archive-line`) so com `flow:admin` no token.
- `/flow/boards/:id/settings/documents` — checklist de documentos do quadro (CRM de leads, Sprint 2): CRUD dos tipos no padrao `skills/platform-crud-ui.md`, "Aplicar lista inicial" e flag `requires_complete_checklist` por coluna. Somente `board_admin`.

## Card Modal E Deep-Link

- Criacao/edicao de card e modal/slide-over sobre o board — nunca navega para uma tela nova nem desmonta o board por tras do modal.
- Ao abrir um card, o id do card e refletido na URL via query param `?card=:cardId` (ex.: `/flow/boards/:boardId?card=:cardId`), usando shallow routing do Next.js (sem refazer data fetching do board inteiro).
- Refresh da pagina com `?card=:cardId` na URL deve reabrir o mesmo card no mesmo modal/slide-over (deep-link/compartilhamento de link funcional).
- Fechar o modal remove o query param da URL (shallow), retornando a vista normal do board.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:kanban` (Sprint 1/2/3 — sem anexos)
  - purpose: login, selecao no Identity e navegacao do modulo Flow (Kanban).
  - containers:
    - required: `postgres`, `valkey`, `jboot`.
    - optional: `otel-collector` quando a sprint exigir observabilidade.
    - forbidden_by_default: `mongodb`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
    - optional: nenhum.
    - forbidden_by_default: workers e BFFs standalone — Kanban nao tem app process dedicado.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET /health` em Identity e Platform; abrir `/flow`.
  - seed_dependencies: `014_identity_flow_dev_seed.sql` (application `flow`, entitlement administrativo do `Operador Senior`, cpf `00000000191`, no cliente `JBoot` cnpj `63784101000110`, e entitlement administrativo do `Usuario Teste`, cpf `00011122233`, no cliente `Demo JBoot` cnpj `22345678000199`).
  - expected_resource_profile: medio, sem stack de fila/realtime multi-instancia.

- target: `code-up:kanban-attachments` (Sprint 4+ — com anexos)
  - purpose: navegacao do modulo Flow incluindo upload/visualizacao de anexos no historico do card.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `minio`.
    - optional: `otel-collector`.
    - forbidden_by_default: `mongodb`, `rabbitmq`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
    - optional: nenhum.
    - forbidden_by_default: workers e BFFs standalone.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`, `9000`, `9001`.
  - healthchecks: `GET /health` em Identity e Platform; abrir `/flow`; `GET /minio/health/live`.
  - seed_dependencies: mesmas da Sprint 3, mais bucket `kanban-card-attachments` provisionado pelo backend.
  - expected_resource_profile: medio-alto.

- target: `code-up:kanban-leads` (CRM de leads, Sprint 6+ — documento gerado e PDF)
  - purpose: navegacao do CRM de leads completo, incluindo painel "Analise (gestor)" e "Documentos aprovados" no card.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `jboot-fiscal`, `minio`, `gotenberg` (conversor de PDF do backend; sem porta publicada, o navegador nunca o acessa).
    - optional: `otel-collector`, `mailpit`.
    - forbidden_by_default: `mongodb`, `rabbitmq`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `temporal-ui`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
    - optional: nenhum.
    - forbidden_by_default: workers e BFFs standalone.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`, `9000`, `9001`.
  - healthchecks: os do `kanban-attachments` + healthcheck do `gotenberg` no compose (detalhe no contrato do bff).
  - seed_dependencies: as do `kanban-attachments` + `066_kanban_lead_analysis_documents.sql`.
  - expected_resource_profile: alto (Gotenberg limitado a 1 CPU / 1 GB).

### Rules

- `make code-restart TARGET=kanban` reinicia somente os processos Identity/Platform exigidos pelo modulo (Sprint 1-3).
- `make code-restart TARGET=kanban-attachments` inclui o container `minio` (Sprint 4+).
- WebSocket gateway do Kanban roda dentro do processo `platform-api`; nao ha processo dedicado para realtime no MVP.

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

## Contratos

- Fonte de verdade local: `implementations/app-jboot-next-platform/modules/kanban/MODULE_CONTRACT.md`.
- Isolamento (Sprint 3.5): tenant + membresia do quadro + escritorio do card, conforme a secao "Escritorios E Visibilidade Por Escritorio" do contrato do bff; a UI nunca filtra por seguranca.
- Contexto compacto: `implementations/app-jboot-next-platform/modules/kanban/AI_CONTEXT.md`.
- Consome `bff-jboot-platform/modules/kanban`.
- API base: `NEXT_PUBLIC_JBOOT_PLATFORM_API_URL` (padrao: `http://127.0.0.1:8010`).
- AI Gateway base: `NEXT_PUBLIC_JBOOT_AI_GATEWAY_API_URL` (derivada de `JBOOT_AI_GATEWAY_PORT`, padrao `http://127.0.0.1:8050`); chamadas manuais usam o JWT Flow e nunca recebem API key.
- WebSocket base: mesmo host/porta do `platform-api`, namespace `/flow/ws`.
- Auth via cookie `authUser` (padrao da platform).
- Contratos de produto/API por sprint: `docs/product/kanban-sprints.md`, `docs/product/kanban-sprint-1-gate.md`, `docs/product/kanban-sprint-3-gate.md`, `docs/product/kanban-sprint-4-gate.md`, `docs/product/kanban-sprint-5-gate.md`, `docs/product/kanban-sprint-6-gate.md`, `docs/product/kanban-sprint-7-gate.md`, `docs/product/kanban-sprint-8-gate.md`, `docs/product/kanban-sprint-9-gate.md`, `docs/product/kanban-sprint-10-12-gate.md`, `docs/data/kanban-sprint-1-data-model.md`, `docs/data/kanban-sprint-3-data-model.md`, `docs/data/kanban-sprint-4-data-model.md`, `docs/api/kanban-sprint-1-openapi.yaml`, `docs/api/kanban-sprint-3-openapi.yaml`, `docs/api/kanban-sprint-4-openapi.yaml`.
- Uso da assinatura ChatGPT e automacao por agente:
  `docs/product/chatgpt-plan-usage-sprints.md`.
- CRM de leads (cliente final vinculado ao card, checklist de documentos, escritorios, envio do lead e fila do gestor): `docs/product/flow-crm-leads-sprints.md`, `docs/product/sprint-juridico-flow.md`, `docs/product/flow-juridico-uiux-decision.md` (proposta), `docs/product/flow-crm-leads-sprint-4-9-gate.md`, `docs/architecture/decisions/015-flow-shared-customers-drive-ai-boundaries.md` (proposta), `docs/api/flow-juridico-foundation-openapi.yaml` (proposta), `docs/api/flow-crm-leads-sprint-1-openapi.yaml`, `docs/api/flow-crm-leads-sprint-2-openapi.yaml`, `docs/api/flow-crm-leads-sprint-3-openapi.yaml`, `docs/api/flow-crm-leads-sprint-3-5-openapi.yaml`, `docs/api/flow-crm-leads-sprint-4-openapi.yaml`, `docs/api/flow-crm-leads-sprint-5-openapi.yaml`, `docs/api/flow-crm-leads-sprint-6-openapi.yaml`.
- Documentos da ficha do cliente, validacao por agente e Drive: `docs/product/flow-customer-documents-sprints.md`, `docs/architecture/decisions/017-flow-customer-documents-validation-drive.md`.
- Analise de Acoes no card: `docs/product/flow-action-analysis-sprints.md`, `docs/api/flow-action-analysis-openapi.yaml`.
- Peticoes iniciais pela rotina (regra com Resultado esperado e Quem gera o documento; acoes ja ajuizadas e advogados por UF): `docs/product/flow-initial-petitions-sprints.md`, `docs/architecture/decisions/020-flow-initial-petitions-generator.md`, `docs/api/flow-initial-petitions-openapi.yaml`.
- Atualizacao em tempo real do que a IA grava (board, modal do card e ficha do cliente recarregam sozinhos): `docs/product/flow-realtime-card-updates-sprints.md`. `BoardView` ouve `card.updated` (recarga dos cards com 400 ms para juntar avisos e `liveUpdate` para o `CardModal`); o modal passa `reloadKey` a Cliente, Analise de Acoes, Peticoes, Documentos e Historico; `FlowCustomersPage` ouve `customer.updated` e recarrega a lista e a validacao aberta.
- Conector Claude: `docs/product/kanban-claude-connector-sprints.md`, `docs/api/kanban-claude-connector-openapi.yaml`, `docs/runbooks/flow-claude-connector.md`. Consome tambem `bff-jboot-identity` (`/oauth/requests/*`, `/oauth/grants*`) via `NEXT_PUBLIC_JBOOT_IDENTITY_API_URL`.
- Integracoes de dominio para Flow: `docs/product/domain-flow-integration-sprints.md`, `docs/product/domain-flow-integration-sprint-1-gate.md`, `docs/data/domain-flow-integration-sprint-1-data-model.md`, `docs/api/domain-flow-integration-sprint-1-openapi.yaml`.

## Decisoes De Contexto E UX

- Drag-and-drop de card entre colunas deve refletir em tempo real para outros usuarios conectados ao mesmo board (WebSocket), sem exigir reload manual.
- Customizacao de estrutura do board (colunas, campos, workflow, permissoes) e exclusiva de `board_admin`; usuario final (`board_member`/`board_viewer`) so opera cards dentro da estrutura definida.
- Se houver duvida se uma informacao deve ser inferida pelo contexto ou escolhida pelo usuario, interromper a implementacao e pedir validacao do usuario antes de criar controle novo.
- Nao supor regra de negocio ou UX quando houver ambiguidade relevante; pedir interacao com o usuario e registrar a decisao no contrato ou sprint correspondente.
- Criacao/edicao de card e sempre modal/slide-over sobre o board (ver "Card Modal E Deep-Link"); nunca criar rota de pagina cheia dedicada a um card individual.
- A partir da Sprint 3, colunas/acoes visiveis no board devem refletir a ACL do `MemberProfile` do usuario logado (`BoardColumnPermission`), nao mais um mapeamento fixo por papel — UI nunca duplica essa logica localmente, sempre consome a resposta do backend (board/colunas ja filtradas) e os campos de capacidade do usuario atual.
- A partir da Sprint 4: aba/secao de historico do card exibe `CardActivity` (comentarios + eventos de sistema) em ordem cronologica unica, composer de comentario com upload de anexo vinculado ao registro do feed, e lista de responsaveis (`CardAssignee`) com avatar/badge, com atribuir/remover livre entre membros ativos do board.
- A partir da Sprint 7: Header da platform deve renderizar o dropdown real de notificacoes apenas quando `useCurrentModule()` retorna `flow`; demais modulos seguem com o dropdown/template padrao. `CardModal` edita `dueDate`, o board mostra badge de vencimento/atrasado, e a Home mostra a metrica `overdueCount`.
- A partir da integracao de dominio Sprint 1: todo board novo possui coluna padrao `BACKLOG` recuperavel pelo backend. A UI pode permitir renomear a coluna, mas nao deve depender do nome para decidir destino de importacao.

## Cliente Do Card (CRM De Leads, Sprint 1+)

Implementado em 2026-10-10 (`docs/product/flow-crm-leads-sprints.md`, contrato
`docs/api/flow-crm-leads-sprint-1-openapi.yaml`).

- Painel "Cliente" no topo da coluna esquerda do `CardModal` (`CardCustomerPanel`),
  com dado geral visivel e juridico recolhivel (`CardCustomerSummary`).
- Modal `CardCustomerModal` (vincular, trocar, editar) no padrao de
  `skills/platform-crud-ui.md`: steps sem numero com icone, footer
  `Cancelar`/`Salvar` (ou `Vincular`). Busca por CPF trata `not_found` (cadastro),
  `found` (dados + vincular) e `outside_boards` (so a mensagem "Cliente cadastrado
  fora dos seus quadros", sem acao de vinculo).
- Client tipado `kanbanApi.cardCustomer` (`get`, `lookup`, `link`, `update`);
  CPF somente no corpo da requisicao. Erro estruturado via `KanbanApiError`
  (`status`, `code`, `detail`).
- A UI nao decide visibilidade nem permissao: usa `canEdit` e os status do backend.
- Override do admin do tenant (Sprint 3): quando o lookup devolve
  `outside_boards` com `canOverride: true`, o modal mostra "Vincular como
  administrador" com motivo obrigatorio (10..500 caracteres apos trim, espelho
  de `lib/card-customer-form.ts`) e aviso de que a acao e auditada; envia
  `{ cpf, override: { reason } }`. Sem `canOverride` a mensagem de
  `outside_boards` e a mesma de antes. Erros `override_not_allowed` e
  `override_requires_existing_customer` tem mensagem pt-BR
  (`describeOverrideError`).

## Sem Acesso Ao Quadro (Correcao De Seguranca 2026-10-10)

O backend exige membresia ativa para ler conteudo do quadro (403
`board_membership_required`). `BoardView` mostra "Sem acesso a este quadro"
quando `currentUserRole` e `null` ou a leitura responde 403 e so carrega cards e
conecta o realtime depois de confirmar a leitura (`lib/board-access.ts`). A UI
nao decide membresia; apenas reage ao backend.

Desde o Backlog T6 (2026-10-11) o backend aceita `board.join` de `board_viewer`
ativo; o `BoardView` ja conectava o socket para qualquer leitor, entao o viewer
passa a receber `card.moved` sem mudanca no app. Desde o Backlog T7 (2026-10-11) a UI nao
oferece mutacao ao `board_viewer` (`lib/board-permissions.ts`
`canMutateBoard(currentUserRole)`): sem arrastar card, sem "Novo card", modal do
card somente leitura (sem salvar, arquivar, monitorar, atribuir, comentar ou
anexar); arrastar coluna e so `board_admin`. Esconder acao e UX; o backend
continua recusando com 403. Upload recusado por assinatura (415 `content_signature_mismatch`,
Backlog T5) mostra mensagem pt-BR via `describeKanbanError` no painel de
documentos e no anexo do historico.

## Escritorios E Visibilidade Por Escritorio (CRM De Leads, Sprint 3.5)

Implementado em 2026-10-12 (`docs/product/flow-crm-leads-sprints.md`, contrato
`docs/api/flow-crm-leads-sprint-3-5-openapi.yaml`). Substitui a regra
"isolamento so por quadro": a visibilidade de card e decidida SO pelo backend
(`CardVisibilityService`); a UI apenas reage ao contexto
(`kanbanApi.offices.context`) e aos erros estruturados.

- `BoardView`: carrega o contexto de escritorio junto do quadro (falha nao
  bloqueia o quadro); selo do escritorio no tile (`ri-building-line`,
  `badge-soft-info`); filtro "Todos/Sem escritorio/<escritorio>" so para
  `flow:admin`, aplicado sobre os cards ja visiveis; usuario sem escritorio (chave
  ligada, sem `flow:admin`) ve o aviso "Seu usuario nao esta vinculado a um
  escritorio. Procure o administrador." e nao ve "Novo card".
- `CardModal` (criacao): `lib/offices.ts` `newCardOfficeChoice` — sem chave =
  nada; um escritorio = texto informativo (o backend escolhe); varios ou admin =
  select obrigatorio; sem escritorio ativo = aviso e Salvar desabilitado.
- `CardModal` (edicao): linha "Escritorio" (ou "Sem escritorio") e, para
  `flow:admin`, "Transferir"/"Atribuir escritorio" (`CardOfficeTransferModal`:
  destino ativo + motivo 10..500, espelho do backend; acao auditada).
- `CardAssigneesPanel` usa `kanbanApi.assignees.candidates` (so quem ve o card);
  antes dependia de `members.list`, que exige `flow:admin`.
- `CardCustomerModal`: `found` com `crossOffice` mostra o aviso; com
  `canOverride` (admin) pede motivo e envia `override`; sem ele, so o aviso e sem
  acao de vinculo. Mensagem de `outside_boards` passa a "Cliente cadastrado fora
  do seu escritorio ou dos seus quadros. Procure a central."
- Erros `user_without_office`, `office_required`, `office_not_allowed`,
  `no_active_office`, `office_name_taken`, `identity_not_in_card_office`,
  `cross_office_*` com mensagem pt-BR (`describeOfficeError`,
  `describeOverrideError`).

## Envio Do Lead E Fila Do Gestor (CRM De Leads, Sprint 4)

Implementado em 2026-10-12 (`docs/product/flow-crm-leads-sprints.md`, contrato
`docs/api/flow-crm-leads-sprint-4-openapi.yaml`). A regra (o que falta, quem
envia, quem devolve, o que congela) e do backend; a UI so exibe e usa
`canSubmit`/`canReturn`/`editable`/`readiness`.

- `CardLeadPanel` no topo da coluna esquerda do `CardModal` (so em quadro com
  captacao ligada ou lead que ja teve envio, `lib/leads.ts`
  `shouldShowLeadPanel`): estado (`LeadStatusBadge`), lista do que falta
  (cliente, campos e documentos), "Enviar para analise"/"Reenviar", motivo da
  devolucao, aviso de bloqueio e de cadastro alterado depois do envio,
  "Devolver ao escritorio" (admin, `LeadReturnModal`: motivo 10..500 apos trim,
  espelho do backend) e envios anteriores.
- Lead congelado: `CardModal` deixa titulo, descricao e vencimento somente
  leitura e esconde Salvar/Arquivar; paineis Cliente/Documentos remontam apos
  envio/devolucao para refletir `canEdit`/`canUpload` do backend.
- Tile: `LeadStatusBadge` com `CardDto.leadStatus` (nada sem envio).
- Historico: `card.lead_submitted` e `card.lead_returned` (com o motivo).
- Erros `lead_incomplete` (lista legivel), `lead_frozen`,
  `lead_intake_disabled`, `lead_not_submittable`, `lead_not_returnable`,
  `lead_admin_required`, `invalid_lead_fields` com mensagem pt-BR
  (`describeLeadError`, via `describeKanbanError`).
- Client tipado: `kanbanApi.leads` (`get`, `submit`, `returnToOffice`, `queue`,
  `settings`, `updateSettings`) e `kanbanApi.boards.update` (`leadIntakeEnabled`).

## Tipos De Caso E Modelos De Documento (CRM De Leads, Sprint 5)

Implementado em 2026-10-12 (`docs/product/flow-crm-leads-sprints.md`, contrato
`docs/api/flow-crm-leads-sprint-5-openapi.yaml`). Toda validacao do modelo e do
backend (pacote, macro, vinculo externo, catalogo, render de prova); a UI so
pre-valida extensao e tamanho e traduz os codigos.

- `CaseTypesPanel` (aba Tipos de caso): listagem (tipo, modelo padrao, modelos
  vinculados, situacao) e modal `xl` com steps Dados gerais
  (`ri-file-text-line`), Classificacao (`ri-price-tag-3-line`: criterios e
  evidencias esperadas) e Modelos (`ri-file-list-3-line`: vincular e escolher o
  padrao; o primeiro vinculado vira padrao, `lib/document-templates.ts`
  `toggleCaseTypeTemplate`). Inativar/Reativar, sem exclusao. Comeca vazio (P1).
- `DocumentTemplatesPanel` (aba Modelos): listagem (modelo, versao atual,
  "Pronto para uso"/"Variaveis desconhecidas"/"Sem arquivo", tipos de caso,
  situacao), botao "Variaveis disponiveis" (`TemplateVariablesCatalogModal`:
  catalogo por namespace, uso pronto para copiar, exemplo ficticio) e modal `xl`
  com steps Dados gerais, Arquivo e versoes (`ri-file-word-line`: envio de nova
  versao ao salvar, historico com detalhes e download) e Variaveis
  (`ri-braces-line`: detectadas, fora do catalogo, obrigatoria/opcional).
  Upload recusado mantem o modal com a lista do backend; versao com variavel
  desconhecida ou aviso mantem o modal aberto com o alerta.
- Pre-validacao (espelho de `TEMPLATE_LIMITS` do backend): `.docx` e 10 MB em
  `lib/document-templates.ts`; alterar junto com o backend.
- Erros `template_*`, `case_type_name_taken`, `template_not_allowed`,
  `default_template_not_linked` com mensagem pt-BR (`templateErrorDetails`,
  `describeTemplateError`, via `describeKanbanError`).
- Client tipado: `kanbanApi.caseTypes` (`list`, `get`, `create`, `update`) e
  `kanbanApi.documentTemplates` (`catalog`, `list`, `get`, `create`, `update`,
  `uploadVersion`, `getVersion`, `updateVariables`, `download`).

## Analise Do Lead E Documentos Aprovados (CRM De Leads, Sprint 6)

Implementado em 2026-10-12 (contrato `docs/api/flow-crm-leads-sprint-6-openapi.yaml`;
client `kanbanApi.leadAnalysis` e `kanbanApi.leads.documents|downloadDocument`;
regras de tela em `lib/lead-analysis.ts`). No `CardModal`, abaixo do painel
"Envio para analise", quando o lead ja teve envio:

- `flow:admin` (dica pelo scope do token; o backend exige em toda rota): painel
  `CardAnalysisPanel` "Analise (gestor)": classificar/adicionar caso (tipos
  ativos, sem repetir), por caso o modelo (padrao pre-selecionado; inutilizavel
  desabilitado com motivo) e "Gerar documento"/"Gerar nova versao"; documento
  vigente com estado, origem, campos opcionais sem valor, PDF (gerando, gerado,
  "PDF pendente" com "Gerar PDF novamente"), "Baixar .docx/PDF", "Aprovar" e
  "Substituir por versao editada" (`LeadDocumentUploadModal`: a versao enviada
  nasce aprovada); versoes anteriores e casos trocados/removidos recolhidos;
  troca e remocao de caso com motivo auditado (`LeadCaseReasonModal`).
- Demais leitores do card (escritorio): `CardLeadDocumentsPanel` "Documentos
  aprovados" com o titulo do modelo, versao, data e download `.docx`/PDF ("PDF em
  preparacao" enquanto nao gerado). Sem classificacao, rascunhos ou historico de
  geracao (P11); o painel some sem documento aprovado.
- Historico do card: rotulos dos eventos novos (`CardHistoryPanel`); os de
  classificacao e geracao so chegam ao gestor (filtro do backend).
- Testes: `lib/lead-analysis.spec.ts`, `lib/kanban-api.lead-analysis.spec.ts`.

## Checklist De Documentos (CRM De Leads, Sprint 2+)

Implementado em 2026-10-10 (`docs/product/flow-crm-leads-sprints.md`, contrato
`docs/api/flow-crm-leads-sprint-2-openapi.yaml`).

- Painel "Documentos" (`CardDocumentsPanel`) abaixo do painel "Cliente" no
  `CardModal`: estado por item (pendente/enviado/aceito/rejeitado com motivo),
  completude, envio por item com dois seletores (arquivo sem `capture` e foto com
  `capture="environment"`) e aceitar/rejeitar com motivo. Botoes so conforme
  `canUpload`/`canReview` do backend; a UI nao decide permissao.
  Acima do checklist, item "Kit do escritorio" (ADR 019, decisao 19 revisada em 2026-10-30): o kit mais
  recente do cliente do card, nome do `.docx` como link de download (URL assinada aberta em nova aba) e
  badge "Gerado em DD/MM/AAAA"; sem kit ou sem cliente, o item nao aparece. Falha ao carregar o kit nao
  bloqueia o checklist. O aviso do kit na etapa Validacao e o modal de confirmacao apontam o card.
  Selo "SEM HISCON" (`MissingHisconBadge`, `bg-danger-subtle`, P1 de
  `docs/product/flow-customer-promobank-sprints.md`) no tile (`CardDto.customerWithoutHiscon`) e no painel
  Cliente, com "Enviar HISCON" quando `canUpload` (grava na ficha do cliente). Mover para coluna com regra
  "Exigir para entrar" nao cumprida devolve `column_requirements_unmet`; a mensagem lista os requisitos e, para
  o HISCON, aponta o painel Cliente. Editor de regras da coluna: acao "Exigir para entrar" (so com o gatilho
  de entrada), com os requisitos marcaveis (S1 de `docs/product/flow-signed-kit-sprints.md`). Ficha do
  cliente, etapa Documentos: item Promobank; HISCON e Promobank marcados "um dos dois", o outro fica
  "Opcional" quando um ja foi enviado; a etapa Validacao lista a falta como "HISCON ou Promobank".
  No item do kit, secao "Kit assinado" (`CardSignedKitSection`, S2 de `docs/product/flow-signed-kit-sprints.md`):
  enviar o kit assinado (PDF ou imagem) ou nova versao, link do assinado, situacao do Validador de assinatura
  (validando, IA aprovou aguardando confirmacao, pendencias com os itens, nao concluida com o motivo, aprovado),
  orientacao para usar a acao "Validar assinatura" e "Confirmar assinatura" (`ConfirmActionModal`) conforme o
  backend. Tile com selo
  "ASSINATURA PENDENTE" (`SignedKitPendingBadge`, `bg-warning-subtle`). S5: a validacao parte da acao "Validar
  assinatura" (Acoes por coluna); no "Editar" da coluna, acao com `config: routine_agent` mostra o select de agentes
  de rotina da conta (`columnAgentDrafts`/`columnActionConfigs`) e so salva com agente; o bloco "Validador de
  assinatura" da Validacao de cadastro saiu. Editor de regras
  da coluna: gatilho "Quando o kit assinado for aprovado", so com "Ir para a coluna" (S3). Item do kit com a
  situacao do e-mail ao cliente (na fila, enviado, falhou: baixe e envie manualmente); Escritorios -> Contrato
  Servicos ganha "Envio do kit ao cliente" (`OfficeKitEmailSettings`: ligado, assunto, texto) (S4).
  Abaixo do checklist, secao "Outros documentos" (`docs/product/flow-card-extra-documents-sprints.md`, D1):
  avulsos com descricao opcional, nome do arquivo como link de download e data; "Adicionar documento" com
  campo "Descricao (opcional)" quando `canUpload`; "Remover" (`soft-danger`) so quando `canRemove`, com
  `ConfirmActionModal` que avisa a lixeira do Drive. Historico: "adicionou/removeu um documento avulso".
- Tile do card mostra `aceitos/total` obrigatorios (`CardDto.documentChecklist`);
  coluna com `requiresCompleteChecklist` mostra `ri-lock-line`.
- Badge "Checklist pendente" (`ChecklistPendingBadge`, `badge-soft-danger` +
  `ri-error-warning-line`, Sprint 3) no tile (`CardDto.checklistPending`) e no
  cabecalho do painel Documentos do modal (`CardChecklistDto.checklistPending`,
  atualizado a cada envio/revisao). A regra e do backend; a UI so exibe.
- Movimento ou criacao manual bloqueada (422 `checklist_incomplete`) mostra a
  lista de pendentes via `describeKanbanError` e o card volta a coluna de
  origem. Importacao de dominio nao e bloqueada (entra sinalizada).
- Limites de arquivo espelhados em `lib/card-documents.ts` so como pre-validacao;
  alterar junto com `attachments.service.ts` do backend.
- Client tipado: `kanbanApi.documentTypes` e `kanbanApi.cardDocuments`; upload
  multipart lanca `KanbanApiError` com `payload`.

## Anexos (Sprint 4+)

- Upload de anexo e sempre vinculado a um registro existente do feed (`CardActivity`), nunca direto ao card.
- UI nao acessa MinIO diretamente; upload/download passam pelo client tipado do modulo contra o BFF (`bff-jboot-platform/modules/kanban`), que e o unico ponto que fala com o storage.
- Limites de tamanho/tipo de arquivo aceitos pela UI devem refletir exatamente o que o backend aceitar (25 MB e whitelist confirmados em 2026-06-19, `docs/product/kanban-sprint-4-gate.md`); o checklist de documentos usa o espelho em `lib/card-documents.ts`.

## Restricoes

- Nao criar auth propria — herda da platform.
- Nao duplicar regra de autorizacao do backend.
- Nao usar `src/ai` neste modulo — Kanban nao tem feature de IA.
- Usar client tipado proprio do modulo para todos os contratos HTTP/WebSocket com o BFF Kanban.
- Nao importar componentes internos de outro modulo sem contrato explicito.
