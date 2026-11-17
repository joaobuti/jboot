# Flow CRM De Leads Sprints

## Objetivo

Usar o Flow como CRM de leads do cliente juridico (escritorio com bases remotas):
o operador de cada base registra o lead vinculado ao cliente final e anexa a
documentacao por checklist; a central revisa. Elimina o fluxo manual
WhatsApp -> central -> Google Drive.

Ampliado em 2026-10-11 (ver "Redefinicao Da Primeira Fase (2026-10-11)"): a
primeira entrega ao cliente passa a incluir tambem a leitura dos documentos, a
classificacao do caso e a geracao do documento a partir dos modelos do cliente,
revisavel pelo gestor principal (Sprints 4 a 9).

## Decisoes De Escopo Confirmadas (2026-10-09)

- O Flow e tratado como software unico neste arco: sem modulo `juridico`, sem
  worker juridico e sem exportacao de dominio para o Flow.
- Etapas do funil, colunas, transicoes permitidas por perfil e acoes por etapa
  sao configuradas pelo proprio cliente com os recursos existentes do Flow
  (Sprints 1, 3, 8 e 9 de `docs/product/kanban-sprints.md`).
- Isolamento entre bases remotas e feito por quadro: cada base trabalha nos
  proprios quadros e o acesso segue a membresia do quadro (`board_id`). Nao ha
  recurso de "unidade" dentro de um quadro. **Revista em 2026-10-11**: o
  isolamento passa a ser por quadro **e** por escritorio (ver "Sprint 3.5:
  Escritorios E Visibilidade Por Escritorio").
- Cliente final vem do nucleo `establishment-customers`, com dado juridico em
  `customer_juridico` (ADR 013). Pre-requisito: Sprint 1 de
  `docs/product/establishment-customers-sprints.md`.
- Checklist inicial de documentos do cliente: documento pessoal, procuracao,
  declaracao de hipossuficiencia, comprovante de residencia, HISCON,
  HISCRE/HISCRED, confirmacao do cliente (print de WhatsApp) e demais documentos.
- Importacao em massa de leads fica fora: os leads atuais ja sao clientes que
  procuraram o escritorio e enviaram a documentacao basica.
- Desenvolvimento e validacao em ambiente local Docker; a ida para VPS ocorre
  na contratacao do servidor e nao bloqueia este arco.
- 2026-10-09: cliente "cadastrado fora dos seus quadros" nao pode ser vinculado
  pelo usuario a card proprio nem duplicado; o caso volta para a central ou
  `board_admin`. Motivo: vincular tornaria o usuario membro de quadro com card
  do cliente e liberaria os dados a quem apenas conhece o CPF.
- 2026-10-09: unicidade de CPF por tenant validada no servico (CPF normalizado
  so com digitos, busca antes de criar, retorno do existente). Indice unico
  parcial `(client_id, document_number)` so e criado se nao houver duplicados;
  havendo, fica registrado como pendencia, sem alterar dado existente.

### Decisoes Do Usuario (2026-10-11)

- Cliente cadastrado fora dos quadros do usuario pode ser vinculado a um card
  por usuario com scope `flow:admin` (admin do tenant no Flow), com motivo
  obrigatorio e auditoria. Operador comum continua bloqueado (409).
- Coluna padrao com `requires_complete_checklist`: a importacao de dominio
  (DataJud) entra mesmo assim, e o card fica sinalizado como pendente de
  checklist, sem 422.
- `GET /kanban/boards` e `GET /kanban/boards/:id` continuam mostrando nome e
  descricao do quadro a quem nao e membro do tenant; o conteudo segue exigindo
  membresia.
- Premissas do orquestrador e decisoes derivadas da Sprint 2: aprovadas.

## Redefinicao Da Primeira Fase (2026-10-11)

### Pedido Do Usuario

> "A primeira entrega deve obrigatoriamente cobrir a demanda crítica do
> cliente. Hoje essa demanda é: recebimento dos dados dos clientes, envio
> manual dos dados para o drive, leitura dos documentos, classificação do caso
> do cliente e emissão de documento para cada caso. Então, a proposta do CRM é
> abandonar o recebimento dos dados por WhatsApp. Cada escritório, com seu
> próprio usuário, passa a poder cadastrar o cliente e já fazer o envio dos
> dados validados e completos. Esses dados podem ser acessados pelo gestor
> principal e ficam armazenados. A IA orquestradora trata esses dados e gera o
> documento, dentre os modelos de documento que o cliente já tem. Essa é a
> automação que precisamos fazer na primeira fase e entregar ao cliente. As
> adaptações serão feitas no módulo Kanban do JBoot (Flow), não no módulo
> jurídico."

### Consequencias De Escopo

- A primeira fase entregue ao cliente = Sprints 1 a 3 (concluidas) + Sprints 4
  a 9 deste artefato. Sem leitura, classificacao e documento gerado revisavel
  pelo gestor, a fase nao esta entregue.
- Tudo no modulo `kanban` (Flow). Mantida a decisao de 2026-10-09: sem modulo
  `juridico`, sem worker juridico.
- WhatsApp e Google Drive deixam de ser canal: o escritorio cadastra e envia
  pelo Flow, e o Flow e o armazenamento.
- Corrigido o "fora de escopo" da Sprint 2: leitura/validacao de conteudo por
  IA entra no arco (Sprints 7 a 9).
- Para o PE/Architect (nao decidido pelo PO):
  - `implementations/bff-jboot-platform/modules/kanban/MODULE_CONTRACT.md`
    tem a restricao "Nao usar `src/ai` neste modulo — Kanban nao tem feature de
    IA"; ela precisa ser reaberta. Nao existe `src/ai` nesta branch.
  - Integracao com provedor de IA e nova integracao: exige `PO -> PE ->
    Architect -> confirmacao humana`, `Deployment Boundary Gate`/`Stack Fit
    Gate` e `docs/agents/stacks/ai-llm.md` (PII, evals, custo por `client_id`).
  - O motor de automacao por coluna (Sprints 8 e 9 de
    `docs/product/kanban-sprints.md`: regras `trigger_type`/`action_type`, fila
    BullMQ `kanban-column-automation` em worker in-process, idempotencia por
    evento; hoje so `send_email_notification`) e candidato a gatilho do
    processamento (ex.: `action_type` novo). O ato funcional de "Enviar para
    analise" (Sprint 4) e a outra alternativa. A escolha e do PE/Architect.

### Mapa Do Fluxo Atual E Do Fluxo Alvo

| # | Etapa | Hoje no cliente (manual) | Flow hoje (Sprints 1-3) | Alvo da primeira fase | Sprint |
|---|---|---|---|---|---|
| 0 | Acesso por escritorio | cada base manda pelo proprio WhatsApp | isolamento so por quadro | admin cadastra escritorios e vincula usuarios (um ou mais por usuario); card pertence ao escritorio escolhido na criacao; nao-admin ve so os cards dos seus escritorios | S3.5 |
| 1 | Recebimento dos dados | cliente final -> escritorio -> WhatsApp -> central | card + cliente unico por CPF, dado geral e juridico | escritorio cadastra no Flow com usuario proprio | existe (S1) |
| 2 | Envio dos documentos | WhatsApp | checklist por quadro com upload pelo celular | igual | existe (S2) |
| 3 | Conferencia de completude | central confere a mao | revisor aceita/rejeita item; coluna exige obrigatorios **aceitos**; override e sinalizacao | "Enviar para analise" so com cadastro minimo preenchido e obrigatorios **enviados** e nao rejeitados | S4 |
| 4 | Armazenamento e acesso do gestor | download manual para o Drive | arquivo no Flow; gestor so ve se for membro de cada quadro | fila do gestor com os leads enviados por todos os escritorios | S4 |
| 5 | Leitura/extracao | central le cada documento | nao existe | IA confere tipo e legibilidade, extrai campos, aponta divergencia com o cadastro | S7 |
| 6 | Classificacao do caso | central decide | nao existe | IA sugere tipo de caso entre os cadastrados, com justificativa; gestor confirma; incerto vai ao gestor | S5 (cadastro), S6 (manual), S8 (IA) |
| 7 | Escolha do modelo | central escolhe | nao existe | deterministica: tipo de caso -> modelo vinculado; gestor pode trocar | S5, S6 |
| 8 | Geracao do documento | central redige (uso de IA hoje: pergunta P7) | nao existe | modelo preenchido com cadastro + dado extraido; texto redigido por IA so se P2 confirmar | S6 (cadastro), S9 (extraido e automacao) |
| 9 | Revisao e entrega | nao mapeado | nao existe | gestor aprova, edita ou devolve; documento aprovado fica no card em `.docx` e PDF; escritorio notificado | S6 |

Estado da analise do lead (funcional): `rascunho` -> `enviado` ->
`em_processamento` (a partir da S7) -> `aguardando_revisao` -> `aprovado`;
saidas laterais `devolvido` (volta ao escritorio) e `falha_processamento`.
Requisito: a regra de envio completo nao pode depender de o cliente configurar
colunas corretamente. Se o estado vira coluna, campo proprio ou ambos e decisao
do PE/Architect.

### Papeis (Revistos Em 2026-10-11 Com O Conceito De Escritorio)

| Papel | Mapeamento | Pode |
|---|---|---|
| Operador do escritorio | usuario do tenant com `flow:write`, membro do(s) quadro(s) definido(s) pelo admin e vinculado a um ou mais escritorios | cadastrar cliente, anexar documentos, enviar para analise, corrigir pendencia, ver estado do lead e documento aprovado (P11, aprovada); so ve cards dos seus escritorios |
| Administrador = gestor principal (central) | `flow:admin` (P25) | cadastrar escritorios, vincular usuario a escritorio, definir acesso aos quadros, ver todos os cards de todos os escritorios, fila do gestor, revisar, classificar, gerar, aprovar, devolver; tipos de caso, modelos e configuracao de IA (chave do cliente) |
| `board_admin` sem `flow:admin` | papel do quadro | administra estrutura do quadro (colunas, perfis, checklist), mas ve so os cards do proprio escritorio (P25) |
| Revisor de documentos | perfil com `can_review_documents` (S2) | aceitar/rejeitar item do checklist, so nos cards que enxerga |
| IA orquestradora | ator de sistema | ler, extrair, sugerir classificacao, preencher rascunho. Nunca aprova, rejeita formalmente, devolve ao escritorio, altera cadastro nem entrega documento |

Decidido em 2026-10-11 (substitui a premissa P10): escritorio e entidade do
tenant do cliente contratante, cadastrada pelo administrador; cada usuario
pertence a um ou mais escritorios (P22, decisao do usuario; ajuste do
Architect em 2026-10-11); o card pertence ao escritorio escolhido por quem o
cria entre os seus. Um tenant por escritorio continua descartado (impediria a
visao central).

### Regras De Negocio Da Primeira Fase

Itens com `[P]` eram premissas; o estado atual de cada uma esta em "Perguntas
Abertas Da Primeira Fase". Aprovadas em 2026-10-11: P6, P9 (com PDF), P11,
P12, P13, P14, P16, P21.

- R1. Envio completo: "Enviar para analise" so fica disponivel com (a) cliente
  vinculado, (b) campos cadastrais obrigatorios para envio preenchidos [P16] e
  (c) todos os documentos obrigatorios ativos com envio mais recente `enviado`
  ou `aceito`. Tentativa incompleta lista o que falta. Envio registra autor e
  data, notifica o administrador in-app e congela a edicao pelo escritorio ate
  devolucao [P21].
- R2. Disparo da IA [P12]: automatico no envio completo; o gestor pode
  reprocessar manualmente. Documento reenviado ou cadastro alterado depois do
  processamento marca o resultado como desatualizado.
- R3. Aceite manual item a item (S2) nao e pre-requisito da IA [P13]: a IA
  roda sobre o envio completo e o resultado da leitura aparece como sugestao
  para o revisor. A regra de coluna `requires_complete_checklist` nao muda.
- R4. Classificacao: so entre tipos de caso ativos do tenant. Saida com tipo,
  grau de confianca e evidencias (documento e trecho). Confianca baixa ou
  nenhum tipo aplicavel = `aguardando_revisao` sem documento gerado; o gestor
  escolhe o tipo [P14]. O gestor sempre pode trocar a classificacao, com motivo
  auditado.
- R5. Falta de dado:
  - documento ilegivel, de tipo diferente do item ou obrigatorio ausente:
    pendencia visivel ao gestor e ao escritorio como alerta; a devolucao formal
    e humana (rejeicao da S2 ou devolucao do lead) [P];
  - variavel obrigatoria do modelo sem valor: o documento nao e gerado e a tela
    lista os campos faltantes; variavel opcional sem valor sai com marcador
    visivel `[PREENCHER: <campo>]` [P];
  - divergencia entre cadastro e documento (nome, CPF, nascimento, beneficio):
    alerta; o cadastro nunca e alterado automaticamente.
- R6. Revisao humana antes do uso [P6, recomendado]: documento gerado nasce
  `rascunho`; so o `aprovado` e entregue/baixado como final. Nenhum documento e
  protocolado, assinado ou enviado ao cliente final pelo sistema.
- R7. Rastreabilidade: cada documento guarda tipo de caso, modelo e versao do
  modelo, dados usados, versao do processamento de IA, quem aprovou e quando.
  Eventos, auditoria, notificacoes e logs sem dado pessoal (regra S1-S3).
- R8. Isolamento (revisto em 2026-10-11): tenant + membresia do quadro +
  escritorio do card (Sprint 3.5) valem para card, cliente, checklist,
  documentos, historico, realtime, notificacoes, metricas, busca por CPF,
  resultados da IA e documentos gerados. So o administrador (`flow:admin`) ve
  todos os escritorios. Tipos de caso, modelos e configuracao de IA sao do
  tenant.
- R9. Nenhum documento ou dado pessoal sai para provedor externo de IA antes da
  confirmacao de P5 pelo cliente e da decisao do Architect.
- R10. IA com a chave do cliente (decidido em 2026-10-11): o cliente informa a
  propria API key, escolhe o provedor entre os suportados e paga direto ao
  provedor. A JBoot nao tem teto proprio nem chave de reserva; nunca usa chave
  de um tenant para outro. O cliente pode definir um limite opcional (P31).
- R11. Sem IA disponivel (desligada, sem chave, chave invalida, sem saldo ou
  limite atingido), o lead segue pelo fluxo manual da S6; nada se perde e o
  gestor e avisado.

### Decisoes Do Usuario Sobre A Primeira Fase (2026-10-11, confirmacao do PE/Architect)

- Acesso por escritorio (revisa a decisao de 2026-10-09 de isolamento apenas
  por quadro): o administrador define quais usuarios acessam cada quadro e a
  qual escritorio cada usuario pertence. Independentemente do quadro, cada
  usuario, exceto o administrador, ve apenas os cards do seu escritorio. O
  administrador (gestor principal) ve todos.
- Documento gerado: PDF ja na primeira entrega (alem do `.docx`). Conversor em
  container proprio (G2 da ADR 014).
- IA: aprovada como proposta (inicia em "Enviar para analise", sequencia fixa
  ler/extrair/classificar/gerar, sem agente autonomo, nunca aprova nem altera
  cadastro, falha visivel com reprocessamento, desligavel por cliente).
- Custo da IA: cada cliente informa a propria API key do provedor; o custo vai
  direto para o cliente. A JBoot nao paga nem revende consumo de IA.
- Demais premissas do bloco de fluxo (congelamento apos envio, escritorio ve
  so estado e documento aprovado, revisao humana obrigatoria): sem objecao do
  usuario; tratadas como aprovadas.

### Confirmacoes Do Usuario (2026-10-12)

- P25 a P28 (regras finas de escritorio): aprovadas como propostas.
- P2a e P3 (modelos `.docx` com `{{namespace.campo}}`; N casos e N documentos
  por lead): aprovadas.
- P31, P33 e P34 (limite opcional em analises por mes; eval na conta do
  cliente com consentimento; termo de responsabilidade ao ligar a IA):
  aprovadas.
- Sprints 3.5, 4, 5 e 6 liberadas para implementacao. Sprints 7 a 9 seguem
  bloqueadas pelos insumos do cliente (P1, P2 modelos reais, P4, P5).

## Sprint 1: Card Vinculado Ao Cliente Final

Estado: **concluida** (2026-10-10; backend + telas, gates no container verdes;
commit `2bca12539`).

Objetivo: o lead (card) passa a referenciar um cliente final unico do tenant,
criado ou localizado por CPF, com dado geral e juridico.

Entregaveis:

- Tabela `kanban_card_customers` no banco do Flow (`card_id`, `customer_id`,
  `client_id`, `created_by_identity_id`, `created_at`), um cliente titular por
  card, sem FK entre bancos; existencia validada pelo servico de
  `establishment-customers`.
- Busca por CPF ao criar/vincular lead, com tres respostas: nao encontrado,
  encontrado (dados exibidos) ou cadastrado fora dos quadros do usuario (sem
  exibir dados).
- Criacao/edicao de cliente final (nucleo + `customer_juridico`) a partir do
  card, sempre pelo servico exportado do modulo de clientes.
- Painel "Cliente" no card com dado geral e juridico.
- `CardActivity.system_event` para vinculo, troca e edicao de cliente.

Criterios de aceite:

- Usuario so ve dados de um cliente quando ele estiver vinculado a card de
  quadro em que o usuario e membro ativo.
- CPF e unico por tenant; tentativa de duplicar retorna o cliente existente
  conforme a regra de visibilidade acima.
- Nenhuma leitura/gravacao direta nas tabelas de `establishment-customers` a
  partir do modulo `kanban`.
- Testes automatizados de repositorio/servico e da regra de visibilidade.

Fora de escopo: documentos (Sprint 2), importacao em massa.

### Entrega Da Sprint 1 (2026-10-10)

Contrato HTTP: `docs/api/flow-crm-leads-sprint-1-openapi.yaml`.

- Migration `docker/postgres/init/061_kanban_card_customers.sql` (banco do Flow,
  `\connect jboot_kanban_demo_dev`, mesmo padrao de 057/058): tabela
  `kanban_card_customers` (`card_id` PK + FK para `kanban_cards`, `client_id`,
  `customer_id` sem FK entre bancos, `created_by_identity_id`, `created_at`) e
  indice `(client_id, customer_id)`. Aplicada duas vezes no dev (segunda
  execucao: `already exists, skipping`).
- `client_id` do Flow e o mesmo de `establishment-customers`: ambos vem do claim
  `client_id` do JWT Identity (`jboot_identity.clients.id`); conferido no dev
  (`kanban_boards.client_id` e `pdv_establishment_customers.client_id` usam
  `a9d9b269-...` = `JBOOT LTDA`). Nao ha mapeamento.
- Compensacao do vinculo: se `kanban_card_customers` falhar depois de criar
  cliente novo, `CustomersService.discardJustCreated` remove esse cliente antes
  de propagar o erro (ver Pendencias).
- `establishment-customers`: `CustomersService.findIdsByCpf` (so ids, CPF so
  digitos comparado com `regexp_replace(document_number, '\D', '', 'g')`, por
  `client_id`, qualquer status) e `CustomersService.createIfCpfAbsent`
  (unicidade validada no servico; grava CPF so com digitos; violacao do indice
  unico em corrida vira nova busca). Kanban usa apenas os servicos exportados.
- Kanban: `src/modules/kanban/customers/` (controller, service, repository, DTOs).
  Rotas `GET|PUT|PATCH /kanban/boards/:boardId/cards/:cardId/customer` e
  `POST .../customer/lookup`. CPF so no corpo, nunca em URL/log/evento.
- `CardActivity.system_event`: `card.customer_linked` (`customerId`, `created`),
  `card.customer_changed` (`customerId`, `previousCustomerId`, `created`) e
  `card.customer_updated` (`customerId`, `fields`). Auditoria `kanban_audit_events`
  com o mesmo payload, sem dado pessoal.
- Telas: painel "Cliente" no `CardModal` e modal de vincular/trocar/editar
  (`CardCustomerPanel`, `CardCustomerModal`, `CardCustomerSummary`), cliente
  tipado `kanbanApi.cardCustomer` em `kanban-api.ts`.

> Revista em 2026-10-11: a regra abaixo e a implementada na Sprint 1 e vale
> ate a Sprint 3.5. A partir dela, "card visivel" passa a incluir o filtro por
> escritorio; a regra nova esta em "Sprint 3.5", secao "Regras De Visibilidade
> Reescritas".

Regra de visibilidade (implementada no backend):

- Ordem da busca por CPF: (1) `CustomersService.findIdsByCpf` devolve so ids;
  (2) `CardCustomersRepository.filterVisibleCustomerIds` no banco do Flow:
  `kanban_card_customers` JOIN `kanban_cards` (`status <> 'deleted'`) JOIN
  `kanban_board_members` (`identity_id` do usuario, `status = 'active'`), tudo
  no mesmo `client_id`; (3) somente se visivel, `CustomersService.findById` +
  `CustomerJuridicoService.get`. `outside_boards` nunca chama o passo 3.
- Card **arquivado conta** para a visibilidade; card **excluido logicamente**
  (`status = 'deleted'`, migration 057) nao conta. Status do quadro nao entra na
  regra (quadro arquivado nao e exclusao).
- Cliente existente sem nenhum card visivel ao usuario (inclusive cliente
  cadastrado so pelo PDV do mesmo tenant ou orfao de card excluido) responde
  `outside_boards` e nao pode ser vinculado nem duplicado (409
  `customer_outside_boards`).
- Duplicidade legada por CPF normalizado: todos os ids entram na checagem; o
  primeiro visivel (ordem de criacao) e o usado.
- Painel "Cliente": exige membresia ativa no quadro do card (qualquer papel);
  `canEdit` vem do backend. Lookup, vinculo, troca e edicao usam a mesma regra
  das mutacoes de card (`flow:write`, `board_admin`/`board_member`, coluna
  editavel pelo `MemberProfile`).

Decisoes de UX (`docs/agents/orchestration/ui-ux.md`):

```text
UIUX Decision:
  objective: cliente final titular do card, com busca por CPF e cadastro/edicao a partir do card
  target_project: implementations/app-jboot-next-platform
  target_module: modules/kanban
  scenario_classification: covered_by_skill (platform-crud-ui: modal xl com steps) + covered_by_template (paineis do CardModal)
  template_sources_checked: CardModal/CardAssigneesPanel, PdvAdminPage (modal com steps), CepInput, UserFormModal (busca por documento no formulario)
  flow:
    states:
      empty: "Nenhum cliente vinculado." + acao "Vincular cliente" (so com canEdit)
      loading: spinner no painel; spinner no botao Buscar/Salvar
      error: Alert no painel/modal com a mensagem estruturada do backend
      success: painel recarregado com a resposta do backend; historico do card remontado
      permission_denied: painel informa que so membros ativos veem o cliente; sem canEdit nao ha botoes
    information_hierarchy: painel Cliente no topo da coluna esquerda do CardModal (antes de Responsaveis); dado geral visivel, juridico recolhivel
    primary_actions: Vincular cliente | Editar | Trocar
  reused_components: Modal/steps do padrao PdvAdminPage (sem import cruzado), CepInput, padrao de painel do CardModal, rotulos do CardHistoryPanel
  new_components:
    - component: CardCustomerPanel/CardCustomerModal/CardCustomerSummary
      justification: aplicam padroes existentes (painel do card + modal com steps); a busca por CPF antes do formulario segue o precedente de UserFormModal
      classification: excecao_isolada
  navigation_impact: nenhum (modal sobre o card; sem rota/menu novo)
  local_agent: modules/kanban/agents/kanban-board-ui.md
  local_skill: skills/platform-crud-ui.md, modules/kanban/skills/kanban-board-ui.md
  usability_risks: modal aninhado sobre o CardModal (zIndex 1065); cliente fora dos quadros exige contato com a central
  decision_status: aplicado (padrao ja aprovado; sem padrao novo)
```

- Modal: steps sem numero com icone (`Dados gerais` ri-file-text-line,
  `Endereco` ri-map-pin-line, `Juridico` ri-scales-3-line, `Observacoes`
  ri-sticky-note-line), footer `Cancelar` + `Salvar`/`Vincular` com spinner.
- Busca por CPF no topo do modal: `not_found` abre o cadastro com CPF travado;
  `found` mostra os dados e o botao `Vincular`; `outside_boards` mostra so
  "Cliente cadastrado fora dos seus quadros. Procure a central para vincular
  este cliente ao card.", sem acao. 409 em corrida cai no mesmo estado.
- Card ainda nao salvo: painel Cliente aparece como "Disponivel depois de
  salvar o card", igual a Status/Tags/Responsaveis.

Gates (todos no container `jboot`):

- bff: `npm test` (contagem na revisao 2 abaixo); `npx tsc --noEmit` ok; `npm run build` ok; eslint
  dos arquivos tocados ok.
- app: `npm run type-check` ok; `npm run build` ok; vitest do modulo kanban
  14/14; eslint dos arquivos tocados ok. `npm test` completo tem 6 falhas
  pre-existentes fora do escopo (`src/lib/identity-applications.spec.ts`,
  `src/modules/pdv/lib/pdv-api.spec.ts`), causadas pelas variaveis
  `NEXT_PUBLIC_JBOOT_*` do container; arquivos nao tocados.
- Revisao 2 (compensacao do vinculo): bff `npm test` 304/304, `tsc`, `build` e
  eslint ok; app `type-check`, `build` e vitest do kanban 14/14 ok.
- `make ai-api-graph-gate`: 0 erro; as 4 rotas novas tem consumidor em
  `kanban-api.ts`.
- Smoke somente leitura contra `platform-api` (sem escrita no dev): painel
  vazio 200, lookup `not_found`, lookup `outside_boards`, PUT 409
  `customer_outside_boards`, CPF invalido 400, campo fora da whitelist 400.

Security checklist (`docs/skills/security-checklist/SKILL.md`):

- Injection: SQL parametrizado; nenhum SQL dinamico novo com input.
- Access control: tenant do JWT em todas as queries; membresia/papel/coluna
  checados no backend; DTO de saida explicito (sem campos fiscais de PDV).
- Dados sensiveis: CPF so no corpo; mensagem de validacao nao ecoa o valor;
  `system_event`/auditoria so com `customerId` e nomes de campo (testado).
- Mass assignment: whitelist + `forbidNonWhitelisted`; DTOs aninhados validados;
  mapeamento explicito de campos antes de chamar o servico de clientes.
- Rate limiting: platform nao tem throttler; lookup e autenticado, restrito a
  quem edita o card e devolve so status para cliente fora dos quadros. Risco
  residual de enumeracao de existencia de CPF por membro com edicao registrado
  em Pendencias.
- SSRF: N/A (o `CepInput` reutilizado ja consultava ViaCEP).
- Dependencias: N/A (nenhuma dependencia nova).
- Frontend: sem token novo em storage; sem `dangerouslySetInnerHTML`.

Graph Engineering: a Sprint 4 de `docs/product/api-graph-sprints.md` ainda nao
entregou o registry do Architecture Graph. Obrigacao de migracao registrada para
quando o registry existir: nodes `kanban` -> `establishment-customers` (aresta
`uses_service`: `CustomersService`, `CustomerJuridicoService`), data store
`kanban_card_customers` (banco do Flow, dono `kanban`) e referencia logica
`kanban_card_customers.customer_id` -> `pdv_establishment_customers.id` (sem FK,
entre bancos). O Architecture Graph **nao** esta sincronizado com esta entrega;
o API Contract Graph (subgrafo HTTP) passa no gate.

## Sprint 2: Checklist De Documentos E Revisao Pela Central

Estado: **concluida** (2026-10-10; backend + telas, gates no container verdes,
smoke real de envio/aceite/rejeicao no dev; sem commit, aguardando o
orquestrador). Ver "Entrega Da Sprint 2" abaixo.

Objetivo: operadores das bases anexam a documentacao do lead pelo checklist,
inclusive pelo celular, e a central aceita ou rejeita cada item.

Entregaveis:

- `kanban_board_document_types`: checklist configuravel por quadro (nome,
  obrigatorio, ordem, ativo), com opcao de aplicar a lista inicial confirmada.
- `kanban_card_documents`: item do checklist atendido no card, apontando para
  um `CardAttachment` existente; status `enviado | aceito | rejeitado`, motivo
  de rejeicao, revisor e data.
- Upload pelo fluxo de anexos existente: cada envio gera `CardActivity`
  (`card.document_uploaded`) e o arquivo vira `CardAttachment` dessa activity,
  respeitando a restricao de anexo sem upload solto.
- Flag `can_review_documents` em `MemberProfile`; `board_admin` sempre pode
  revisar.
- Rejeicao gera notificacao in-app aos responsaveis/criador do card e
  `CardActivity.system_event`.
- Indicador de completude no card (obrigatorios aceitos / total obrigatorio).
- Flag opcional por coluna `requires_complete_checklist`: card so entra na
  coluna com todos os obrigatorios aceitos.

Criterios de aceite:

- Limites de tamanho e tipo de arquivo identicos aos anexos atuais.
- Somente perfil revisor ou `board_admin` altera status de documento.
- Movimentacao para coluna com `requires_complete_checklist` e rejeitada com
  erro estruturado listando os itens pendentes.
- Tela de envio utilizavel em celular (camera como origem do arquivo).
- Testes automatizados de checklist, revisao, notificacao e bloqueio de coluna.

Fora de escopo: validacao automatica de conteudo por IA, backup no Google Drive.

> Revisto em 2026-10-11: "validacao automatica de conteudo por IA" continua fora
> da Sprint 2 (ja concluida), mas deixou de ser fora de escopo do arco. Leitura,
> extracao e classificacao por IA e geracao do documento entram na primeira fase
> (Sprints 7 a 9; ver "Redefinicao Da Primeira Fase (2026-10-11)"). Backup no
> Google Drive segue fora (pergunta P15).

### Premissas Do Orquestrador (2026-10-10, pendentes de validacao do usuario)

Decisoes tomadas pelo orquestrador para destravar a Sprint 2; valem ate o
usuario confirmar ou corrigir:

- Lista inicial: todos os 8 itens nascem obrigatorios, exceto "Demais
  documentos", que nasce opcional; o `board_admin` pode alterar depois.
- Cada envio cria uma linha nova em `kanban_card_documents` (historico
  preservado); o estado do item (card, tipo) e o da linha mais recente.
- `requires_complete_checklist` nao tem efeito retroativo: card que ja esta na
  coluna nao e retirado se um documento for rejeitado depois.

Decisoes de implementacao derivadas (registradas para validacao, sem mudar as
premissas acima):

- "Aplicar lista inicial" pula nome que ja exista no quadro, ATIVO OU INATIVO
  (sem caixa e sem espacos nas pontas; acento conta). Tipo desativado de
  proposito nao e recriado nem reativado.
- Reenvio e permitido em qualquer estado, inclusive depois de `aceito`: o novo
  envio passa a ser o estado do item (volta a `enviado`). Consequencia direta da
  premissa "estado = linha mais recente"; a UI mostra "Enviar novo".
- Revisao so vale para o envio mais recente do item (`409 document_superseded`
  para envio antigo), para que o estado do item e o evento nunca divirjam.
- Bloqueio de coluna vale para todos os papeis, inclusive `board_admin` (o
  artefato nao preve bypass); quadro sem tipo obrigatorio ativo nao bloqueia.
- Revisor precisa ser `board_admin` ou `board_member` com perfil revisor;
  `board_viewer` nunca revisa, mesmo com perfil revisor (papel so leitura).
- Tipo desativado sai do checklist novo e da completude, mas continua visivel no
  card que ja tem envio dele (marcado "Tipo inativo").

### Entrega Da Sprint 2 (2026-10-10)

Contrato HTTP: `docs/api/flow-crm-leads-sprint-2-openapi.yaml`.

- Migration `docker/postgres/init/062_kanban_card_documents.sql` (banco do Flow,
  `\connect jboot_kanban_demo_dev`), aditiva e idempotente:
  `kanban_member_profiles.can_review_documents` e
  `kanban_board_columns.requires_complete_checklist` (`boolean NOT NULL DEFAULT
  false`); tabela `kanban_board_document_types` (unico parcial
  `(client_id, board_id, lower(btrim(name))) WHERE active`); tabela
  `kanban_card_documents` (`attachment_id` UNIQUE com FK para
  `kanban_card_attachments`, CHECKs: rejeitado exige motivo, motivo so em
  rejeitado, revisor/data presentes sse status <> enviado; `created_at DEFAULT
  clock_timestamp()` para ordenar envios da mesma transacao) e indice
  `(client_id, card_id, document_type_id, created_at DESC)`. Aplicada duas
  vezes no dev (segunda execucao: `already exists, skipping` em todos os
  objetos). Nenhuma coluna/tabela removida.
- Backend `src/modules/kanban/documents/`: `DocumentTypes*` (CRUD por quadro,
  `flow:admin` + `board_admin`, sem DELETE, desativar por `active=false`,
  lista inicial idempotente sob lock do quadro), `CardDocuments*` (checklist,
  envio, revisao) e `ChecklistGateService` (bloqueio de coluna).
- Envio: `POST .../cards/:cardId/documents` (multipart `file` +
  `documentTypeId`). Ordem: permissao (`flow:write`, `board_admin`/
  `board_member`, coluna do card editavel pelo perfil) -> tipo ativo do quadro
  -> `assertAttachmentFileAllowed` (mesma funcao e constantes dos anexos) ->
  sobe o objeto (chave server-side `{client}/{card}/{activity}/{attachment}-
  {arquivo}`, mesmo bucket) -> transacao unica com `system_event`
  `card.document_uploaded`, `CardAttachment` dessa activity e linha
  `enviado`. Falha do storage: nenhuma linha. Falha da transacao:
  `StorageService.deleteQuietly` remove o objeto e o erro original sobe; falha
  da propria compensacao fica logada sem nome de arquivo
  (`storage_compensation_failed`). O attachment nasce no mesmo card/tenant por
  construcao; nao existe rota que receba `attachment_id` do cliente.
- O fluxo de anexos da Sprint 4 NAO removia o objeto quando a gravacao no banco
  falhava (objeto orfao). Corrigido no mesmo change: `AttachmentsService.upload`
  usa a mesma validacao extraida e a mesma compensacao (teste dedicado).
- Revisao: `POST .../documents/:documentId/review` (`aceito` | `rejeitado` +
  motivo). UPDATE condicional `status = 'enviado'` + `system_event`
  (`card.document_accepted`/`card.document_rejected`, payload so com
  `documentId`, `documentTypeId`, `documentTypeName` e `rejectionReason`) na
  mesma transacao. Rejeicao notifica in-app (`kanban.card.document_rejected`,
  modulo `notifications` existente, sem e-mail) responsaveis e criador do card,
  sem duplicar e nunca o revisor; falha da notificacao nao desfaz a revisao.
- Completude: `GET .../cards` devolve `documentChecklist { acceptedRequired,
  totalRequired }` por card a partir de UMA consulta agregada por quadro
  (`completenessForBoard`, `DISTINCT ON` do envio mais recente), sem N+1. O
  checklist do modal devolve `completeness { acceptedRequired, totalRequired,
  complete }`.
- Flags: `canReviewDocuments` em `MemberProfile` (DTO/repo/`resolveCapabilities`;
  `GET /kanban/boards/:id` expoe em `currentUserCapabilities`) e
  `requiresCompleteChecklist` em `BoardColumn` (create/update/select).

Matriz de revisao (backend, `BoardAccessService.canReviewDocuments`; testada):

| Quem | Altera status |
|---|---|
| `board_admin` (com ou sem perfil) | sim |
| `board_member` com perfil `can_review_documents = true` | sim |
| `board_member` com perfil sem a flag ou sem perfil | nao, 403 `cannot_review_documents` |
| `board_viewer` (mesmo com perfil revisor) | nao, 403 `cannot_review_documents` |
| nao membro / outro tenant | nao (404 do quadro antes de qualquer leitura) |

Caminhos que colocam card em coluna (verificados no codigo; `UPDATE
kanban_cards SET board_column_id` e `INSERT INTO kanban_cards` so existem em
`cards.repository.ts`):

| Caminho | Bloqueio |
|---|---|
| `POST /kanban/boards/:id/cards/:cardId/move` (drag-and-drop e qualquer UI de mover) | sim, quando muda de coluna; reordenar na mesma coluna nao avalia |
| `POST /kanban/boards/:id/cards` (criar card direto na coluna) | sim (card novo: todos os obrigatorios pendentes) |
| `CardsService.createInDefaultColumnFromSource` (integracoes de dominio: importacao juridico/DataJud na coluna padrao) | sim, so quando o card seria inserido; reexport de card existente nao reentra |
| Motor de automacao (Sprints 8 e 9: `AutomationWorker`, `ScheduledAutomationEvaluatorService`) | nao se aplica: so envia e-mail, nunca move card |
| `PATCH .../cards/:cardId` (reativar card arquivado) | nao se aplica: card nunca saiu da coluna (sem efeito retroativo) |
| Arquivar coluna | nao se aplica: nao move cards |

Erro de bloqueio (HTTP 422):

```json
{
  "code": "checklist_incomplete",
  "message": "Card cannot enter this column until every required document is accepted",
  "boardColumnId": "<uuid>",
  "pendingDocumentTypes": [{ "id": "<uuid>", "name": "Procuração" }]
}
```

Decisoes de UX (`docs/agents/orchestration/ui-ux.md`):

```text
UIUX Decision:
  objective: checklist de documentos do lead no card (envio pelo celular, revisao pela central), indicador de completude e configuracao por quadro
  target_project: implementations/app-jboot-next-platform
  target_module: modules/kanban
  scenario_classification: covered_by_template (paineis do CardModal, anexos do CardHistoryPanel, switches do ProfilesSettings, settings por quadro) + covered_by_skill (platform-crud-ui para os tipos de documento)
  template_sources_checked: CardModal/CardCustomerPanel, CardHistoryPanel (upload/download), ProfilesSettings, TagsStatusSettings (pagina de settings), PdvAdminPage (listagem + modal com steps), CardCustomerModal (steps)
  flow:
    states:
      empty: "Nenhum tipo de documento configurado neste quadro." no card; "Nenhum documento configurado." na configuracao (com "Aplicar lista inicial")
      loading: spinner no painel/pagina; spinner no botao do item durante envio/revisao
      error: Alert no painel com a mensagem estruturada do backend; validacao local de tipo/tamanho antes de enviar
      success: checklist recarregado, tile do board recarregado (completude) e historico remontado
      permission_denied: sem canUpload/canReview os botoes nao aparecem; pagina de configuracao mostra "Somente o administrador do quadro..." com voltar ao quadro
    information_hierarchy: painel "Documentos" logo abaixo do painel "Cliente" na coluna esquerda do CardModal; badge "aceitos/total obrigatorios" + barra de progresso; itens na ordem configurada com estado em badge
    primary_actions: Enviar arquivo | Foto (camera) | Aceitar | Rejeitar (com motivo inline)
  reused_components: padrao de painel do CardModal, download por URL assinada do CardHistoryPanel, form-switch do ProfilesSettings, pagina de settings no padrao tags-status, listagem/modal com steps do PdvAdminPage
  new_components:
    - component: CardDocumentsPanel
      justification: painel novo do CardModal no mesmo padrao dos existentes; dois inputs ocultos (arquivo sem capture e camera com capture=environment) para nao impedir escolher arquivo no celular
      classification: excecao_isolada
    - component: DocumentTypesSettings (+ rota /flow/boards/:id/settings/documents)
      justification: CRUD administrativo seguindo platform-crud-ui (listagem em card, modal xl com steps "Dados gerais" ri-file-text-line e "Checklist" ri-file-list-3-line, footer Cancelar/Salvar, Inativar/Reativar) e secao com o switch requires_complete_checklist por coluna
      classification: excecao_isolada
  navigation_impact: botao "Documentos" (ri-file-list-3-line) no header do board, so para board_admin, ao lado de Perfis/Automacoes; sem item de menu lateral novo
  local_agent: modules/kanban/agents/kanban-board-ui.md
  local_skill: skills/platform-crud-ui.md, modules/kanban/skills/kanban-board-ui.md
  usability_risks: botao "Foto" em desktop abre o seletor de imagem (capture e ignorado); reenviar documento aceito volta o item para "Enviado"; drag-and-drop bloqueado volta o card a origem e mostra a lista de pendentes
  decision_status: aplicado (padroes existentes; sem padrao novo)
```

- Tile do card: badge `ri-file-list-3-line aceitos/total` (verde completo,
  amarelo incompleto) so quando o quadro tem obrigatorio ativo. Cabecalho da
  coluna com `ri-lock-line` quando `requiresCompleteChecklist`.
- Bloqueio: drag-and-drop recarrega os cards (o card volta a coluna de origem)
  e mostra "Checklist incompleto: o card so entra nesta coluna com todos os
  documentos obrigatorios aceitos. Pendentes: A, B." (`describeKanbanError`);
  criar card direto na coluna mostra a mesma mensagem no modal.
- Flag de coluna configurada na pagina "Documentos" do quadro (secao "Colunas
  que exigem checklist completo"): hoje a unica configuracao de coluna no board
  e criar/arquivar; nao ha modal de edicao de coluna para receber o switch.
- Flag de perfil: switch "Pode revisar documentos do checklist" em Perfis.
- Historico do card: rotulos `card.document_uploaded`/`accepted`/`rejected`
  (com nome do tipo e motivo).
- `kanban-api.ts`: `documentTypes`, `cardDocuments`, campos novos em
  `BoardColumnDto`/`MemberProfileDto`/capacidades/`CardDto`; `uploadRequest`
  passou a lancar `KanbanApiError` (antes `Error` sem `code`), com `payload` do
  corpo para ler `pendingDocumentTypes`. Limites espelhados em
  `lib/card-documents.ts` (pre-validacao; backend continua autoritativo).

Gates (todos no container `jboot`):

- bff: `npm test` 341/341 (antes 304; +37); `npx tsc --noEmit` ok;
  `npm run build` ok; eslint dos arquivos tocados ok. Revisao 3: `npm test`
  344/344, `tsc`, `build` e eslint de `src/modules/kanban` ok.
- app: `npm run type-check` ok; `npm run build` ok (rota
  `/flow/boards/[boardId]/settings/documents` gerada; aviso de SCSS
  `color-adjust` pre-existente); vitest do kanban 23/23 (antes 14); eslint dos
  arquivos tocados ok. `next-env.d.ts` revertido. Revisao 3: `type-check`,
  `build` e vitest do kanban 25/25 ok.
- `make ai-api-graph-gate`: 0 erro; as 7 rotas novas tem consumidor em
  `kanban-api.ts`; nenhum achado aceito novo.

Smoke real contra `platform-api` no dev (2026-10-10), com quadro e card
proprios ("SMOKE CRM leads sprint 2 (temporario)", Operador Senior, token de dev
assinado no container com o segredo de dev do Identity, sem senha; por
orientacao do orquestrador, isso nao deve se repetir sem pedido explicito — a
revisao 3 nao teve smoke autenticado):
lista inicial 8 criados (so "Demais documentos" opcional), reaplicar 0
criados/8 pulados; criar card direto em coluna bloqueada 422 (7 pendentes);
checklist 8 itens, 0/7, `canUpload`/`canReview` true; mover para coluna
bloqueada 422 `checklist_incomplete`; tipo `text/html` 415; envio PDF 201
`enviado`; aceite 201; revisar de novo 409 `document_not_pending`; rejeitar
sem motivo 400; rejeicao 201 com motivo; tile `{1/7}`; eventos com so ids/tipo/
motivo; URL assinada 200; com os demais tornados opcionais o movimento entrou
(201). Limpeza: card arquivado e excluido logicamente (204), os 2 objetos do
card removidos do bucket por chave (restantes 0) e o quadro de teste arquivado.
Residuo no dev (normal da aplicacao, sem rota de exclusao fisica): quadro
arquivado `4dd640db-...`, card `deleted` `9228f2f6-...`, seus tipos de
documento, activities, linhas de anexo/documento (apontando para objetos ja
removidos) e eventos de auditoria.

> Revista em 2026-10-11: a leitura por membresia abaixo continua valendo para
> o conteudo do quadro, mas as leituras de card passam a exigir tambem o
> escritorio do card (Sprint 3.5, "Regras De Visibilidade Reescritas").

Correcao de seguranca (revisao 3, 2026-10-10) — leitura exige membresia ativa:

`BoardAccessService.requireBoard` faz LEFT JOIN de membresia e so garante que o
quadro existe no tenant. Leituras de conteudo que dependiam so dele expunham a
qualquer usuario do tenant com sessao Flow, mesmo sem ser membro, o checklist
(nomes de arquivo, motivos) e URLs de download de documentos pessoais de outros
quadros, contrariando a decisao de 2026-10-09 (isolamento por quadro/membresia).
Correcao: metodo explicito `BoardAccessService.requireMember` (requireBoard +
membresia ATIVA em qualquer papel, inclusive `board_viewer`; 403
`board_membership_required`; outro tenant/quadro inexistente continua 404).
`requireBoard` nao mudou de semantica. Leituras protegidas:

| Rota | Servico |
|---|---|
| `GET /kanban/boards/:id/cards` | `CardsService.list` (inclui completude) |
| `GET /kanban/boards/:id/columns` | `ColumnsService.list` (ja exigia membresia via `resolveMembership`; agora explicito) |
| `GET .../cards/:cardId/activities` | `ActivitiesService.list` |
| `GET .../activities/:activityId/attachments` | `AttachmentsService.list` |
| `GET .../attachments/:attachmentId/download` | `AttachmentsService.getDownloadUrl` |
| `GET .../cards/:cardId/documents` | `CardDocumentsService.getChecklist` |
| `GET /kanban/boards/:id/tags` e `GET .../cards/:cardId/tags` | `TagsService.list`, `listForCard` |
| `GET /kanban/boards/:id/statuses` | `StatusesService.list` |
| `GET .../cards/:cardId/assignees` | `AssigneesService.list` |
| `GET /kanban/boards/:id/members` | `MembersService.list` |

Ja protegidas antes (sem mudanca): painel Cliente (`resolveMembership`),
`GET /kanban/metrics` (escopo por `kanban_board_members` ativo), perfis,
transicoes, ACL de coluna, candidatos, regras de automacao e tipos de documento
(`board_admin`), notificacoes (por destinatario) e todas as mutacoes
(`requireRole` exige membro ativo). Sem mudanca e registrado como pendencia de
produto: `GET /kanban/boards` e `GET /kanban/boards/:id` respondem a qualquer
usuario do tenant (nome/descricao do quadro, `currentUserRole = null`).

- WebSocket `/flow/ws`: `board.join` ja exigia `requireRole(['board_admin',
  'board_member'])` (membro ativo) e `broadcastCardMoved` revalida membresia e
  ACL de coluna por socket a cada evento; nao membro e membro inativo nao entram
  na sala nem recebem evento. Sem alteracao. Diferenca registrada: `board_viewer`
  tambem nao entra na sala (regra anterior, mais restritiva que a leitura HTTP);
  o viewer le pelo HTTP e nao recebe realtime. Atualizado em 2026-10-11 (Backlog
  T6): `board.join` passou a usar `requireMember` e o viewer ativo recebe eventos.
- Fluxos internos verificados (nenhum quebrou, nenhuma excecao aberta):
  exportacao de dominio (`createInDefaultColumnFromSource`) ja exigia
  `requireRole(['board_admin','board_member'])`, sem alteracao; destinos de
  importacao (`listImportDestinations`) ja filtram por membro ativo; worker e
  avaliador de automacao (Sprints 8 e 9) usam repositorios direto, sem passar
  pelos servicos HTTP; `DomainIntegrationsService.notifyProcessChanged` usa
  `ActivitiesService.recordIntegrationEvent` (escrita interna, sem checagem de
  membresia, inalterada); gateway `card.move` passa por `CardsService.move`
  (mutacao com papel). Monitoramento de card (`/domain-integrations/flow/cards/
  :cardId/monitoramento`) roda no contexto juridico e nao le conteudo do quadro
  Flow (fora do escopo; nao alterado).
- Frontend: `BoardView` mostra "Sem acesso a este quadro" (com voltar aos
  quadros) quando o quadro responde `currentUserRole = null` ou a leitura
  responde 403, e so carrega cards e conecta o realtime depois de confirmar a
  leitura (`lib/board-access.ts`, `isBoardContentDenied`).
- Testes: `shared/board-read-access.spec.ts` (banco real, transacao + ROLLBACK)
  roda as 11 leituras com `board_viewer` (le), nao membro (403), membro inativo
  (403) e outro tenant (404), e confirma que `requireBoard` nao mudou; teste
  dedicado no servico de checklist (403 antes de ler card/documentos); vitest do
  helper de acesso.

Security checklist (`docs/skills/security-checklist/SKILL.md`):

- Injection: SQL parametrizado; nenhum SQL dinamico com input.
- Access control: leitura de conteudo exige membresia ativa
  (`requireMember`, revisao 3); tenant do JWT em todas as queries (inclusive joins de
  anexo/documento); quadro/card/tipo/documento de outro tenant ou quadro = 404;
  envio com a regra das mutacoes de card; revisao so revisor/`board_admin`;
  configuracao so `board_admin` + `flow:admin`; DTOs de saida explicitos (sem
  `storage_key`/bucket).
- Dados sensiveis: documento pessoal e dado pessoal; payloads de evento,
  auditoria e notificacao so com ids/nome do tipo/motivo; nome do arquivo nunca
  em evento/log (log de compensacao tira o nome da chave). Motivo de rejeicao e
  texto livre do revisor e pode conter dado pessoal se o revisor escrever
  (permitido pelo escopo; registrado).
- Upload: mesmo limite (25 MB no multer e no servico) e mesma whitelist dos
  anexos; content-type vem do cliente (mesma limitacao dos anexos, sem sniffing
  de magic bytes; risco ja existente, nao ampliado; resolvido em 2026-10-11 pelo
  Backlog T5, assinatura conferida); chave do objeto sempre
  server-side com prefixo do tenant; nome de arquivo saneado na chave.
- Mass assignment: whitelist + `forbidNonWhitelisted`; `ParseUUIDPipe` nos ids.
- Rate limiting/paginacao: platform sem throttler (risco ja registrado);
  listagens novas com LIMIT (500 tipos, 1000 envios por card).
- SSRF: N/A. Dependencias: N/A (nenhuma nova).
- Frontend: sem token novo em storage; sem `dangerouslySetInnerHTML`.

Graph Engineering: a Sprint 4 de `docs/product/api-graph-sprints.md` ainda nao
entregou o registry do Architecture Graph. Obrigacao de migracao registrada para
quando o registry existir: data stores `kanban_board_document_types` e
`kanban_card_documents` (banco do Flow, dono `kanban`), colunas novas em
`kanban_member_profiles`/`kanban_board_columns`; arestas `kanban` ->
`kanban-card-attachments` (MinIO, mesmo bucket, agora tambem escrito pelo
checklist e com delete de compensacao), `kanban` -> `notifications`
(`PlatformNotificationsService`, kind `kanban.card.document_rejected`) e
`domain-integrations` -> `kanban` (criacao na coluna padrao agora sujeita ao
`ChecklistGateService`). O Architecture Graph **nao** esta sincronizado com esta
entrega; o API Contract Graph (subgrafo HTTP) passa no gate.

## Sprint 3: Ajustes De Produto Pos-Revisao

Estado: **concluida** (2026-10-11; backend + telas, gates no container verdes;
sem commit, aguardando autorizacao do usuario). Evidencia em "Entrega Da
Sprint 3" abaixo.

Objetivo: aplicar as decisoes do usuario de 2026-10-11.

Entregaveis:

- Override do admin do tenant: `flow:admin` vincula cliente existente fora
  dos quadros ao card, com motivo obrigatorio (texto livre, sem CPF no
  evento), `CardActivity.system_event` `card.customer_linked_by_admin` (ou
  payload com `override: true` e motivo) e auditoria. A busca por CPF para o
  admin continua respondendo `outside_boards` sem dados ate o vinculo; o
  vinculo e explicito. Operador comum continua com 409.
- Importacao de dominio na coluna com `requires_complete_checklist` nao e
  bloqueada; card que esta em coluna com a flag e checklist incompleto exibe
  sinalizacao "checklist pendente" no tile e no modal (vale tambem para o
  caso nao retroativo: documento rejeitado depois de o card entrar).
  Mover e criar card manualmente continuam bloqueados.

Criterios de aceite:

- Somente `flow:admin` faz o override; motivo obrigatorio; evento e auditoria
  sem dado pessoal alem do motivo digitado.
- Importacao para coluna com a flag cria o card e o sinaliza; mover manual
  continua 422.
- Testes automatizados de permissao do override, auditoria, importacao e
  sinalizacao. Telas com type-check/build no container.

### Entrega Da Sprint 3 (2026-10-11)

Contrato HTTP: `docs/api/flow-crm-leads-sprint-3-openapi.yaml` (delta; nenhuma
rota nova). Sem migration: nenhuma tabela ou coluna nova.

Override do admin do tenant (`src/modules/kanban/customers/`):

- `PUT .../customer` aceita `override: { reason }` opcional. `reason` e aparado
  e validado com 10..500 caracteres (400 fora disso, sem ecoar o texto; objeto
  com campo extra tambem 400, entao nao ha como escolher id).
- Autorizacao: `flow:admin` em `KanbanRequestContext.scopes` (claim `scopes`
  array ou `scope` separado por espaco do JWT) + checagens normais de edicao do
  card (`flow:write`, `board_admin`/`board_member` ativo, coluna editavel).
  Sem `flow:admin`: 403 `override_not_allowed`, checado antes de resolver o CPF.
- Contrato definido para os casos fora de `outside_boards`: CPF sem cliente =
  422 `override_requires_existing_customer` (nunca cria, mesmo com `customer` no
  corpo); cliente visivel = override ignorado, vinculo normal sem marca de
  override no evento. Sem `override` o comportamento e o da Sprint 1 (409).
- Cliente usado: o PRIMEIRO id por ordem de criacao devolvido por
  `CustomersService.findIdsByCpf` (`ORDER BY created_at, id`), mesma regra da
  duplicidade legada; `customer`/`juridico` do corpo sao ignorados.
- Lookup: `outside_boards` continua sem dados; para `flow:admin` traz
  `canOverride: true`; demais usuarios recebem so `{ status }` (inalterado).
- Evento/auditoria: `card.customer_linked` ou `card.customer_changed` com
  `{ customerId, [previousCustomerId], created: false, override: true, reason }`;
  auditoria `kanban_card_customer_linked|changed` com o mesmo payload. Motivo e
  o unico texto livre; nunca vai para log.
- Depois do vinculo o admin, membro do quadro do card, passa a ver o cliente
  pela regra normal de visibilidade (testado).

Importacao e sinalizacao:

- `CardsService.createInDefaultColumnFromSource` nao chama mais o
  `ChecklistGateService`; o hook `beforeInsert` de
  `CardsRepository.createFromSource` (so usado por esse caminho) foi removido
  com o teste correspondente. Criar card manualmente e mover continuam 422.
- `checklistPending` (`documents/checklist-pending.ts`, funcao pura
  `isChecklistPending`): coluna ATIVA com `requires_complete_checklist` E
  `totalRequired > 0` E `acceptedRequired < totalRequired`, com a completude
  ja usada pelo tile (estado = envio mais recente; so obrigatorios ativos).
- `GET .../cards`: `completenessForBoard` + `ColumnsRepository.list` em
  paralelo, duas consultas por quadro, sem N+1; `data[].checklistPending`.
- `GET .../cards/:cardId/documents` (modal): `checklistPending` calculado com o
  checklist do card e `ColumnsRepository.findById` da coluna do card; coluna
  arquivada nao sinaliza.

Decisoes de UX (`docs/agents/orchestration/ui-ux.md`):

```text
UIUX Decision:
  objective: override do admin do tenant no vinculo de cliente + sinalizacao "Checklist pendente"
  target_project: implementations/app-jboot-next-platform
  target_module: modules/kanban
  scenario_classification: covered_by_skill (platform-crud-ui: modal, footer, spinner) + covered_by_template (badge soft do indicador de completude)
  template_sources_checked: CardCustomerModal (fase outside_boards), CardDocumentsPanel (badge de completude), BoardView (tile), skills/platform-crud-ui.md
  flow:
    states:
      empty: motivo vazio deixa o botao desabilitado; contador n/500 e dica de minimo
      loading: spinner no botao "Vincular como administrador"
      error: Alert no modal; override_not_allowed e override_requires_existing_customer com mensagem pt-BR (o segundo volta para a busca)
      success: modal fecha, painel Cliente recarregado e historico remontado (fluxo existente)
      permission_denied: sem canOverride a fase outside_boards e identica a anterior (so a mensagem, sem acao)
    information_hierarchy: aviso "Cliente cadastrado fora dos seus quadros" -> bloco "Vinculo pelo administrador" (texto de auditoria + motivo) -> footer
    primary_actions: Vincular como administrador (primaria, ri-shield-user-line) | Cancelar
  reused_components: Alert/Input textarea/Button/Spinner (reactstrap), secao interna uppercase do platform-crud-ui, badge-soft-* do indicador de completude
  new_components:
    - component: ChecklistPendingBadge
      justification: mesmo badge no tile e no painel Documentos do modal; aplica o padrao do indicador existente
      classification: excecao_isolada
  navigation_impact: nenhum
  local_agent: modules/kanban/agents/kanban-board-ui.md
  local_skill: skills/platform-crud-ui.md, modules/kanban/skills/kanban-board-ui.md
  usability_risks: badge vermelho compete visualmente com vencimento atrasado (ambos badge-soft-danger, icones distintos); 409 em corrida volta para outside_boards sem canOverride, o admin precisa buscar de novo
  decision_status: aplicado (padrao ja aprovado; sem padrao novo)
```

- Texto do bloco admin: "Como administrador do Flow, voce pode vincular este
  cliente ao card. Os dados do cliente ficam visiveis depois do vinculo. A acao
  e auditada: o motivo fica registrado no historico do card e na auditoria."
  Dica: "Minimo de 10 caracteres. Nao inclua CPF ou dado pessoal."
- Badge: "Checklist pendente", `badge-soft-danger` + `ri-error-warning-line`,
  antes do indicador `aceitos/total` no tile e no cabecalho do painel
  Documentos (atualiza a cada envio/revisao do modal).

Gates (todos no container `jboot`):

- bff: `npm test` 361/361; `npx tsc --noEmit` ok; `npm run build` ok; eslint de
  `src/modules/kanban/{customers,documents,cards}` e
  `shared/board-read-access.spec.ts` ok. Testes novos: 10 de servico do
  override, 1 de DTO do motivo, 4 de `CardsService` (importacao, 422 do mover,
  sinalizacao), 2 de `CardDocumentsService` (modal), 1 da funcao pura e 1 de
  repositorio com `withTestDatabase` (importacao real na coluna com a flag,
  aceite, rejeicao depois da entrada; ROLLBACK).
- app: `npm run type-check` ok; `npm run build` ok; vitest do modulo kanban
  32/32; eslint dos arquivos tocados ok. `next-env.d.ts` revertido apos o build.
- `make ai-api-graph-gate`: 0 erro (3 warnings preexistentes de axios em
  helpers do template); consumidor unico das rotas alteradas e `kanban-api.ts`.
- Runtime: `platform-api` 200 apos o build (sem EADDRINUSE); smoke so sem
  autenticacao (`PUT .../customer` com override -> 401). Smoke autenticado nao
  foi possivel: nao havia sessao existente disponivel e tokens nao sao
  assinados com segredo do Identity.

Security checklist (`docs/skills/security-checklist/SKILL.md`):

- Access control: `flow:admin` checado no backend antes de resolver o CPF;
  checagens de papel/coluna inalteradas; a UI so reage a `canOverride`.
- Dados sensiveis: `outside_boards` sem dado mesmo para o admin; motivo e o
  unico texto livre em evento/auditoria e nunca e logado; a dica da tela pede
  para nao incluir CPF. Risco residual: o admin pode digitar dado pessoal no
  motivo (texto livre por decisao do usuario).
- Enumeracao: o admin passa a distinguir `outside_boards` de `not_found` com a
  mesma exposicao que ja existia para quem edita o card; sem rate limit (B3).
- Mass assignment: `override` com whitelist (`forbidNonWhitelisted`); nao ha
  campo para escolher id do cliente.
- Injection: nenhum SQL novo; consultas reaproveitadas e parametrizadas.
- SSRF/Dependencias: N/A (nenhuma nova). Frontend: sem token novo em storage;
  sem `dangerouslySetInnerHTML`.

Graph Engineering: nenhuma aresta ou componente novo. A aresta
`domain-integrations` -> `kanban` registrada na Sprint 2 deixa de passar pelo
`ChecklistGateService`; a obrigacao de migracao para o registry (Sprint 4 de
`docs/product/api-graph-sprints.md`) deve registrar a aresta sem o gate. O
Architecture Graph **nao** esta sincronizado com esta entrega; o API Contract
Graph (subgrafo HTTP) passa no gate.

## Sprint 3.5: Escritorios E Visibilidade Por Escritorio

Estado: **concluida** (2026-10-12; backend + telas, gates no container verdes;
sem commit, aguardando autorizacao do usuario). Entrega em "Entrega Da Sprint
3.5 (2026-10-12)". Primeira sprint nova da primeira fase (decisao do
usuario de 2026-10-11). Numerada 3.5 para nao renumerar as Sprints 4 a 9 ja
referenciadas no gate `docs/product/flow-crm-leads-sprint-4-9-gate.md` e na
ADR 014.

Por que vem antes da S4: o envio, a fila do gestor, a analise e os documentos
gerados (S4 a S9) dependem de "quem ve qual card". Fazer a S4 com a regra
antiga criaria leituras novas que precisariam ser refeitas, e os leads de
producao nasceriam sem escritorio.

Objetivo: o administrador cadastra escritorios e vincula cada usuario a um
escritorio; todo card passa a pertencer a um escritorio; usuario que nao e
administrador so enxerga os cards do proprio escritorio, em qualquer quadro.

Valor: cada escritorio trabalha com o proprio usuario sem ver os clientes dos
outros, e o gestor principal ve tudo, que e a condicao da decisao de
2026-10-11.

Entregaveis funcionais:

- Cadastro de escritorios (somente administrador): nome, ativo/inativo, sem
  exclusao. Dados do escritorio para documentos dependem de P29.
- Vinculo usuario -> escritorio (somente administrador): um usuario pode
  pertencer a um ou mais escritorios (P22, resolvida em 2026-10-11). A tela
  lista os usuarios do tenant com acesso ao Flow e os escritorios de cada um.
  O acesso aos quadros continua sendo a membresia, definida pelo administrador
  (e pelo `board_admin`, como hoje).
- Card pertence a um escritorio, gravado na criacao. Quem cria escolhe o
  escritorio entre os seus; com um unico escritorio a escolha e automatica.
  Vale para criar card na tela, criar direto na coluna e importacao de dominio
  (DataJud). Administrador escolhe entre todos os escritorios ativos
  (obrigatorio com a visibilidade ligada).
- Transferencia de card entre escritorios (somente administrador, motivo
  obrigatorio, auditada, P23). Cliente vinculado, checklist, documentos e
  historico acompanham o card.
- Ativacao por tenant (P26): o administrador liga a "visibilidade por
  escritorio" depois de cadastrar escritorios. Antes de ligar, a tela mostra
  quantos cards estao sem escritorio e permite atribuir em lote por quadro.
  Tenant que nao liga continua com o comportamento atual (Flow usado como
  quadro de tarefas nao muda).
- Escritorio do card visivel no tile e no card. Filtro por escritorio no
  quadro, so para o administrador.
- `CardActivity.system_event` e auditoria para criar escritorio, vincular ou
  trocar usuario, transferir card e ligar a visibilidade (sem dado pessoal).

### Regras De Visibilidade Reescritas

Definicao base: **card visivel para o usuario U** quando o card e do tenant de
U, nao esta excluido logicamente e:

- U e administrador (`flow:admin`, P25): ve o card em qualquer quadro do
  tenant, sem precisar ser membro (P24); ou
- U e membro ativo do quadro do card (qualquer papel) **e** o escritorio do
  card e um dos escritorios atuais de U.

Com a visibilidade por escritorio desligada no tenant, vale a regra anterior
(so membresia). Com ela ligada, card sem escritorio so e visivel ao
administrador.

Regra de visibilidade do cliente (substitui a da Sprint 1):

- U ve os dados de um cliente quando existe ao menos um card **visivel para
  U** vinculado a esse cliente. Card arquivado conta; card excluido nao conta
  (inalterado).
- Busca por CPF: `found` quando existe card visivel vinculado; `outside_boards`
  quando o cliente existe e nenhum card dele e visivel para U (inclui cliente
  de outro escritorio no mesmo quadro); `not_found` quando o CPF nao existe.
  `outside_boards` nunca traz dados e nao permite vincular nem duplicar (409).
  A mensagem passa a ser "Cliente cadastrado fora do seu escritorio ou dos seus
  quadros. Procure a central."
- Como o administrador ve todos os cards, para ele `outside_boards` so ocorre
  com cliente sem nenhum card (cadastrado so pelo PDV ou orfao). O override da
  Sprint 3 continua valendo para esse caso.
- Mesmo cliente em escritorios diferentes: ver P30.

Regra de leitura (substitui a revisao 3 da Sprint 2):

- Conteudo do quadro (colunas, tags, status, perfis, tipos de documento,
  regras de automacao, membros): membro ativo do quadro em qualquer papel, ou
  administrador. Inalterado para membros, alem do acesso do administrador.
- Conteudo de card (lista de cards, card, painel Cliente, checklist,
  documentos, anexos e download, historico, responsaveis, tags do card,
  completude, estado do lead e, a partir da S6, analise e documentos gerados):
  so com card visivel.
- A lista de cards do quadro devolve apenas os cards visiveis; o que nao e
  visivel nao aparece em contagem, completude nem metrica. Acesso direto a card
  nao visivel responde como inexistente (404), sem revelar que existe.
- Mutacoes de card (editar, mover, comentar, anexar, enviar e revisar
  documento, vincular cliente, atribuir, enviar para analise): exigem card
  visivel **mais** as regras atuais de papel, perfil e coluna.
- Responsavel do card precisa ser membro ativo do quadro e pertencer ao
  escritorio do card (entre os seus), ou administrador. O seletor de responsaveis so mostra esses
  usuarios.
- Realtime: evento de card so chega ao socket cujo usuario ve o card (filtro
  por escritorio somado a revalidacao de membresia e ACL de coluna que ja
  existe).
- Notificacoes in-app e e-mails do motor de automacao: so a destinatario que
  ve o card no momento do envio; destinatario fixo de outro escritorio e
  ignorado sem erro.
- Metricas da home do Flow: contam so cards visiveis.
- Nomes e descricoes de quadros continuam visiveis a qualquer usuario do
  tenant (decisao de 2026-10-11, inalterada).

Usuario sem escritorio (P27), com a visibilidade ligada:

- Nao ve card algum (nenhum card casa com o filtro), nao cria card e nao
  importa. Tentativa recebe erro estruturado `user_without_office` e a tela
  mostra "Seu usuario nao esta vinculado a um escritorio. Procure o
  administrador." Administrador sem escritorio opera normalmente.

Usuario que sai de um escritorio (P28, ajustada para N escritorios):

- A visibilidade acompanha os escritorios atuais a partir da requisicao
  seguinte, sem novo login; o socket aberto deixa de receber eventos do
  escritorio removido.
- Os cards que ele criou ficam no escritorio original: o card pertence ao
  escritorio, nao a pessoa.
- Ele e removido dos responsaveis dos cards do escritorio de que saiu (nao dos
  escritorios em que continua), com `system_event`, e o administrador recebe a
  lista dos cards afetados para redistribuir.

Escritorio inativo: nao recebe usuario nem card novo; usuarios e cards
existentes continuam como estao ate o administrador mover.

Criterios de aceite:

- Matriz testada para cada leitura e mutacao de card listada acima, com:
  usuario do escritorio A, usuario do escritorio B no mesmo quadro,
  administrador nao membro, usuario sem escritorio, membro inativo e outro
  tenant.
- Busca por CPF testada para cliente do proprio escritorio, de outro escritorio
  no mesmo quadro, sem card e inexistente, para operador e administrador.
- Realtime, notificacoes, e-mail de automacao e metricas testados com usuarios
  de escritorios diferentes no mesmo quadro.
- Tenant com a visibilidade desligada: suites atuais passam sem mudanca de
  comportamento.
- Troca de escritorio de usuario e transferencia de card testadas, incluindo
  remocao de responsavel e evento.
- Nenhum dado pessoal em evento, auditoria, log ou erro.
- Telas com type-check/build no container; `ui-ux` antes das telas;
  `security-checklist` obrigatorio (muda regra de acesso existente).

Fora de escopo: hierarquia de escritorios; permissao por escritorio
diferente da do quadro.

> Ajuste do Architect (2026-10-11), a partir da decisao do usuario: P22 passou
> de "exatamente um escritorio" para "um ou mais", com escolha do escritorio ao
> criar o card; P23, P24 e P30 aprovadas. Desenho tecnico (tabelas, ponto unico
> de visibilidade, migracao, lista de administradores) em
> `docs/product/flow-crm-leads-sprint-4-9-gate.md`, secao "Architect Decision
> (2026-10-11)", e na ADR 014.

### Entrega Da Sprint 3.5 (2026-10-12)

Contrato HTTP: `docs/api/flow-crm-leads-sprint-3-5-openapi.yaml`. Contratos
atualizados: `bff-jboot-platform/modules/kanban/MODULE_CONTRACT.md` e
`app-jboot-next-platform/modules/kanban/MODULE_CONTRACT.md` (secao "Escritorios E
Visibilidade Por Escritorio"); tabelas `Modulos` dos dois `PROJECT_CONTRACT.md`
ganharam `modules/kanban` (housekeeping do Architect).

- Migration `docker/postgres/init/063_kanban_offices.sql` (`\connect
  jboot_kanban_demo_dev`, aditiva e idempotente): `kanban_offices` (UNIQUE
  `(client_id, id)`; unico parcial `(client_id, lower(btrim(name))) WHERE
  active`), `kanban_user_offices` (PK `client_id, identity_id, office_id`; FK
  composta para o escritorio do mesmo tenant; indice `(client_id, office_id)`),
  `kanban_cards.office_id` (nulo; FK composta `(client_id, office_id)` criada so
  se ausente; indice `(client_id, board_id, office_id)`), `kanban_settings`
  (`office_visibility_enabled` default false; nao existia). Aplicada duas vezes no
  dev (segunda: `already exists, skipping`). Nenhum backfill: os 17 cards do dev
  seguem sem escritorio; nenhuma coluna/tabela removida.
- Ponto unico: regra pura `shared/card-visibility.ts` (`seesAllCards`,
  `canSeeCard`, `visibleCardScope`) + `CardVisibilityService`
  (`resolveViewer`, `requireVisibleCard`, `visibleCardScope`, `canSeeCard`,
  `identitiesWhoSeeCard`) + `KanbanViewerResolver` (memo por objeto de contexto;
  socket usa copia por evento) + `BoardAccessService.resolveEffectiveRole`/
  `isEffectiveTenantAdmin` + `FlowAdminDirectory` (SELECT em
  `jboot_identity.entitlements`/`identities`, cache 60 s por tenant).
- Leituras e mutacoes pelo ponto unico. `requireVisibleCard` (rota com
  `:cardId`, invisivel = 404): GET activities, GET anexos, GET download de anexo,
  GET checklist, GET tags do card, GET responsaveis, GET candidatos a
  responsavel (novo), GET painel Cliente; PATCH card, PATCH status, POST move
  (HTTP e socket), DELETE card, POST comentario, POST anexo, POST documento, POST
  revisao de documento, POST/DELETE responsavel, POST/DELETE tag do card, POST
  lookup/PUT/PATCH cliente, POST transferencia de escritorio (novo).
  `visibleCardScope` (conjuntos): lista do quadro (+ contagem), resumos
  (responsaveis/comentarios/anexos), tags por card, completude do checklist, 8
  consultas de metricas (inclusive por coluna e lead time) e busca de cliente por
  CPF. `identitiesWhoSeeCard`/`canSeeCard`: realtime `card.moved` (por socket e
  evento), notificacao in-app (`NotificationsService.notify`, todos os kinds),
  e-mail da automacao (`AutomationWorker.resolveRecipients`, reativo e agendado),
  candidatos e validacao de responsavel. Papel efetivo: `requireMember`,
  `requireRole`, `resolveMembership`, capacidades, `board.join`, `GET
  /kanban/boards[/:id]`. Criacao (tela, coluna, importacao de dominio):
  `CardOfficePolicy`.
- Teste de matriz (`shared/card-visibility-matrix.spec.ts`, banco real): 23
  operacoes de card x 10 perfis (admin nao membro, A, B, A+B, sem escritorio,
  membro inativo de A, nao membro de A, so escritorio inativo, `board_admin` de A
  sem `flow:admin`, outro tenant) x chave ligada/desligada = 460 verificacoes;
  mais transferencia, lista/metricas, CPF, vinculo entre escritorios e
  responsaveis. Ligada: admin/A/A+B/board_admin A = ok; B, sem escritorio, so
  inativo = 404; inativo e nao membro = 403; outro tenant = 404. Desligada:
  identico a regra anterior (membros ok; admin nao membro 403). Verificada por
  mutacao: com a checagem de escritorio removida a matriz reprova.
- Teste estatico (`shared/card-visibility.static.spec.ts`): AST de todo `src/`
  (fora specs/test) acha SQL sobre `kanban_cards` e as 6 tabelas filhas; exige
  `visibleCardScope` (direto ou por helper do arquivo) ou entrada comentada na
  allowlist (37 entradas: `post_check`, `write`, `admin`, `worker`, `rule`);
  entrada obsoleta ou redundante reprova. Verificado com sonda: consulta nova sem
  escopo reprova.
- Chave desligada preservada: a suite anterior (383 testes) passa sem mudanca de
  expectativa; os 13 specs anteriores tocados mudaram so montagem (construtor com
  o servico de visibilidade com a chave desligada) e argumentos (viewer no lugar
  de `identityId`), sem nenhuma asserção alterada ou removida.
- Telas (app): `/flow/escritorios` (abas Escritorios, Usuarios, Ativacao), selo
  e filtro de escritorio no quadro, seletor na criacao, linha de escritorio e
  transferencia no card, estado "sem escritorio", candidatos a responsavel e
  vinculo de cliente entre escritorios no modal do cliente.

UIUX Decision (Sprint 3.5):

```text
UIUX Decision:
  objective: administrar escritorios e operar o quadro com visibilidade por escritorio
  target_project: implementations/app-jboot-next-platform
  target_module: modules/kanban
  scenario_classification: covered_by_skill (CRUD de escritorios: platform-crud-ui) + covered_by_template (abas nav-tabs-custom, Alert, badge-soft, select, modal Velzon ja usados no modulo)
  template_sources_checked: skills/platform-crud-ui.md; DocumentTypesSettings.tsx (CRUD do proprio modulo); ModuleFiscalConfig (Nav); CardCustomerModal (motivo de override)
  flow:
    states:
      empty: "Nenhum escritorio cadastrado" / "Todos os cards tem escritorio" / "Todos os usuarios tem escritorio"
      loading: Spinner da pagina e por acao (salvar, atribuir, inativar)
      error: Alert danger com mensagem pt-BR dos codigos estruturados (describeOfficeError)
      success: Alert success (atribuicao/ativacao) e lista de cards afetados ao tirar usuario de escritorio
      permission_denied: Alert warning em /flow/escritorios para nao admin; aviso "Seu usuario nao esta vinculado a um escritorio. Procure o administrador." no quadro
    information_hierarchy: escritorios -> usuarios -> ativacao (pre-visualizacao antes do botao ligar)
    primary_actions: Novo escritorio; Editar escritorios do usuario; Atribuir (lote por quadro); Ligar/Desligar com confirmacao; Transferir (card); Escritorio* na criacao
  reused_components: Modal/Table/Card/Nav do reactstrap no padrao platform-crud-ui; padrao de motivo auditado do override (Sprint 3)
  new_components:
    - component: CardOfficeTransferModal
      justification: transferencia exige destino + motivo auditado; reaproveita o padrao do motivo de override
      classification: excecao_isolada
    - component: offices/OfficesAdminPage (+ OfficesListPanel, OfficeUsersPanel, OfficeActivationPanel)
      justification: tres responsabilidades do admin numa pagina com abas; cada aba segue platform-crud-ui
      classification: excecao_isolada
  navigation_impact: item "Escritórios" (ri-building-line) no menu do Flow, so com flow:admin no token
  local_agent: frontend-next-typescript + kanban-board-ui
  local_skill: platform-crud-ui, kanban-board-ui, api-client
  usability_risks: modal de escritorio sem steps (um campo so; a skill preve steps quando ha agrupamentos); filtro de escritorio e local (sobre os cards ja visiveis); selo do escritorio so aparece com o nome no contexto
  decision_status: approved_existing_pattern (aplica padroes aprovados; sem padrao novo que exija confirmacao humana)
```

Security checklist (`docs/skills/security-checklist/SKILL.md`, Sprint 3.5):

- 1 Injection: todo SQL parametrizado; `visibleCardScope` so interpola alias
  constante validado por regex e placeholders numericos validados (teste
  dedicado). OK.
- 2 Access control: tenant pelo JWT em toda consulta; card invisivel = 404 igual
  a inexistente; administracao com `@RequireScopes('flow:admin')` (teste do
  controller) e `requireAdmin` no servico; matriz em banco real; teste estatico
  contra SQL fora do ponto unico; FK compostas impedem escritorio de outro tenant
  em card/vinculo. DTOs de saida declarados (`dto/office.dto.ts`). Authn (guard) e
  authz (scope + papel efetivo + visibilidade) independentes. OK.
- 3 Dados sensiveis: eventos/auditoria so com ids, nome do escritorio e motivo do
  admin; nenhum log novo com dado pessoal; leitura do Identity somente SELECT
  (teste). `office-users` devolve nome e e-mail so ao admin. OK.
- 4 Mass assignment: DTOs com whitelist (`ValidationPipe`), `officeIds`/`cardIds`
  limitados (50/500, unicos, uuid). OK.
- 5 Paginacao/rate limit: listas administrativas com `LIMIT 500/1000`; lookup
  por CPF segue sem rate limit (B3, risco ja registrado). Sem mudanca. N/A novo.
- 6 SSRF: N/A (nenhuma chamada HTTP nova).
- 7 Dependencias: nenhuma dependencia nova (`typescript` ja era devDependency). N/A.
- 8 Frontend: sem token em localStorage novo, sem `dangerouslySetInnerHTML`. OK.
- 9 Agentes: conteudo de repositorio tratado como dado; sem acao externa ou
  destrutiva (nenhum volume/coluna/tabela removido; sem commit/push). OK.

Graph Engineering: registry do Architecture Graph (Sprint 4 de
`docs/product/api-graph-sprints.md`) segue inexistente; o grafo **nao** esta
sincronizado. Obrigacao de migracao (lifecycle `implemented`, owner `kanban`):
`data_store` `kanban_offices`, `kanban_user_offices`, `kanban_settings`;
atributo `office_id` no no `kanban_cards`; aresta `kanban` ->
`bff-jboot-identity` (`jboot_identity.entitlements`/`identities`) `consumes`,
somente leitura, via `FlowAdminDirectory`; `decision` ADR 014 (`decided_by`). O
API Contract Graph (subgrafo HTTP) inclui as 11 rotas novas, todas com consumidor
em `kanban-api.ts`; `make ai-api-graph-gate` verde.

Pendencias e desvios da Sprint 3.5:

| Item | Classificacao |
|---|---|
| Importacao de dominio (juridico/DataJud) com a chave ligada: o modulo `domain-integrations` nao envia `officeId`, entao usuario com varios escritorios e o admin recebem 422 `office_required` (com um escritorio funciona). O lado do kanban ja aceita `officeId` | resolvida em 2026-10-16: export exige `officeId` e o modal do Juridico escolhe o escritorio (branch `fix/flow-domain-integrations`) |
| B8 (monitoramento DataJud sem checagem de membresia/papel) — resolvido em 2026-10-16 (leitura exige card visivel no Flow, alteracao exige papel de edicao); registro original: as rotas de `domain-integrations` nao passam pelo `CardVisibilityService`, entao o filtro por escritorio NAO o cobre | pendencia fora do escopo; risco de seguranca mantido |
| Importacao repetida da mesma origem por usuario de outro escritorio devolve `created: false` e o id do card existente (que ele nao abre: 404) | risco residual (revela so a existencia) |
| Transferencia de card nao altera responsaveis: responsavel do escritorio de origem continua na lista, sem ver o card e sem receber notificacao/e-mail (filtro por destinatario) | decisao de produto pendente (nao coberta por P23/P28) |
| Notificacao in-app recebida antes de o usuario sair do escritorio continua na lista dele (so ids e titulo generico; abrir o card da 404) | limitacao conhecida |
| Responsavel atribuido com a chave desligada fora do escritorio do card continua responsavel ao ligar a chave (sem ver o card, sem notificacao) | limitacao conhecida; redistribuir pela tela |
| `BoardView` ainda le `members.list` (exige `flow:admin`) para nomes de responsaveis no tile; comportamento anterior, nao alterado | debito anterior |

## Pre-Requisito Da Primeira Fase: Insumos Do Cliente

Estado: **pendente** (acao do usuario/cliente; nao e sprint de codigo).

Material que so o cliente fornece e que trava as sprints indicadas:

- lista de tipos de caso usados hoje e como a central decide cada um (P1) ->
  S5 (carga inicial), S8;
- modelos de documento atuais, 2 a 3 exemplos por tipo, e se sao so campos ou
  tem texto redigido por caso (P2) -> S5, S6;
- um lead gera um ou varios casos/documentos (P3) -> S5, S6;
- campos que a central tira de cada documento (P4) -> S7;
- amostra de documentos reais anonimizados e casos ja classificados com o
  documento emitido, com origem anotada, para avaliar extracao e
  classificacao (P4, regra de fixture real do repositorio) -> S7, S8;
- base legal/consentimento para enviar documento pessoal a provedor de IA,
  confirmados pelo cliente (P5) -> S7;
- conta/chave usada no eval com a amostra real (P33) -> aceite da S7/S8.

## Sprint 4: Envio Completo Do Lead E Fila Do Gestor

Estado: **concluida** (2026-10-12; backend + telas, gates no container verdes;
sem commit, aguardando autorizacao do usuario). Entrega em "Entrega Da Sprint
4 (2026-10-12)". Depende da Sprint 3.5 (concluida).

Objetivo: o escritorio envia o lead completo para analise e o gestor principal
ve, num lugar so, os leads enviados por todos os escritorios.

Valor: substitui o WhatsApp como canal e a conferencia manual de completude.

Entregaveis funcionais:

- Acao "Enviar para analise" no card (R1), com lista do que falta quando
  incompleto.
- Campos cadastrais obrigatorios para envio configuraveis por tenant pelo
  gestor/admin (P16).
- Estado da analise do lead (`rascunho`, `enviado`, `aguardando_revisao`,
  `devolvido`) visivel no tile e no card.
- Devolucao do lead ao escritorio pelo gestor, com motivo obrigatorio;
  notificacao in-app ao criador e responsaveis; lead volta a `rascunho`
  editavel.
- Fila do gestor (somente administrador): todos os leads enviados do tenant,
  com filtro por escritorio, quadro, estado e data de envio, abrindo o card.
- Notificacao in-app aos administradores a cada envio.
- Operador ve no proprio card o estado do lead e o motivo da devolucao.
- `CardActivity.system_event` para envio e devolucao.

Criterios de aceite:

- Envio com documento obrigatorio pendente/rejeitado ou campo obrigatorio vazio
  e recusado com erro estruturado listando os itens; nada muda no card.
- Envio completo registra autor e data e aparece na fila do gestor.
- Escritorio nao edita cadastro nem documentos de lead `enviado` (P21);
  devolvido volta a ser editavel.
- Operador nunca ve lead de outro escritorio, mesmo no mesmo quadro (regra da
  Sprint 3.5); a fila do gestor responde 403 a quem nao e administrador.
- Devolucao exige motivo; evento e notificacao sem dado pessoal alem do motivo.
- Testes automatizados de envio completo/incompleto, devolucao, permissao e
  isolamento da fila. Telas com type-check/build no container.

Fora de escopo: IA, tipos de caso, modelos, geracao de documento.

### Entrega Da Sprint 4 (2026-10-12)

Contrato HTTP: `docs/api/flow-crm-leads-sprint-4-openapi.yaml`. Contratos
atualizados: `bff-jboot-platform/modules/kanban/MODULE_CONTRACT.md` e
`app-jboot-next-platform/modules/kanban/MODULE_CONTRACT.md` (secao "Envio Do Lead
E Fila Do Gestor"; gate e ADR 014 em `Contratos Obrigatorios` do bff).

- Migration `docker/postgres/init/064_kanban_lead_intake.sql` (`\connect
  jboot_kanban_demo_dev`, aditiva e idempotente): `kanban_boards.lead_intake_enabled`
  (default false, PE1); `kanban_settings.lead_required_fields_configured_at|by`;
  `kanban_lead_required_fields` (PK `client_id, field_key`); `kanban_lead_submissions`
  (ciclo por envio; UNIQUE `(client_id, id)`; FK composta para escritorio;
  CHECK de devolucao com autor/data/motivo juntos); `kanban_card_leads` (estado;
  CHECK com o enum completo; FK composta para o ciclo atual). Aplicada duas
  vezes no dev (segunda: `already exists, skipping` em todos os objetos);
  nenhum dado alterado, nenhuma coluna/tabela removida; 0 quadros com captacao
  e 0 leads no dev apos aplicar.
- Maquina de estados (`leads/lead-state.ts`, estado em campo proprio, nunca
  derivado da coluna):

  | Acao | De | Para | Quem |
  |---|---|---|---|
  | `submit` (Enviar para analise) | `rascunho`, `devolvido` | `enviado` | `flow:write` + `board_admin`/`board_member` (efetivo) + card visivel + coluna editavel + captacao ligada |
  | `return` (Devolver ao escritorio) | `enviado`, `aguardando_revisao`, `falha_processamento` | `devolvido` | somente `flow:admin` + card visivel |
  | `first_draft_generated` (PE14) | `enviado` | `aguardando_revisao` | gestor ao gerar o 1o rascunho (S6; na S4 so a tabela, sem caller) |
  | S7 | `enviado` -> `em_processamento` -> `aguardando_revisao`/`falha_processamento` | - | ator de sistema (nao implementado) |

  Sem linha = `rascunho`. `devolvido` e editavel como `rascunho` e mostra o
  motivo (interpretacao de "lead volta a rascunho editavel" + estado
  `devolvido` visivel da lista de entregaveis e da PE14). Transicao em
  transacao com lock do card (`FOR UPDATE`): dois envios concorrentes nao abrem
  dois ciclos. `system_event` `card.lead_submitted` (`submissionId`) e
  `card.lead_returned` (`submissionId`, `reason`); auditoria
  `kanban_lead_submitted|returned` e `kanban_lead_required_fields_updated`.
- Envio (R1, P13, P16): cliente vinculado; campos obrigatorios do tenant
  preenchidos (default P16: nome, data de nascimento, CEP, logradouro, numero,
  cidade e UF; CPF sempre, pelo vinculo; bairro e complemento opcionais) e todo
  obrigatorio ativo com envio mais recente `enviado` ou `aceito`. Falha = 422
  `lead_incomplete` com `customerLinked`, `missingFields` (chaves) e
  `pendingDocumentTypes` (`pendente`/`rejeitado`); nada muda no card.
- O que congela (P21, PE10; `LeadEditLock`, 409 `lead_frozen` com `leadStatus`,
  para QUALQUER usuario, inclusive `flow:admin`, fora de `rascunho`/`devolvido`):
  dados do card (PATCH: titulo, descricao, vencimento, arquivar), exclusao
  definitiva do card, cliente pelo card (PUT vinculo/troca e PATCH edicao) e
  envio de documento do checklist. O painel do cliente devolve `canEdit=false`
  e o checklist `canUpload=false`. NAO congela: revisao de documento (PE10),
  mover entre colunas, comentario e anexo do historico, tags, status,
  responsaveis e transferencia de escritorio pelo admin. Configuracao do
  checklist e do quadro nao e dado do lead.
- Snapshot: o ciclo grava o cadastro achatado (nucleo + juridico + CPF) e o
  sha256, os documentos usados (`documentTypeId`, `documentId`, estado) e os
  campos exigidos. Com o lead congelado, `GET .../lead` compara com o cadastro
  atual e devolve `customerSnapshot.outdated` + NOMES dos campos alterados
  (cadastro compartilhado alterado por outro caminho, ADR 014 Decisao 6). O
  snapshot nunca sai na API, em evento, log ou auditoria.
- Fila do gestor `GET /kanban/leads` (somente `flow:admin`; `visibleCardScope`):
  filtros por escritorio atual do card, quadro, estado e periodo do envio;
  paginada (limit <= 100); ordem do envio mais recente. Com a chave de
  escritorio desligada o admin so ve quadros em que e membro (regra anterior).
- Notificacoes in-app: envio -> administradores do `FlowAdminDirectory`
  (ainda filtrados por `identitiesWhoSeeCard`); devolucao -> criador,
  responsaveis e quem enviou que ainda veem o card. Payload so ids e motivo.
- Gatilho futuro da IA (S7, nao implementado): a transacao de
  `LeadsRepository.submit` e o ponto onde a S7 criara a linha de outbox
  `kanban_lead_analysis_runs` (ADR 014, Decisao 3); o estado `enviado` ja e o de
  entrada do pipeline. Nenhuma fila, outbox ou `src/ai` nesta sprint.
- Garantias: matriz `shared/card-visibility-matrix.spec.ts` com 25 operacoes de
  card (GET lead e envio incluidos) x 10 perfis x chave ligada/desligada (500
  verificacoes) + devolucao por perfil; teste estatico com `kanban_card_leads` e
  `kanban_lead_submissions` entre as tabelas de card (8 entradas novas na
  allowlist, `post_check`/`write`; fila e tile verificados como escopados);
  `leads/leads.service.spec.ts` em banco real (envio incompleto/completo,
  congelamento, devolucao, reenvio, snapshot, fila, tile, campos por tenant,
  DTOs).
- Telas (app): painel "Envio para analise" no card (`CardLeadPanel`,
  `LeadReturnModal`), selo do estado no tile (`LeadStatusBadge`), campos do card
  somente leitura com o lead congelado, eventos novos no historico, rota
  `/flow/leads` (abas Fila e Configuracao) com item de menu "Leads" so para
  `flow:admin`.

UIUX Decision (Sprint 4):

```text
UIUX Decision:
  objective: envio do lead pelo escritorio, fila do gestor, devolucao com motivo e estado do lead
  target_project: implementations/app-jboot-next-platform
  target_module: modules/kanban
  scenario_classification: covered_by_template (nav-tabs-custom + Card/Table/filtros como OfficesAdminPage; Alert e badge-soft; modal de motivo auditado como CardOfficeTransferModal) + covered_by_skill (configuracao e listagem operacional: platform-crud-ui)
  template_sources_checked: skills/platform-crud-ui.md; OfficesAdminPage/OfficesListPanel; CardOfficeTransferModal; ChecklistPendingBadge; DocumentTypesSettings
  flow:
    states:
      empty: "Nenhum lead encontrado com estes filtros"; "Nenhum quadro ativo"; painel do card oculto em quadro sem captacao e sem envio
      loading: Spinner da pagina, do painel e por acao (enviar, devolver, ligar captacao, salvar campos)
      error: Alert danger com mensagem pt-BR dos codigos estruturados (describeLeadError); lead_incomplete vira lista do que falta
      success: Alert success "Lead enviado para analise. O gestor foi notificado." / "Lead devolvido ao escritorio." / "Campos obrigatorios salvos"
      permission_denied: Alert warning em /flow/leads para nao admin; botoes so conforme canSubmit/canReturn do backend
    information_hierarchy: card: estado -> motivo da devolucao/aviso de bloqueio -> o que falta -> acoes -> envios anteriores; fila: filtros -> tabela (lead, escritorio, quadro, estado, envio, por) -> Abrir
    primary_actions: Enviar/Reenviar para analise; Devolver ao escritorio (admin); Abrir card (fila); Salvar campos obrigatorios; Ligar/Desligar captacao por quadro
  reused_components: Nav/Card/Table/Alert/Modal/Input reactstrap; padrao de motivo auditado (10..500, contador, aviso de dado pessoal); badge-soft do tile; deep-link ?card=
  new_components:
    - component: CardLeadPanel
      justification: estado + pendencias + acoes do envio no card; nao ha painel equivalente
      classification: excecao_isolada
    - component: LeadReturnModal
      justification: mesmo padrao do CardOfficeTransferModal, sem destino
      classification: excecao_isolada
    - component: LeadStatusBadge
      justification: estado do lead no tile, no card e na fila, mesmo padrao do ChecklistPendingBadge
      classification: excecao_isolada
    - component: leads/LeadsAdminPage (+ LeadQueuePanel, LeadSettingsPanel)
      justification: fila e configuracao do admin numa pagina com abas, como /flow/escritorios
      classification: excecao_isolada
  navigation_impact: item "Leads" (ri-inbox-archive-line) no menu do Flow, so com flow:admin; titulo do navegador "/flow/leads"
  local_agent: frontend-next-typescript + kanban-board-ui
  local_skill: platform-crud-ui, kanban-board-ui, api-client
  usability_risks: lead congelado deixa titulo/descricao/vencimento somente leitura (aviso no rodape); fila filtra pelo escritorio ATUAL do card; filtro inicial da fila = "Enviado para analise"; captacao ligada por quadro sem confirmacao (reversivel, nao apaga nada)
  decision_status: approved_existing_pattern (aplica padroes aprovados; sem padrao novo que exija confirmacao humana)
```

Security checklist (`docs/skills/security-checklist/SKILL.md`, Sprint 4):

- 1 Injection: todo SQL parametrizado; `visibleCardScope` reutilizado (alias
  constante, placeholders validados); filtros da fila como parametros tipados
  (`::uuid`, `::text`, `::date`); chaves de campo validadas contra whitelist em
  codigo e por CHECK de formato no banco. OK.
- 2 Access control: tenant pelo JWT em toda consulta; rotas com `:cardId` por
  `requireVisibleCard` (invisivel = 404) e incluidas na matriz; envio com scope
  `flow:write` + papel efetivo + coluna editavel; devolucao, fila e campos com
  `@RequireScopes('flow:admin')` (teste dos controllers) e checagem no servico
  (403 `lead_admin_required`); fila e tile por `visibleCardScope`; FK compostas
  amarram ciclo e escritorio ao mesmo tenant. DTOs de saida declarados
  (`leads/dto/lead.dto.ts`); snapshot nunca devolvido. Authn (guard) e authz
  (scope + papel + visibilidade + estado) independentes. OK.
- 3 Dados sensiveis: evento, auditoria, notificacao e log so com ids, estado e
  motivo digitado pelo admin (teste: CPF ausente do erro e da auditoria); logs
  de falha de notificacao so com id do card. Snapshot do cadastro (dado
  pessoal) fica no banco do tenant como registro do envio; retencao segue P18
  (pendente, antes de producao). OK com pendencia de retencao ja registrada.
- 4 Mass assignment: `ValidationPipe` com whitelist; `ReturnLeadDto` (motivo
  aparado 10..500), `ListLeadQueueQueryDto` (uuid, enum, data estrita, limit
  1..100), `UpdateLeadSettingsDto` (<= 40 chaves unicas, <= 64 caracteres),
  `UpdateBoardDto.leadIntakeEnabled` booleano. OK.
- 5 Paginacao/rate limit: fila paginada (limit <= 100); historico de ciclos com
  `LIMIT 20`; sem rate limit novo (platform sem throttler, B3). OK.
- 6 SSRF: N/A (nenhuma chamada HTTP nova).
- 7 Dependencias: nenhuma dependencia nova. N/A.
- 8 Frontend: sem token novo em storage, sem `dangerouslySetInnerHTML`; motivo e
  titulo renderizados como texto. OK.
- 9 Agentes: conteudo de repositorio tratado como dado; sem acao externa ou
  destrutiva (migration aditiva, sem volume/coluna/tabela removida, sem
  commit/push); sem IA, sem `src/ai`. OK.

Graph Engineering: o registry do Architecture Graph (Sprint 4 de
`docs/product/api-graph-sprints.md`) segue inexistente; o grafo **nao** esta
sincronizado. Obrigacao de migracao (lifecycle `implemented`, owner `kanban`):
`data_store` `kanban_card_leads`, `kanban_lead_submissions`,
`kanban_lead_required_fields`; atributo `lead_intake_enabled` no no
`kanban_boards` e `lead_required_fields_configured_*` em `kanban_settings`;
aresta `kanban` -> `notifications` (kinds `kanban.card.lead_submitted|returned`);
aresta `kanban` -> `establishment-customers` (leitura do cadastro para o
snapshot, ja existente); `feature` `flow-crm-leads-phase-1` com a S4
`implemented`. O API Contract Graph inclui as 6 rotas novas, todas com
consumidor em `kanban-api.ts`; `PATCH /kanban/boards/:id` ganhou consumidor
(`kanbanApi.boards.update`) e a entrada `planned` dela foi REMOVIDA de
`tools/ai/api-graph-accepted.yaml` (entrada obsoleta, exigida pelo gate; nenhum
achado novo aceito). `make ai-api-graph-gate` verde.

Pendencias e desvios da Sprint 4:

| Item | Classificacao |
|---|---|
| `devolvido` tratado como estado editavel (equivale a rascunho com motivo visivel), em vez de voltar literalmente a `rascunho` | interpretacao das duas redacoes do artefato (entregavel lista `devolvido`; PE14 idem); corrigir se o usuario quiser `rascunho` |
| Congelamento vale tambem para `flow:admin` (o gestor corrige devolvendo, para preservar o snapshot) | decisao derivada de P21/PE10; corrigir se o gestor precisar editar o lead enviado |
| Comentario e anexo do historico continuam liberados com o lead enviado (anexo nao e documento do checklist) | decisao derivada; anexo nao entra no snapshot |
| Fila nao mostra nome do cliente nem "desatualizado" por linha (evita N leituras do cadastro por pagina); "desatualizado" aparece no card | limitacao conhecida |
| Snapshot do cadastro e dado pessoal retido junto do ciclo; politica de retencao depende de P18 | pendencia ja registrada (antes de producao) |
| Admin ve a fila so dos quadros em que e membro quando a chave de escritorio esta desligada (regra anterior preservada) | comportamento esperado da chave desligada |
| Notificacao de envio nao chega ao admin que nao ve o card (chave desligada e nao membro) | consequencia do filtro unico por destinatario |
| Captacao por quadro liga/desliga sem confirmacao modal | risco baixo (reversivel); registrado na UIUX Decision |

## Sprint 5: Cadastro De Tipos De Caso E Modelos De Documento

Estado: **concluida** (2026-10-12; backend + telas, gates no container verdes;
sem commit, aguardando autorizacao do usuario). Entrega em "Entrega Da Sprint 5
(2026-10-12)". P2a e P3 aprovadas em 2026-10-12; P1 so para a carga inicial (o
cadastro comeca vazio; nenhum tipo de caso foi inventado).

Objetivo: o gestor cadastra os tipos de caso, os criterios de classificacao e
os modelos de documento que o cliente ja usa.

Valor: transforma o conhecimento da central em configuracao que a geracao e a
IA consomem.

Entregaveis funcionais:

- Tipo de caso (por tenant): nome, descricao, criterios de classificacao em
  texto, evidencias/documentos esperados, modelo(s) vinculado(s), modelo
  padrao, ativo/inativo (sem exclusao).
- Modelo de documento (por tenant): nome, arquivo no formato definido em P2
  (premissa: `.docx` com variaveis marcadas), versao; trocar o arquivo cria
  versao nova e preserva a anterior.
- Catalogo de variaveis disponiveis para o modelo: dados do cliente (nucleo e
  `customer_juridico`), dados do caso e, a partir da S7, dados extraidos. Ao
  subir o modelo, o sistema lista as variaveis encontradas e aponta as
  desconhecidas, marcando cada uma como obrigatoria ou opcional.
- Somente gestor/admin (`flow:admin`) cadastra e altera.

Criterios de aceite:

- Modelo com variavel desconhecida e salvo com aviso e nao e usado na geracao
  ate a variavel ser corrigida ou removida [P].
- Nova versao de modelo nao altera documento ja gerado com a versao anterior.
- Tipo de caso inativo nao aparece para classificacao nem geracao.
- Cadastro isolado por tenant; operador de escritorio nao acessa a
  configuracao (403).
- Mesmos limites e verificacao de assinatura de arquivo dos anexos.
- Testes automatizados de CRUD, versionamento, deteccao de variaveis e
  permissao. Telas com type-check/build no container.

Fora de escopo: IA; editor de modelo dentro do Flow (o modelo e editado no
Word e enviado de novo).

### Entrega Da Sprint 5 (2026-10-12)

Contrato HTTP: `docs/api/flow-crm-leads-sprint-5-openapi.yaml`. Contratos
atualizados: `bff-jboot-platform/modules/kanban/MODULE_CONTRACT.md` (secao "Tipos
De Caso E Modelos De Documento", dependencia nova, tabelas, prefixo de storage,
restricoes) e `app-jboot-next-platform/modules/kanban/MODULE_CONTRACT.md` (rota
`/flow/leads` com as abas novas e secao da Sprint 5).

- Migration `docker/postgres/init/065_kanban_case_types_templates.sql` (`\connect
  jboot_kanban_demo_dev`, aditiva e idempotente): `kanban_document_templates`,
  `kanban_document_template_versions` (imutavel por trigger
  `kanban_template_versions_immutable_trg`; CHECK da chave
  `{client_id}/templates/{template_id}/{id}.docx`; UNIQUE `(client_id,
  template_id, version)`), `kanban_template_version_variables` (trigger
  `kanban_template_variables_guard_trg`: so `required` muda; DELETE recusado),
  `kanban_case_types` (nome unico entre ativos) e `kanban_case_type_templates`
  (N:N; FK composta adiavel `kanban_case_types_default_template_fkey` exige o
  padrao entre os vinculados). Aplicada duas vezes no dev (segunda: `already
  exists, skipping` em todas as tabelas e indices; funcoes `CREATE OR REPLACE`;
  triggers e constraints por `IF NOT EXISTS`); nenhuma coluna/tabela removida,
  nenhum dado alterado; 0 tipos de caso, 0 modelos e 0 versoes no dev.
- Dependencias (instaladas no container, versao exata, lockfile atualizado,
  licenca conferida no `package.json` instalado): `docxtemplater` 3.71.0 (MIT,
  so o core) e `pizzip` 3.3.0 (`MIT OR GPL-3.0`, usado sob MIT); transitivas
  `@xmldom/xmldom` 0.9.12 (MIT) e `pako` 2.2.0 (MIT AND Zlib). `npm audit
  --omit=dev`: nenhum aviso nas dependencias novas (os avisos existentes sao de
  `proxy-addr`, `qs`, `socket.io-parser` etc., anteriores a esta sprint).
- Tipos de caso: nome, descricao, criterios de classificacao em texto,
  evidencias/documentos esperados, modelos vinculados (N), modelo padrao (entre
  os vinculados), ativo/inativo (sem exclusao). Vinculo novo so com modelo
  ativo; vinculo existente a modelo inativo pode ficar.
- Modelos: nome, descricao, ativo/inativo (sem exclusao); arquivo so por versao.
  Versao imutavel; trocar o arquivo cria versao nova e vira a atual; a anterior
  fica no historico com `sha256`, status e variaveis. Variaveis detectadas com
  marca obrigatoria/opcional (default obrigatoria; unica mudanca permitida numa
  versao, auditada).
- Pipeline do upload (falha fechada; codigos no OpenAPI): (0) `flow:admin` e
  modelo do tenant; (1) `assertAttachmentFileAllowed` (25 MB, allowlist,
  assinatura) + `.docx` por tipo e extensao + 10 MB; (2) worker thread
  (`TemplateValidationRunner`: timeout 20 s, heap 512 MB, 2 por processo):
  diretorio central lido sem descompactar (<= 2.000 entradas, <= 50 MB
  descompactado declarado, razao <= 100:1 total e por entrada >= 1 MB; ZIP64,
  multi-disco, criptografia, metodo desconhecido, nome inseguro, entrada
  duplicada ou sobreposta recusados); descompactacao propria com
  `maxOutputLength` = tamanho declarado + conferencia de tamanho e CRC; (3)
  pacote Word: content type `wordprocessingml.document.main+xml`, recusa
  `.docm`/`.dotm`/vbaProject, ActiveX/OLE/embeddings/altChunk, relacionamento
  externo que nao seja hyperlink (modelo anexo externo = aviso) e campos
  DDE/DDEAUTO/INCLUDEPICTURE/INCLUDETEXT/LINK/IMPORT; (4) compilacao
  `docxtemplater` com `{{ }}`, `paragraphLoop`, `errorLogging: false` e parser
  restrito (erros multiplos = 422 `template_invalid` com `id`, `tag`, `part`,
  `offset`); (5) `inspect-module` do core: raw = 422, fora da gramatica = 422,
  uso incompativel (texto como laco, booleano/colecao como texto) = 422,
  desconhecida = versao `invalid_variables`; (6) aviso de tag quase certa
  (`{cliente.nome}`); (7) render de prova com `buildTemplateData(SYNTHETIC_TEMPLATE_SOURCE)`;
  (8) objeto `{client_id}/templates/{template_id}/{version_id}.docx` no bucket
  do modulo -> versao + variaveis + `current_version_id` numa transacao (falha
  remove o objeto, `deleteQuietly`).
- Catalogo (`template-variable-catalog.ts`, `TEMPLATE_CATALOG_VERSION = 1`):
  `cliente.*` (nucleo: nome, cpf, email, telefone, endereco_cep, _logradouro,
  _numero, _complemento, _bairro, _cidade, _uf, endereco_completo; juridico:
  data_nascimento, data_nascimento_extenso, nacionalidade, estado_civil,
  profissao, rg_numero, rg_orgao_emissor, rg_uf, nome_mae, numero_beneficio,
  especie_beneficio, banco_pagamento; booleano hipossuficiente),
  `escritorio.nome` (P29: so o nome, do cadastro de escritorio do card),
  `lead.data_envio`, `lead.data_envio_extenso`, laco `lead.casos` (itens `ordem`,
  `tipo`; P3), `caso.tipo` (caso do documento, namespace da ADR 014),
  `data.hoje`, `data.hoje_extenso` (fuso de Brasilia). Formatacao pronta (CPF
  `000.000.000-00`, CEP, telefone, `dd/mm/aaaa`, "5 de marco de 1960", dia 1 =
  "1º"). `cliente.observacoes` fica fora (nota interna).
- Preparacao da S6: `DocumentTemplatesService.resolveForGeneration(context,
  caseTypeId, templateId?)` -> `generation-template.ts` (tipo ativo; modelo
  informado precisa estar vinculado, senao o padrao; modelo ativo; versao ATUAL
  `valid`; sem fallback para versao anterior) devolve `storageKey`, `sha256`,
  `catalogVersion` e variaveis. A S6 le o objeto, confere o `sha256`, monta os
  dados com `buildTemplateData` (mesma funcao do render de prova) e grava
  `template_version_id` + `sha256`. Sem rota HTTP de geracao nesta sprint.
- Testes (bff, banco real com ROLLBACK onde ha SQL): `docx-template-validator.spec.ts`
  (14: zip bomb por entradas/razao/tamanho/tamanho mentido/sobreposicao,
  `{{@raw}}`, gramatica, uso incompativel, sintaxe, aviso, `.docm`/vbaProject,
  OLE/ActiveX, imagem externa, DDE/INCLUDEPICTURE, hyperlink, render de prova),
  `template-variable-catalog.spec.ts` (4), `template-validation-runner.spec.ts`
  (2: worker e timeout), `document-templates.repository.spec.ts` (5:
  versionamento, imutabilidade por trigger, FK do padrao, resolucao da geracao,
  isolamento por tenant), `document-templates.service.spec.ts` (8: permissao 403
  em todo metodo e controller, upload, compensacao, tipos de caso). Fixtures
  `.docx` montadas em codigo (`src/test/docx-fixture.ts`), sem documento real.
- Telas (app): abas "Tipos de caso" e "Modelos" em `/flow/leads`
  (`CaseTypesPanel`, `DocumentTemplatesPanel`, `TemplateVariablesCatalogModal`),
  `lib/document-templates.ts` e client tipado `kanbanApi.caseTypes` /
  `kanbanApi.documentTemplates`; testes `document-templates.spec.ts` e
  `kanban-api.document-templates.spec.ts`.

UIUX Decision (Sprint 5):

```text
UIUX Decision:
  objective: cadastro de tipos de caso (criterios, modelos vinculados, padrao) e de modelos .docx versionados com catalogo de variaveis, somente flow:admin
  target_project: implementations/app-jboot-next-platform
  target_module: modules/kanban
  scenario_classification: covered_by_skill (platform-crud-ui: listagem + modal xl com steps sem numero) + covered_by_template (nav-tabs-custom de /flow/leads, Table/badge-soft, Alert, form-switch)
  template_sources_checked: skills/platform-crud-ui.md; PdvAdminPage (modal com steps); OfficesListPanel; LeadsAdminPage; CardDocumentsPanel (download por URL assinada)
  flow:
    states:
      empty: "Nenhum tipo de caso cadastrado." / "Nenhum modelo cadastrado." / step Modelos sem modelo ativo aponta para a aba Modelos / step Variaveis sem arquivo
      loading: Spinner da aba, do Editar (busca fresca), do Salvar e por acao (inativar, detalhes, download)
      error: Alert danger com mensagem pt-BR dos codigos (templateErrorDetails), com a lista de tags/erros do backend; recusa de upload mantem o modal aberto na etapa Arquivo
      success: Alert success "Tipo de caso cadastrado/atualizado", "Modelo salvo. Versao N pronta para uso."; versao com variavel desconhecida ou aviso mantem o modal com Alert warning
      permission_denied: Alert warning da pagina (403 de qualquer aba -> onForbidden)
    information_hierarchy: aba Tipos de caso: tipo -> modelo padrao -> vinculados -> situacao -> acoes; aba Modelos: modelo -> versao atual -> estado do arquivo -> tipos de caso -> situacao -> acoes; modal do modelo: dados -> arquivo e versoes -> variaveis
    primary_actions: Novo tipo de caso; Novo modelo; Variaveis disponiveis; Salvar (inclui envio de nova versao e marcas obrigatoria/opcional); Inativar/Reativar; Baixar versao
  reused_components: Nav/Card/Table/Modal/Input/Alert/Spinner reactstrap; nav-pills de steps do PdvAdminPage; badge-soft; padrao de download do CardDocumentsPanel; formatLeadDate
  new_components:
    - component: leads/CaseTypesPanel
      justification: CRUD novo do tenant; aplica platform-crud-ui sem variacao
      classification: excecao_isolada
    - component: leads/DocumentTemplatesPanel
      justification: CRUD com versoes de arquivo imutaveis e variaveis detectadas; nao ha CRUD de arquivo versionado na platform
      classification: excecao_isolada
    - component: leads/TemplateVariablesCatalogModal
      justification: referencia somente leitura do catalogo para quem edita o modelo no Word (copiar a tag)
      classification: excecao_isolada
  navigation_impact: nenhum item de menu novo; duas abas novas em /flow/leads (ja restrita a flow:admin) entre Fila e Configuracao
  local_agent: frontend-next-typescript + kanban-board-ui
  local_skill: platform-crud-ui, api-client, kanban-board-ui
  usability_risks: envio do arquivo acontece no Salvar (nao na selecao); modelo criado continua salvo mesmo se o upload for recusado (modal passa a edicao com o motivo); "Variaveis desconhecidas" so libera com versao nova; marca obrigatoria/opcional so na versao atual e desabilitada para variavel fora do catalogo
  decision_status: approved_existing_pattern (aplica padroes aprovados; sem padrao novo que exija confirmacao humana)
```

Security checklist (`docs/skills/security-checklist/SKILL.md`, Sprint 5):

- 1 Injection: SQL parametrizado em todos os repositorios (arrays por
  `unnest($n::text[])`/`ANY($n::uuid[])`); modelo nunca e executado: parser
  restrito ao caminho com pontos, sem avaliador de expressao, sem
  `angular-expressions`, so propriedade propria (teste com `constructor` e
  `toString`); `{{@...}}` recusado; valores sempre escapados pelo core. Nenhum
  comando de sistema. OK.
- 2 Access control: tenant pelo JWT em toda query; todas as 13 rotas com
  `@RequireScopes('flow:admin')` (teste de metadata) e `requireFlowAdmin` no
  servico (teste com 14 metodos -> 403); FK compostas `(client_id, id)` em todos
  os vinculos; recurso de outro tenant = 404. DTOs de saida declarados
  (`storageKey`/bucket nunca saem na API). Authn (guard) e authz (scope +
  servico) independentes. OK.
- 3 Dados sensiveis: chave do objeto sem nome de arquivo (CHECK no banco);
  auditoria e log so com ids, versao, status, `sha256` e codigo de recusa (teste:
  nome do arquivo ausente da auditoria); erros 4xx sem nome de arquivo e sem
  conteudo do documento (so tags do proprio modelo); render de prova e exemplos
  da tela so com dados sinteticos; `errorLogging: false` no core (o logger
  padrao imprime o contexto do modelo). Nenhum segredo novo. OK.
- 4 Mass assignment: `ValidationPipe` com whitelist; DTOs explicitos com
  limites (nome 160, descricao 2000, criterios 8000, evidencias 4000, ate 50
  modelos vinculados unicos, ate 500 variaveis por PATCH); `client_id` nunca no
  payload. OK.
- 5 Paginacao/rate limit: listagens com `LIMIT` (500 tipos/modelos, 100
  versoes, 1000 variaveis); upload limitado a 10 MB no multer e a 2 validacoes
  simultaneas por processo; sem rate limit novo (platform sem throttler, B3). OK
  com pendencia B3 existente.
- 6 SSRF: nenhuma requisicao de saida; vinculos externos do modelo recusados
  (exceto hyperlink, que o servidor nunca segue); `@xmldom/xmldom` sem entidade
  externa nem rede; LibreOffice/PDF so na S6. OK.
- 7 Dependencias: `docxtemplater` 3.71.0 e `pizzip` 3.3.0 com versao exata,
  licenca MIT verificada no pacote instalado, `npm audit --omit=dev` sem aviso
  nas novas (transitivas `@xmldom/xmldom` 0.9.12 e `pako` 2.2.0). Upload de
  arquivo do cliente: zip bomb (limites antes de inflar + saida limitada ao
  declarado + CRC), macro, OLE/ActiveX, vinculo externo e DDE testados;
  validacao em worker com timeout e teto de heap (fora do event loop
  compartilhado). OK.
- 8 Frontend: sem token novo em storage; sem `dangerouslySetInnerHTML`; nomes,
  tags e avisos renderizados como texto; download por URL assinada de 5 min com
  `noopener noreferrer`. OK.
- 9 Agentes: conteudo de repositorio tratado como dado; sem acao destrutiva
  (migration aditiva, nenhum volume/coluna/tabela removido; sem commit/push);
  sem IA, sem `src/ai`, sem domain-integrations nem juridico; nenhum token
  assinado com segredo do Identity. OK.

Graph Engineering: o registry do Architecture Graph (Sprint 4 de
`docs/product/api-graph-sprints.md`) segue inexistente; o grafo **nao** esta
sincronizado. Obrigacao de migracao (lifecycle `implemented`, owner `kanban`):
`data_store` `kanban_case_types`, `kanban_case_type_templates`,
`kanban_document_templates`, `kanban_document_template_versions`,
`kanban_template_version_variables`; aresta `kanban` -> `kanban-card-attachments`
(`stores_in`, prefixo `{client_id}/templates/...`, `decided_by` ADR 014);
`feature` `flow-crm-leads-phase-1` com a S5 `implemented`. Bibliotecas
(`docxtemplater`, `pizzip`) nao sao nos (Architect, 2026-10-11). O API Contract
Graph inclui as 13 rotas novas, todas com consumidor em `kanban-api.ts`; nenhum
achado aceito; `make ai-api-graph-gate` verde.

Pendencias e desvios da Sprint 5:

| Item | Classificacao |
|---|---|
| Versao atual com variavel desconhecida bloqueia o modelo na geracao (sem fallback para a ultima versao valida) | interpretacao literal do criterio "nao e usado na geracao ate a variavel ser corrigida"; corrigir se o usuario preferir fallback |
| `required` da variavel e alteravel depois do upload (unica mudanca permitida na versao; o arquivo, o status e o conjunto de variaveis sao imutaveis) | decisao derivada da ADR 014 passo 8 ("o gestor marca"); a S6 deve gravar a marca vigente em `filled_variables` |
| Namespace `caso.tipo` incluido alem de `lead.*` (a ADR 014 lista `caso.*`; o pedido da sprint lista `lead.*`) | decisao de catalogo; `escritorio.*` so `nome` (premissa P29) |
| Limites anti zip-bomb e do runner sao constantes em codigo (`TEMPLATE_LIMITS`, `DEFAULT_VALIDATION_RUNNER_OPTIONS`), nao env | "configuraveis" = alteraveis no codigo com teste; env exigiria Dev Runtime Profile |
| Imagem dinamica, HTML, graficos e objetos incorporados recusados ou fora (modulos PRO) | fora da fase 1 (ADR 014); grafico com planilha incorporada e recusado como objeto |
| Carga inicial de tipos de caso e modelos reais | depende de P1 e P2 (insumos do cliente); cadastro comeca vazio |
| Skill local `modules/kanban/skills/kanban-document-templates.md` proposta pelo gate nao foi criada (como a `kanban-lead-intake.md` da S4) | pendencia de governanca; regras ficam no `MODULE_CONTRACT.md` |
| Smoke HTTP autenticado nao executado (sem credencial de dev documentada e proibido assinar token); validado por testes de controller/servico e pelo worker compilado em `dist` | registrado |

## Sprint 6: Geracao Do Documento Com Classificacao Manual, Revisao E Entrega

Estado: **em andamento** (2026-10-12: backend, infra de dev e telas entregues,
gates no container verdes; commitada; conclusao depende do aceite com modelo real
do cliente e verificacao das fontes, P2).
**Conclusao depende de modelo real (P2)**: os criterios "teste com modelo real
anonimizado" e "PDF com o mesmo conteudo textual do `.docx` aprovado (teste com
o modelo real)", e a verificacao das fontes usadas nos modelos (sprint gate do
Architect: "so conclui com modelo real do cliente e as fontes usadas nos
modelos"), so fecham com o insumo do cliente. Entrega em "Entrega Da Sprint 6
(2026-10-12)".

Objetivo: o gestor escolhe o tipo de caso do lead enviado e o sistema gera o
documento a partir do modelo vinculado, com os dados do cadastro; o gestor
revisa, aprova e o escritorio recebe.

Valor: fecha o circuito ponta a ponta sem IA e sem enviar dado a provedor
externo; vira a base que as Sprints 7 a 9 automatizam.

Entregaveis funcionais:

- Painel "Analise" no card (gestor): tipo de caso (escolha manual), modelo
  (padrao do tipo, trocavel), botao "Gerar documento".
- Geracao por preenchimento das variaveis (R5: obrigatoria faltante bloqueia
  com lista; opcional sai com marcador).
- Documento gerado nasce `rascunho`, versionado no card; regerar cria versao
  nova.
- Acoes do gestor: aprovar, substituir por versao editada (upload do `.docx`
  revisado), devolver ao escritorio (S4).
- Documento aprovado: o sistema gera o PDF a partir do `.docx` aprovado (o
  rascunho fica so em `.docx`); download nos dois formatos; notificacao in-app
  ao escritorio; estado do lead `aprovado`. Substituir por versao editada gera
  PDF novo.
- Falha na conversao nao desfaz a aprovacao: o documento fica "PDF pendente",
  com nova tentativa automatica e botao "Gerar PDF novamente" para o gestor; o
  `.docx` aprovado continua disponivel.
- Visibilidade (P11, aprovada): o escritorio do card ve estado, pendencias e o
  documento aprovado (`.docx` e PDF); classificacao, rascunhos e historico de
  geracao so o administrador.
- `CardActivity.system_event` para classificacao, geracao, aprovacao e
  substituicao (sem dado pessoal).

Criterios de aceite:

- Documento gerado contem exatamente os valores do cadastro nas variaveis do
  modelo; teste com modelo real anonimizado fornecido pelo cliente.
- Variavel obrigatoria vazia impede a geracao e lista os campos.
- So o gestor gera, aprova e substitui; operador nunca aprova.
- Documento aprovado guarda tipo, modelo, versao do modelo, aprovador e data.
- Versao anterior continua acessivel no historico do card.
- PDF do aprovado tem o mesmo conteudo textual do `.docx` aprovado (teste com o
  modelo real); falha de conversao testada (aprovacao mantida, "PDF pendente",
  nova tentativa sem duplicar arquivo).
- Escritorio de outro card nunca ve o documento (regra da Sprint 3.5).
- Testes automatizados de geracao, bloqueio por campo faltante, aprovacao,
  conversao, permissao e isolamento. Telas com type-check/build no container.

Fora de escopo: IA, PDF do rascunho, assinatura digital, protocolo, envio ao
cliente final.

### Entrega Da Sprint 6 (2026-10-12)

Contrato HTTP: `docs/api/flow-crm-leads-sprint-6-openapi.yaml` (11 rotas, todas
com consumidor no `kanban-api.ts`). Contratos atualizados:
`bff-jboot-platform/modules/kanban/MODULE_CONTRACT.md` (secao "Analise Do Lead,
Documento Gerado E PDF", Dev Runtime Profile `code-up:kanban-leads`, fila
`kanban-document-pdf` na excecao de Valkey, restricao do conversor) e
`app-jboot-next-platform/modules/kanban/MODULE_CONTRACT.md` (secao e target).

- Migration `docker/postgres/init/066_kanban_lead_analysis_documents.sql`
  (`\connect jboot_kanban_demo_dev`, aditiva e idempotente):
  `kanban_lead_cases` (caso por ciclo de envio, N por lead; troca/remocao com
  `superseded_at|by|reason` e CHECK de motivo; troca aponta `replaces_case_id`;
  FK compostas para ciclo, tipo de caso e caso anterior) e
  `kanban_card_generated_documents` (versao por caso; `origin
  generated|uploaded_edit` com `based_on_document_id`; FK compostas para ciclo,
  caso, modelo e versao do modelo; `template_sha256`, `catalog_version`,
  `filled_variables`, `ai_run_id` reservado para a S9; `status
  rascunho|aprovado|substituido`; PDF `pdf_status pending|done|failed`,
  `pdf_requested_at`, `pdf_attempts`, `pdf_lease_until`, `pdf_error_code`,
  `pdf_storage_key|sha256|size_bytes|completed_at`; CHECKs da chave
  `{client_id}/{card_id}/generated/{id}.docx|.pdf`, aprovador+data, rascunho sem
  PDF, `done` com arquivo; trigger `kanban_generated_documents_guard_trg`:
  nada e apagado, arquivo/origem/modelo/valores imutaveis). Aplicada duas vezes
  no dev (a 1a tentativa falhou por nome de CHECK que colide com o nome
  automatico do Postgres; corrigido antes de qualquer dado: sem DROP; a segunda
  execucao do arquivo final = `already exists, skipping` em tabelas e indices,
  funcao `CREATE OR REPLACE`, trigger por `IF NOT EXISTS`). Nenhuma
  coluna/tabela removida, nenhum dado alterado.
- Fluxo de estados do documento: `rascunho` (gerado) -> `aprovado` (gestor
  aprova; `pdf_status = 'pending'` na MESMA transacao, outbox) | `substituido`
  (nova geracao do caso, versao editada, aprovacao de outra versao, troca ou
  remocao do caso). Versao editada nasce `aprovado` (o gestor e o revisor) com
  PDF novo. PDF: `pending -> done` | `pending` (falha transitoria, ate 3
  tentativas com backoff) `-> failed` ("PDF pendente"; "Gerar PDF novamente"
  volta a `pending` com tentativas zeradas). A aprovacao e o `.docx` nunca sao
  desfeitos pela falha do PDF.
- Estado do lead (regra unica `lead-analysis-state.ts`, mesma transacao, card
  travado): 1o documento do ciclo `enviado -> aguardando_revisao` (PE14,
  `first_draft_generated`); todo caso ativo com documento aprovado
  `aguardando_revisao -> aprovado` (`documents_approved`); caso acrescentado,
  trocado ou removido sem aprovado `aprovado -> aguardando_revisao`
  (`analysis_reopened`). Devolver continua proibido a partir de `aprovado` (S4).
- Classificacao manual (`flow:admin`): N casos por lead (P3), so tipo ativo, sem
  repetir tipo ativo no ciclo (409), ate 20 casos; troca e remocao com motivo
  (10..500) auditado.
- Geracao: versao ATUAL `valid` do modelo padrao (ou vinculado escolhido),
  `sha256` do objeto conferido antes de renderizar; dados = snapshot do envio
  atual (cliente) + escritorio atual do card + casos ativos + data; obrigatoria
  vazia = 422 com a lista e nada gravado; opcional vazia = `[PREENCHER: campo]`;
  render no worker thread (tarefa `render` do `TemplateValidationRunner`, mesmo
  teto de 20 s / 512 MB) reaproveitando parser restrito e checagem de pacote da
  S5; `filled_variables` grava valor, origem (`cadastro_enviado`, `escritorio`,
  `lead`, `caso`, `sistema`) e a marca obrigatoria vigente.
- PDF: fila BullMQ `kanban-document-pdf` (jobId `pdf-<documentId>`, 3
  tentativas, backoff exponencial 5 s) + varredura a cada 2 min por tenant
  ativo; worker in-process com concorrencia 1; claim com lease de 180 s; PDF ja
  gravado e reaproveitado (sem segundo arquivo); `PdfConverterClient` com `fetch`
  nativo, basic auth, multipart `document.docx`, timeout 60 s, `redirect:
  error`, `%PDF-` e teto de 50 MB conferidos.
- Visibilidade (P11): `GET|POST .../analysis*` so `flow:admin` + card visivel;
  escritorio usa `GET .../lead/documents` e `.../download` (so aprovado de caso
  ativo do ciclo atual; resto = 404). Historico do card: eventos de
  classificacao, geracao e substituicao filtrados no SQL para quem nao e admin
  (paginacao e total sem vazamento). Notificacao in-app
  `kanban.card.lead_document_approved` ao criador, responsaveis e quem enviou que
  veem o card.
- Infra de dev (skill `dev-runtime-profile`): servico `gotenberg` (profile
  `pdf`), rede `jboot-pdf-internal` (`internal: true`), `jboot` nas duas redes,
  envs `JBOOT_PDF_CONVERTER_*` derivadas (mesmas variaveis do basic auth do
  Gotenberg), `.env.example` com valores de dev, target `kanban-leads` em
  `tools/code-up.sh`/`code-down.sh` (`gotenberg` `forbidden_by_default` nos
  demais). Imagem `gotenberg/gotenberg:8.37.0-libreoffice` CONFERIDA no Docker
  Hub (publicada em 2026-09-11) e fixada por digest
  `sha256:c85f019d6ae4927714507254331cc0ed72da7b619ee798e3a45de01f54372c12`.
  Desvio da ADR: alem de `internal: true`, `dns: 127.0.0.1` no `gotenberg`
  (o Docker 24 ainda resolvia nome externo a partir da rede interna; agora nem
  DNS sai). Evidencia: de dentro do `gotenberg`, `curl https://example.com` =
  `Could not resolve host` e `curl http://1.1.1.1` = timeout; `docker port
  jboot-gotenberg` vazio; rede `internal=true`; container `ReadonlyRootfs=true`,
  `CapDrop=[ALL]`, `PidsLimit=256`, `Memory=1 GiB`, `NanoCpus=1e9`,
  `no-new-privileges`, usuario `gotenberg`; do `jboot`, `/health` = 200 e
  conversao sem credencial = 401.
- Fontes dos modelos (risco do Architect): procedimento registrado no contrato
  do bff (fontes do `.docx` x `fc-list` do container, comparacao de texto com
  `src/test/pdf-text.ts`, imagem derivada versionada se faltar fonte). A imagem
  traz Liberation, Carlito, Caladea, DejaVu e Noto; nao traz fontes
  proprietarias do Office. **Nao verificado com modelo real** (P2 pendente).
- Testes (bff, `npm test` 521/521; banco real com ROLLBACK onde ha SQL; fixtures
  `.docx` sinteticas montadas em codigo): `lead-analysis/*.spec.ts` (fluxo
  completo, R5, permissao, versao editada, N casos, estados, PDF retry,
  historico P11, controllers), `pdf/document-pdf.service.spec.ts`,
  `pdf/pdf-converter.client.spec.ts`, `pdf/gotenberg.integration.spec.ts`
  (Gotenberg REAL; pula com "suba com `make code-up TARGET=kanban-leads`" se o
  conversor estiver fora), `document-templates/docx-render.spec.ts`; matriz de
  visibilidade com 27 operacoes de card x 10 perfis x chave ligada/desligada e
  9 operacoes de gestao exclusivas do admin; teste estatico com
  `kanban_lead_cases` e `kanban_card_generated_documents` entre as tabelas de
  card (23 entradas novas comentadas na allowlist).
- Smoke do PDF no container (2026-10-12): `.docx` sintetico renderizado pelo
  caminho da geracao, gravado no MinIO real, convertido pelo
  `DocumentPdfService` com o Gotenberg real: `outcome=done`, 1 tentativa, 177 ms,
  15.401 bytes, `%PDF-1.7`, chave e `sha256` conferidos, texto extraido igual
  ao do `.docx`; segunda execucao `skipped` (sem segundo arquivo); objetos
  removidos e banco em ROLLBACK depois do smoke.
- Telas (app): `CardAnalysisPanel` ("Analise (gestor)"), `LeadCaseReasonModal`,
  `LeadDocumentUploadModal`, `CardLeadDocumentsPanel` ("Documentos aprovados"),
  rotulos novos no historico; `lib/lead-analysis.ts` + testes
  (`lead-analysis.spec.ts`, `kanban-api.lead-analysis.spec.ts`).

UIUX Decision (Sprint 6):

```text
UIUX Decision:
  objective: analise manual do lead pelo gestor (classificar, gerar, revisar, aprovar/substituir, PDF) e entrega do documento aprovado ao escritorio no card
  target_project: implementations/app-jboot-next-platform
  target_module: modules/kanban
  scenario_classification: covered_by_template (paineis do CardModal como CardLeadPanel/CardDocumentsPanel; badge-soft; Alert; Modal de motivo auditado como LeadReturnModal; download por URL assinada do CardDocumentsPanel) - nao e CRUD administrativo (platform-crud-ui so referencia)
  template_sources_checked: CardLeadPanel, LeadReturnModal, CardDocumentsPanel, DocumentTemplatesPanel (upload .docx), skills/platform-crud-ui.md
  flow:
    states:
      empty: "Escolha o tipo de caso do lead."; "Nenhum documento gerado para este caso."; tipo sem modelo vinculado; nenhum tipo ativo (aponta para Leads > Tipos de caso); escritorio sem documento aprovado = painel oculto
      loading: Spinner do painel e por acao (adicionar caso, gerar, aprovar, download, PDF, upload)
      error: Alert danger com mensagem pt-BR (describeAnalysisError); 422 de variavel obrigatoria lista os rotulos e orienta devolver o lead ou marcar o campo como opcional
      success: Alert success "Rascunho gerado...", "Documento aprovado. O escritorio foi notificado e o PDF esta sendo gerado.", "Versao editada aprovada..."; avisos da versao editada em Alert warning
      permission_denied: painel de analise nem renderiza sem flow:admin (backend devolve 403); escritorio so ve "Documentos aprovados"
    information_hierarchy: analise: estado -> casos (tipo, modelo, gerar) -> documento vigente (estado, origem, faltantes, PDF, acoes) -> versoes anteriores -> adicionar caso -> casos trocados/removidos; escritorio: titulo do modelo, versao, data, .docx/PDF
    primary_actions: Classificar/Adicionar caso; Gerar documento/Gerar nova versao; Aprovar; Substituir por versao editada; Baixar .docx/PDF; Gerar PDF novamente; Trocar tipo/Remover (motivo)
  reused_components: Alert/Button/Input/Modal/Spinner reactstrap; LeadStatusBadge; padrao de motivo auditado (10..500, contador, aviso de dado pessoal); validateTemplateFile/TEMPLATE_ACCEPT da S5; download por link temporario
  new_components:
    - component: CardAnalysisPanel
      justification: analise do gestor por caso com versoes de documento; nao ha painel equivalente
      classification: excecao_isolada
    - component: LeadCaseReasonModal
      justification: troca/remocao auditada, mesmo padrao do LeadReturnModal com seletor de tipo
      classification: excecao_isolada
    - component: LeadDocumentUploadModal
      justification: upload da versao editada que vira o aprovado (aviso explicito)
      classification: excecao_isolada
    - component: CardLeadDocumentsPanel
      justification: entrega ao escritorio (P11) separada da analise
      classification: excecao_isolada
  navigation_impact: nenhum item de menu novo; paineis no CardModal abaixo de "Envio para analise"
  local_agent: frontend-next-typescript + kanban-board-ui
  local_skill: api-client, kanban-board-ui (platform-crud-ui so referencia)
  usability_risks: versao editada aprovada direto (sem passo de aprovacao separado); painel de analise escolhido pelo scope do token (dica de UI; o backend decide); escritorio ve o titulo do MODELO (nao o tipo de caso) como nome do documento; PDF aparece como "em preparacao" ate o worker concluir (sem realtime: reabrir o card atualiza)
  decision_status: approved_existing_pattern (aplica padroes aprovados; sem padrao novo que exija confirmacao humana)
```

Security checklist (`docs/skills/security-checklist/SKILL.md`, Sprint 6):

- 1 Injection: SQL parametrizado em todos os repositorios novos (`unnest`/`ANY`
  nao usados; arrays por `$n::text[]` no filtro de eventos); nenhum alias ou
  fragmento vindo de usuario. Modelo nunca executado: mesmo parser restrito e
  `nullGetter` da S5, valores sempre escapados (teste com `<b>&`). Nenhum comando
  de sistema no `platform-api` (LibreOffice so no container `gotenberg`). OK.
- 2 Access control: tenant do JWT em toda consulta; 9 rotas de gestao com
  `@RequireScopes('flow:admin')` (teste de metadata) + `requireAdmin` no servico
  (403 testado para operador, `board_admin` e outro escritorio) + card visivel
  (matriz); 2 rotas do escritorio so com card visivel e so documento aprovado do
  ciclo atual (rascunho/substituido = 404). FK compostas amarram caso, ciclo,
  tipo, modelo e documento ao mesmo tenant. DTOs de saida declarados; chaves de
  objeto, valores de variaveis e snapshot nunca saem pela API. OK.
- 3 Dados sensiveis: evento, auditoria, notificacao, log e payload do job so com
  ids, versao, estado, `sha256`, codigos e o motivo digitado (teste: nome, CPF e
  nome de arquivo ausentes de auditoria e eventos). Valores das variaveis (dado
  pessoal) so em `filled_variables` no banco do tenant (R7); retencao segue P18.
  Chaves de objeto sem nome de arquivo (CHECK). Multipart para o conversor com
  nome generico. Basic auth: credencial so por env (`.env.example` com valor
  `dev-only-...`), igual nos dois lados por derivacao no compose; segredo real
  so no deploy. OK com pendencia P18 ja registrada.
- 4 Mass assignment: `ValidationPipe` com whitelist; `AddLeadCaseDto` (uuid),
  `ChangeLeadCaseDto`/`RemoveLeadCaseDto` (motivo aparado 10..500),
  `GenerateLeadDocumentDto` (uuid opcional), `DocumentDownloadQueryDto` (enum);
  upload por multer limitado a 10 MB e 1 arquivo. OK.
- 5 Paginacao/rate limit: listas com `LIMIT` (200 casos, 500 documentos, 100
  entregues, 100 por varredura); render e inspecao limitados a 2 por processo
  (runner); PDF concorrencia 1 e fila do Gotenberg limitada a 10; sem rate limit
  novo (B3). OK com pendencia B3 existente.
- 6 SSRF: unica chamada de saida = `JBOOT_PDF_CONVERTER_URL` fixa do deploy (sem
  entrada de usuario), `redirect: error`; Gotenberg com `downloadFrom` e webhook
  desligados, sem egress nem DNS externo; vinculos externos do `.docx` recusados
  no modelo e na versao editada. OK.
- 7 Dependencias: nenhuma dependencia npm nova (`fetch`/`FormData` nativos do Node
  24). Imagem de terceiro: Gotenberg 8.37.0 (Apache-2.0) fixada por tag+digest,
  sem root, sem capabilities, rootfs somente leitura; atualizacao mensal/CVE
  com o teste de integracao como regressao. Upload do gestor: limites anti
  zip-bomb, macro, OLE/ActiveX, vinculo externo testados. OK.
- 8 Frontend: sem token novo em storage; sem `dangerouslySetInnerHTML`; nomes,
  motivos e avisos como texto; download por URL assinada de 5 min com
  `noopener noreferrer`. OK.
- 9 Agentes: conteudo de repositorio tratado como dado; migration aditiva (sem
  DROP, sem volume removido; recriacao do container `jboot` para entrar na rede
  nova, sem `down -v`); sem commit/push; sem IA, sem `src/ai`, sem
  domain-integrations nem juridico; nenhum token assinado com segredo do
  Identity (validacao por testes de servico/controller e smoke direto no
  worker). Falso positivo do hook de governanca (`new Worker(` lido como "novo
  worker") contornado so com alias de import (`BullWorker`), sem desligar o
  hook. OK.

Graph Engineering: o registry do Architecture Graph (Sprint 4 de
`docs/product/api-graph-sprints.md`) segue inexistente; o grafo **nao** esta
sincronizado. Obrigacao de migracao (lifecycle `implemented`, owner `kanban`):
`data_store` `kanban_lead_cases`, `kanban_card_generated_documents`; `deploy_unit`
`gotenberg` (container de infra, owner `bff-jboot-platform`) com
`external_system`/imagem `gotenberg/gotenberg:8.37.0-libreoffice@sha256:c85f...`;
aresta `kanban` -> `gotenberg` `calls` (s2s interno, rede `jboot-pdf-internal`);
`data_store` fila `kanban-document-pdf` (`stores_in` -> `valkey`; `kanban`
produz e consome); aresta `kanban` -> `kanban-card-attachments` (`stores_in`,
prefixo `{client_id}/{card_id}/generated/...`, `decided_by` ADR 014); aresta
`kanban` -> `notifications` (kind `kanban.card.lead_document_approved`);
`feature` `flow-crm-leads-phase-1` com a S6 `implemented` (aceite pendente de
P2). O API Contract Graph inclui as 11 rotas novas, todas com consumidor em
`kanban-api.ts` (chamadas resolvidas 306 -> 317; rotas sem consumidor 17 -> 6,
nenhuma da S6); nenhum achado aceito; `make ai-api-graph-gate` verde.

Pendencias e desvios da Sprint 6:

| Item | Classificacao |
|---|---|
| Aceite com modelo real anonimizado (valores exatos, texto do PDF igual ao `.docx`) e verificacao das fontes dos modelos | bloqueado por P2 (insumo do cliente); procedimento e teste de texto (`src/test/pdf-text.ts`) prontos; a S6 fica `em andamento` |
| Cliente no documento vem do SNAPSHOT do envio (nao do cadastro atual); alteracao posterior por outro caminho aparece como "cadastro alterado depois do envio" e o gestor devolve para reenvio | decisao derivada (P21 + ADR 014 Decisao 6); corrigir se o usuario quiser o cadastro atual |
| Casos e documentos sao por ciclo de envio: lead devolvido e reenviado comeca a analise do zero (reclassificar e gerar); o ciclo anterior fica no historico do gestor | decisao derivada do modelo do gate (`submission_id`) |
| Lead `aprovado` = todos os casos ativos com documento aprovado; acrescentar/trocar/remover caso depois reabre para `aguardando_revisao` (transicao nova `analysis_reopened`) | decisao derivada de P3 + "estado do lead aprovado" |
| Versao editada enviada pelo gestor nasce aprovada (sem passo de aprovacao separado) | interpretacao de "aprovar ou substituir por versao editada" + "substituir gera PDF novo" |
| Um caso ativo por tipo de caso no ciclo (409 no duplicado); limite de 20 casos | decisao derivada; relaxavel no servico sem migration |
| Escritorio ve o nome do MODELO como titulo do documento (o tipo de caso nao aparece, P11) | decisao de UX |
| Notificacao a cada documento aprovado (nao uma por lead) | decisao derivada |
| Documento aprovado de ciclo devolvido some da entrega quando o lead e reenviado (a entrega e do ciclo atual) | decisao derivada |
| PDF de documento substituido enquanto `pending` nao e gerado (worker so converte `aprovado`) | por desenho |
| Gotenberg com `dns: 127.0.0.1` alem de `internal: true` | desvio de endurecimento sobre a ADR (Docker 24 resolvia DNS externo na rede interna) |
| `code-down` nao para o `gotenberg` (como `minio` nos demais targets) | comportamento existente dos scripts |
| Skill local `kanban-document-templates.md` (S5/S6) ainda nao criada | pendencia de governanca ja registrada na S5 |
| Smoke HTTP autenticado das rotas nao executado (proibido assinar token); validado por testes de servico/controller, matriz e smoke direto do worker com MinIO + Gotenberg reais | registrado |
| Nao ha realtime para o estado do PDF: o escritorio/gestor ve "em preparacao" ate reabrir o card | limitacao conhecida |

## Sprint 7: Leitura E Extracao Dos Documentos Por IA

Estado: **pendente**. Bloqueada por P4, P5, P33 e pela decisao do Architect
sobre provedores suportados e fronteira de IA (G3/G4, PE11, PE13;
`docs/agents/stacks/ai-llm.md`). P19 (custo) resolvida: chave do cliente.

Objetivo: a IA le cada documento obrigatorio do lead enviado, confere o tipo e
a legibilidade e extrai os campos definidos para cada tipo documental.

Valor: substitui a leitura manual da central e antecipa pendencias de
documento antes do gestor abrir o lead.

Entregaveis funcionais:

- Configuracao de IA do tenant (somente administrador), decidida em
  2026-10-11 como "chave do cliente":
  - provedor escolhido pelo cliente entre os suportados pela JBoot (lista
    definida pelo Architect depois do eval, entre os que atendem P5; P32);
  - API key do cliente: so escrita, nunca exibida depois de salva (mostra so
    os 4 ultimos caracteres), validada ao salvar com chamada de teste sem dado
    pessoal; chave invalida nao e salva;
  - ligar/desligar a IA do tenant; ao ligar, o administrador aceita o termo de
    responsabilidade (P34), com registro de quem e quando;
  - limite opcional do cliente (P31): numero maximo de analises por mes, com
    alerta in-app aos administradores em 80% e 100%; sem limite, nao ha teto;
    a JBoot nao impoe teto proprio;
  - consumo do mes visivel ao administrador: analises, tokens e custo
    estimado, com aviso de que a cobranca real e a do provedor;
  - troca e remocao da chave auditadas, sem a chave no registro.
- Comportamento por falha da chave (R11; o lead nunca se perde e o fluxo
  manual da S6 fica disponivel):
  - IA desligada ou sem chave: "Enviar para analise" funciona, nenhum
    provedor e chamado e o lead vai direto ao gestor;
  - chave invalida ou revogada: falha imediata, sem nova tentativa, codigo
    `credencial_invalida`; a chave fica marcada invalida e novas analises nao
    chamam o provedor ate o administrador trocar a chave;
  - sem saldo ou cota esgotada no provedor: falha imediata, codigo
    `saldo_insuficiente`, mesmo tratamento;
  - limite de requisicoes do provedor (temporario): nova tentativa com
    espera; so falha se passar do prazo do processamento;
  - limite do cliente atingido: nenhuma chamada, codigo `limite_atingido`;
  - em todos os casos de falha: lead em `falha_processamento` com mensagem
    clara ao gestor, notificacao aos administradores e reprocessamento em lote
    dos leads afetados depois da correcao.
- Catalogo de tipos documentais reconhecidos (ex.: documento pessoal,
  comprovante de residencia, HISCON, HISCRE, procuracao, declaracao de
  hipossuficiencia, print de confirmacao, outros), cada um com os campos a
  extrair (P4); cada item do checklist do quadro aponta para um tipo
  documental.
- Processamento disparado conforme R2 (P12); estado `em_processamento` e
  `falha_processamento` com reprocessamento manual pelo gestor.
- Painel "Leitura" no card: por documento, tipo confirmado ou divergente,
  legivel ou nao, campos extraidos com indicacao da pagina/trecho de origem,
  divergencias com o cadastro (R5).
- Pendencias detectadas viram alerta para escritorio e gestor; devolucao formal
  continua humana [P].
- Resultado marcado desatualizado quando documento ou cadastro muda (R2).

Criterios de aceite:

- Avaliacao sobre a amostra real anonimizada do cliente (origem anotada) com
  acuracia por campo e taxa de campo inventado medidas e dentro do minimo
  acordado (P17); campo nao presente no documento e devolvido vazio, nunca
  inferido.
- Falha ou indisponibilidade do provedor nao altera o lead alem do estado
  `falha_processamento`; reprocessar nao duplica resultado.
- Nenhum dado de outro tenant ou quadro entra no processamento; a chave de um
  tenant nunca e usada para outro e nao existe chave de reserva da JBoot.
- A chave nunca aparece em resposta HTTP, log, evento, auditoria, mensagem de
  erro ou notificacao (teste canario).
- Cada codigo de falha da chave testado com provedor simulado, incluindo
  bloqueio de chamada com IA desligada, sem chave, chave marcada invalida e
  limite atingido.
- Conteudo do documento e tratado como dado, nunca como instrucao (texto do
  documento nao altera o comportamento da IA).
- Registro de cada processamento sem dado pessoal em log/evento.
- Testes automatizados de disparo, falha, reprocessamento, desatualizacao e
  isolamento. Telas com type-check/build no container.

Fora de escopo: classificacao do caso (S8); correcao automatica do cadastro.

## Sprint 8: Classificacao Do Caso Por IA

Estado: **pendente**. Bloqueada por P1 e S7.

Objetivo: a IA sugere o tipo de caso do lead entre os tipos ativos, usando os
dados extraidos, o cadastro e os criterios cadastrados na S5.

Valor: substitui a decisao manual de classificacao nos casos claros e
concentra o gestor nos incertos.

Entregaveis funcionais:

- Sugestao com tipo (ou tipos, conforme P3), grau de confianca e evidencias
  citadas (documento e campo/trecho) (R4).
- Confianca baixa ou nenhum tipo: `aguardando_revisao` sem geracao, com
  destaque "classificacao incerta" na fila do gestor (P14).
- Gestor confirma ou troca a sugestao; troca exige motivo e fica auditada.
- Indicador na fila do gestor: sugerida, confirmada, trocada, incerta.

Criterios de aceite:

- IA nunca devolve tipo fora do cadastro ativo do tenant.
- Avaliacao sobre casos ja classificados pela central (gabarito real
  anonimizado) com acuracia por tipo medida e dentro do minimo acordado (P17).
- Tipo trocado pelo gestor fica registrado com motivo e alimenta a avaliacao
  seguinte.
- Testes automatizados de sugestao valida, incerta, troca auditada e
  isolamento. Telas com type-check/build no container.

Fora de escopo: aprendizado automatico a partir das trocas do gestor (so
registro).

## Sprint 9: Orquestracao Ponta A Ponta E Documento Com Dados Extraidos

Estado: **pendente**. Bloqueada por S6, S7, S8; P2 define se ha texto
redigido por IA.

Objetivo: do envio completo ao rascunho pronto para revisao sem acao manual
nos casos claros.

Valor: entrega a automacao pedida para a primeira fase.

Entregaveis funcionais:

- Encadeamento: envio completo -> leitura -> classificacao -> (confianca
  suficiente) geracao do rascunho com o modelo padrao do tipo ->
  `aguardando_revisao`; caso incerto ou dado faltante para no ponto correto
  (R4, R5).
- Variaveis do modelo preenchidas tambem com dados extraidos (S7), com origem
  de cada valor visivel na revisao (cadastro ou documento).
- Somente se P2 confirmar: secoes do modelo marcadas como texto variavel sao
  redigidas pela IA a partir dos dados extraidos, destacadas no rascunho para
  revisao.
- Painel de acompanhamento do gestor: leads por estado, tempo entre envio e
  aprovacao, casos incertos, falhas.
- Revisao, aprovacao e entrega da S6 inalteradas (R6).

Criterios de aceite:

- Lead completo com caso claro chega a `aguardando_revisao` com rascunho sem
  acao humana; lead incerto ou incompleto nao gera rascunho e mostra o motivo.
- Cada valor do rascunho indica a origem; valor extraido divergente do
  cadastro aparece destacado.
- Nenhum documento e aprovado ou entregue sem acao do gestor.
- Reprocessar o lead gera nova versao, sem apagar a anterior.
- Testes automatizados do encadeamento, paradas por incerteza/dado faltante e
  idempotencia. Telas com type-check/build no container.

Fora de escopo: assinatura digital, protocolo em tribunal, envio ao cliente
final, exportacao para Google Drive (P15).

## Perguntas Abertas Da Primeira Fase (2026-10-11)

Nenhuma resposta do cliente foi inferida. Atualizada em 2026-10-11 com as
decisoes do usuario; as classificacoes do PE no gate (`P2` dividida, `P3`)
foram incorporadas.

Ainda abertas:

| ID | Pergunta | Classificacao | Bloqueia | Premissa proposta |
|---|---|---|---|---|
| P1 | Quais tipos de caso a central usa hoje e quais criterios decidem cada um? | `bloqueante_agora` | S8 (e carga inicial da S5) | - |
| P2 | (a) Formato dos modelos e marcacao de campos; (b) o documento tem texto redigido por caso (fatos, fundamentos)? | (a) `premissa_temporaria_requer_aprovacao`; (b) `pode_decidir_depois` (antes da S9) | (a) S5, S6; (b) S9 | (a) `.docx` com variaveis `{{...}}`; modelo real do cliente necessario para concluir S6 |
| P3 | Um lead pode gerar mais de um caso e mais de um documento? | resolvida: aprovada pelo usuario em 2026-10-12 | S5, S6, S8 | o modelo de dados suporta N casos por lead |
| P4 | Campos que a central tira de cada documento e amostra real anonimizada com gabarito | `bloqueante_agora` | S7, S8 | - |
| P5 | Revista em 2026-10-11: com a chave do cliente, o contrato com o provedor (retencao, uso para treino, regiao) e do cliente, na conta dele. Base legal e consentimento dos titulares continuam sendo responsabilidade do cliente e precisam ser confirmados por escrito antes de qualquer envio; o cliente tambem confirma que os termos da conta dele atendem as proprias exigencias. A JBoot segue como operadora que transmite o dado ao provedor indicado | `bloqueante_agora` | S7 | - |
| P7 | Quais IAs o cliente usa hoje, como, e em qual provedor ja tem conta? | `pode_decidir_depois` (antes do Architect da S7) | insumo de P32 e do eval | - |
| P8 | Volume mensal de leads e documentos, numero de escritorios e usuarios | `pode_decidir_depois` (antes do Architect da S7) | dimensionamento | - |
| P15 | Google Drive deixa de ser usado? | `pode_decidir_depois` | - | Flow como armazenamento |
| P17 | Acuracia minima de extracao e classificacao | `pode_decidir_depois` (antes de fechar S7/S8) | aceite S7/S8 | - |
| P18 | Retencao e expurgo de documentos, resultados da IA e rascunhos | `pode_decidir_depois` (antes de producao) | operacao/LGPD | - |
| P20 | Assinatura e protocolo fora da primeira fase? | `pode_decidir_depois` | - | fora |
| P25 | "Administrador" e so quem tem `flow:admin`; `board_admin` sem `flow:admin` ve so o proprio escritorio; `flow:admin` so para a central | resolvida: aprovada pelo usuario em 2026-10-12 | S3.5 | sim |
| P26 | Como ligar a regra em tenant com cards existentes? | resolvida: aprovada pelo usuario em 2026-10-12 | S3.5 | chave por tenant ligada pelo administrador apos atribuir em lote; tenant sem a chave inalterado; card sem escritorio so o administrador ve |
| P27 | Usuario sem escritorio (nao administrador) | resolvida: aprovada pelo usuario em 2026-10-12 | S3.5 | nao ve, nao cria, nao importa card; mensagem para procurar o administrador |
| P28 | Usuario que muda de escritorio | resolvida: aprovada pelo usuario em 2026-10-12 | S3.5 | visibilidade segue o escritorio atual na hora; cards criados ficam no escritorio original; sai dos responsaveis do escritorio antigo, com lista ao administrador |
| P29 | Quais dados do escritorio entram no documento (`escritorio.*`): nome, CNPJ, endereco, advogado/OAB? Ou o documento sai sempre em nome da central? | `pode_decidir_depois` (antes da S5) | catalogo de variaveis | so nome do escritorio |
| P31 | Unidade do limite opcional do cliente | resolvida: aprovada pelo usuario em 2026-10-12 | S7 | numero de analises por mes (deterministico), com custo estimado so informativo |
| P32 | Quais provedores a JBoot suporta na fase 1 | `pode_decidir_depois` (Architect apos eval, G4) | S7 | o cliente escolhe entre os suportados que atendem P5 |
| P33 | Em qual conta roda o eval com a amostra real (custo e P5): chave do cliente ou da JBoot? | resolvida: aprovada pelo usuario em 2026-10-12 | aceite S7/S8 | na conta (API key) do proprio cliente, com consentimento escrito |
| P34 | Termo de responsabilidade aceito pelo administrador ao ligar a IA (base legal, conta propria) | resolvida: aprovada pelo usuario em 2026-10-12 | S7 | sim, com registro de quem e quando |

Resolvidas em 2026-10-11:

| ID | Tema | Decisao |
|---|---|---|
| P6 | Revisao humana | obrigatoria; so documento `aprovado` e final |
| P9 | Formato de saida | `.docx` e PDF na primeira entrega (PDF do aprovado); supera a PE7 do gate |
| P10 | Escritorio e gestor | escritorio e entidade do tenant com usuarios vinculados pelo administrador; administrador = gestor principal ve todos (Sprint 3.5) |
| P11 | O que o escritorio ve | estado, pendencias e documento aprovado |
| P12 | Disparo da IA | automatico no "Enviar para analise", com reprocessamento |
| P13 | Aceite item a item antes da IA | nao e pre-requisito |
| P14 | Classificacao incerta | para e espera o gestor |
| P16 | Campos obrigatorios do envio | configuraveis por tenant, default nome, CPF, data de nascimento e endereco |
| P19 | Custo da IA | cada cliente usa a propria API key e paga direto ao provedor; sem teto da JBoot; limite opcional do cliente (P31). Rate limit e circuit breaker por `client_id` (PE12) continuam como controle tecnico |
| P21 | Envio congela a edicao | sim, ate devolucao |
| P22 | Usuario em mais de um escritorio | sim: um ou mais escritorios; ve os cards de todos os seus; escolhe o escritorio ao criar o card (automatico com um so). Diverge da premissa original do PO; ajuste do Architect a partir da decisao do usuario |
| P23 | Escritorio do card pode mudar | sim, so pelo administrador, com motivo e registro no historico; tudo do card acompanha |
| P24 | Administrador ve todos os quadros sem ser membro | sim (`flow:admin`); opera como `board_admin` efetivo |
| P30 | Mesmo cliente em escritorios diferentes | apos o vinculo pelo administrador (com motivo e auditoria), os dois escritorios veem o cadastro do cliente, cada um so com os proprios cards e documentos |

P13, P14 e P16 foram tratadas como incluidas em "demais premissas do bloco de
fluxo" aprovadas pelo usuario; corrigir aqui se nao for o caso.

Impacto nas perguntas do PE (gate): PE7 superada (PDF na primeira entrega,
G2); PE2 revista por P24/P25 (fila e notificacao de envio vao ao
administrador); PE12 mantida sem teto da JBoot. Para o Architect: o namespace
`escritorio.*` da ADR 014 passa a vir do cadastro de escritorio, nao do quadro.

## PE Decision (2026-10-11)

Detalhe completo (Agent Activation, modelo de dados proposto, contratos HTTP,
autorizacao, riscos e mudancas propostas nos contratos):
`docs/product/flow-crm-leads-sprint-4-9-gate.md`. Architect: decisao emitida
em 2026-10-11 (ADR 014 e "Architect Decision (2026-10-11)" do gate); nenhum
`MODULE_CONTRACT.md` alterado.

> Atualizado pelo Architect em 2026-10-11 apos as decisoes do usuario
> (escritorios N:N, PDF na primeira entrega, IA com a chave do cliente). As
> linhas marcadas "(Architect)" abaixo substituem o texto anterior do PE.

```text
PE Decision:
  execution_mode: cross_project (bff + app da Platform); architectural para S7-S9
  target_project: implementations/bff-jboot-platform | implementations/app-jboot-next-platform
  target_module: modules/kanban (ambos)
  lifecycle_status: modules/kanban = functional (production_readiness not_assessed), inalterado; S4-S9 = planned
  agents: backend-node-typescript, platform-auth-context, platform-postgres, kanban-board-domain (bff); frontend-next-typescript, platform-layout, backend-contract-client, kanban-board-ui (app)
  skills: nest-module-pattern, tenant-context, api-contract, kanban-board-crud, kanban-realtime (bff); next-module-pattern, platform-design-system, platform-crud-ui, api-client, kanban-board-ui (app); security-checklist; ui-ux antes de cada tela
  agents/skills a criar antes da S7: agent global de IA do bff (derivado de docs/agents/stacks/ai-llm.md) e skills do modulo kanban-lead-intake, kanban-document-templates, kanban-lead-analysis-ai
  sprint_artifact: docs/product/flow-crm-leads-sprints.md (listado em Contratos Obrigatorios do bff kanban; citado em Contratos do app kanban)
  sprint_gate: docs/product/flow-crm-leads-sprint-4-9-gate.md (ainda nao listado nos contratos; mudanca proposta)
  architect_required: sim
```

Deployment Boundary Gate:

| Componente | Classificacao |
|---|---|
| Estado do lead, envio, devolucao, fila do gestor (S4) | `embedded_module`, stack herdada |
| Tipos de caso e modelos (S5) | `embedded_module`, stack herdada |
| Geracao `.docx` (S6) | `embedded_module`, stack herdada |
| Escritorios e visibilidade por escritorio (S3.5) | `embedded_module`, stack herdada (Architect) |
| Conversao para PDF (S6, P9) | (Architect) `independent_unit` de infra aprovada: container Gotenberg (`gotenberg/gotenberg:8.37.0-libreoffice`), rede interna sem saida, target `code-up` `kanban-leads` |
| Leitura/OCR e extracao (S7) | pendente de P5/P4/P8: provedor externo multimodal = `embedded_module`; OCR/modelo local = `independent_unit` com Stack Fit Gate greenfield |
| Classificacao (S8) | `embedded_module` (provedor pendente) |
| Orquestracao (S9) | `embedded_module`: pipeline deterministico com fila BullMQ dedicada `kanban-lead-analysis` |

Stack Fit Gate: G1 biblioteca `.docx` (recomendado `docxtemplater`,
condicionado a P2; `docx-templates` rejeitado por executar codigo do modelo);
G2 PDF (Architect: Gotenberg LibreOffice-only aprovado, contrafactual igual);
G3 fronteira de leitura e G4 provedores suportados (pendentes de P4/P5/P7/P8,
sem escolha fechada; decisao por eval na conta do cliente, P33); G5 gatilho
pelo ato "Enviar para analise" + outbox transacional + fila dedicada,
rejeitando `action_type` de coluna, Temporal e LangGraph na fase 1. Custo
(P19) resolvido: chave do cliente, sem teto da JBoot.

Sprint gate:

- (Architect) S3.5: pronta apos confirmacao de P25-P28; decisoes tecnicas
  fechadas no gate.
- S4: (Architect) depende so da S3.5 concluida; P10, P11, P13, P16, P21 e
  PE1, PE2 (revista), PE10, PE14 fechadas.
- S5: pronta apos P2 (formato `.docx` com `{{...}}`) e P3; G1, PE8 e PE9
  decididos pelo Architect. P1 so alimenta a carga inicial; P29 nao bloqueia
  (catalogo comeca com `escritorio.nome` e cresce de forma aditiva).
- S6: (Architect) pode iniciar apos S4 e S5; inclui o PDF (Gotenberg, PE7
  superada) e o padrao outbox/relay; so conclui com modelo real do cliente e
  as fontes usadas nos modelos.
- S7: bloqueada por P4, P5, P33, PE11 (reabrir `src/ai`), PE13 (dataset fora
  do git), G3/G4 e S4. P19 resolvida (chave do cliente).
- S8: bloqueada por S7, P1, P3, P17 e gabarito real.
- S9: bloqueada por S6, S7, S8 e pela parte de P2 sobre texto redigido por IA.

Graph Engineering: o registry do Architecture Graph (Sprint 4 de
`docs/product/api-graph-sprints.md`) nao existe e o grafo **nao** esta
sincronizado. Nos e arestas `planned` (tabelas S4-S8, prefixos no bucket do
modulo, fila `kanban-lead-analysis`, `src/ai`, provedor de LLM, conversor PDF
condicional) estao listados no gate como obrigacao de migracao.

open_questions: P1-P21 revistas e PE1-PE14 acrescentadas no gate. Mudancas de
classificacao feitas pelo PE: P2 dividida (formato = premissa; texto por IA =
decidir depois), P3 = premissa para S5/S6 e bloqueante para S8, P19 =
bloqueante para S7.

blocking_status: (Architect) S3.5 depende de P25-P28; S4-S6 em sequencia, sem
decisao tecnica aberta (S5/S6 dependem de P2a/P3 e S6 conclui com modelo real);
S7-S9 bloqueadas por P4, P5, P33 e pelos gates G3/G4.

## Backlog Tecnico Pos-Entrega

Rotina automatica (2026-10-11) retoma este backlog a cada 30 minutos ate
concluir os itens implementaveis. Estado por item:

| Item | Estado |
|---|---|
| T1. Target `kanban-attachments` em `tools/code-up.sh` (sobe minio com o kanban) e contratos atualizados | concluido (2026-10-11): target dedicado em `code-up.sh`/`code-down.sh` (kanban + `minio`; `kanban` segue sem minio, conforme contrato); `make code-up TARGET=kanban-attachments` com Identity 200, Platform `/health` 200, `/flow` 200 e minio healthy |
| T2. Testes do app isolados das variaveis `NEXT_PUBLIC_*` (`identity-applications.spec.ts`, `pdv-api.spec.ts`), sem mudar comportamento | concluido (2026-10-11): `vi.stubEnv(..., undefined)` + `vi.resetModules()` + import dinamico; `npm test` 13 arquivos / 50 testes passam no container (com e sem as variaveis) e `type-check` ok |
| T3. Lint de `bff-jboot-platform/src/tracing.ts` (o spec juridico fica fora do escopo) | concluido (2026-10-11): `void sdk.shutdown()...` (no-floating-promises); eslint do projeto so reprova o spec juridico (fora do escopo) |
| T4. Investigar e corrigir o EADDRINUSE do `nest --watch` apos `npm run build` | concluido (2026-10-11): reproduzido (SIGTERM do OTel `sdk.shutdown()` mantem o node antigo na porta enquanto o Nest CLI sobe o novo); `start:dev` agora usa `--exec "bash scripts/dev-exec.sh"` que espera a porta liberar; com coletor pausado + build, sem EADDRINUSE e health 200 antes/depois |
| T5. Verificacao de assinatura (magic bytes) nos uploads de anexos e documentos, coerente com o content-type permitido | concluido (2026-10-11): `attachments/file-signature.ts` (regra por tipo da allowlist, fail closed) chamado por `assertAttachmentFileAllowed`; divergencia = 415 `content_signature_mismatch` sem nome do arquivo; binarios exigem assinatura (PNG, JPEG, GIF87a/89a, RIFF+WEBP, `%PDF-`, OLE p/ `.doc`, ZIP local p/ OOXML, ZIP local/vazio/dividido p/ zip); `text/plain`/`text/csv` sem NUL e sem inicio `<!DOCTYPE html`/`<html`/`<script`/`<svg` (ignora BOM/espacos); app mostra mensagem pt-BR (`describeKanbanError`, tambem no anexo do historico); `file-signature.spec.ts` + specs de anexo/documento com buffers de assinatura real; bff `npm test` 383/383, app `npm test` 51/51 |
| T6. `board_viewer` entra na sala WebSocket do quadro somente para receber eventos (sem `card.move`) | concluido (2026-10-11): `board.join` usa `requireMember` (mesma regra da leitura HTTP: membro ativo em qualquer papel); `card.move` segue por `CardsService.move` (`requireRole` admin/member); `broadcastCardMoved` inalterado (revalida membresia e ACL `can_view` do perfil por socket, igual a `ColumnsService.list`); `realtime/kanban.gateway.spec.ts` (banco real + ROLLBACK): viewer entra e recebe, ACL do perfil filtra viewer, viewer nao move (403, card nao muda), nao membro/inativo/outro tenant nao entram, viewer inativado apos o join para de receber; app ja conectava o socket para qualquer leitor (sem mudanca) |
| T7. `BoardView` sem acoes de mutacao para `board_viewer` (arrastar card/coluna, "Novo card"), coerente com o contrato "viewer apenas le"; backend ja recusa com 403 | concluido (2026-10-11): so frontend. `UIUX Decision` (ui-ux, padrao ja existente aplicado, sem `pending_human_confirmation`): `lib/board-permissions.ts` `canMutateBoard(role)` (admin/member = true; viewer/null = false) usado em `BoardView`/`CardModal` com `currentUserRole`; viewer: card sem arrastar, sem "Novo card", modal somente leitura (titulo/descricao/vencimento, sem Salvar/Arquivar, sem monitoramento DataJud, sem atribuir/remover responsavel, sem comentar/anexar); arrastar coluna so `board_admin` (backend ja exigia); paineis de cliente/documentos/tags/status seguem `canEdit`/`canUpload`/`canReview`/capacidades do backend; `board-permissions.spec.ts`; type-check, build, eslint e `npm test` ok no container |
| B1. Contracao das colunas fiscais do nucleo | bloqueado: pos-producao |
| B2. Validacao dos campos de `customer_juridico` com o cliente | bloqueado: acao do usuario |
| B3. Rate limit do lookup por CPF (exige decidir dependencia/estrategia de throttling na platform) | bloqueado: decisao humana |
| B4. Saneamento de CPF duplicado (com/sem mascara) e normalizacao no cadastro do PDV | bloqueado: decisao humana sobre dado existente |
| B5. Expurgo de objetos de card excluido (politica de retencao) | bloqueado: decisao humana |
| B6. Architecture Graph (Sprint 4 de `docs/product/api-graph-sprints.md`) | fora deste arco: branch propria |
| B7. Numeracao duplicada `058_*` em `docker/postgres/init` | bloqueado: renomear afeta outras branches; decidir com o dono de payments |
| B8. `GET/POST /domain-integrations/flow/cards/:cardId/monitoramento` e `PATCH .../cadencia` nao checam membresia nem papel no quadro do Flow (autorizacao so pelo servico de monitor juridico); `board_viewer` ou nao membro com scope juridico pode ligar/pausar/alterar o monitoramento do card | resolvido (2026-10-16, `fix/flow-domain-integrations`): leitura exige card visivel no Flow (membro + escritorio), alteracao exige `board_admin`/`board_member`; testes de regressao no `domain-integrations.service.spec.ts` |

## Pendencias

| Pendencia | Classificacao |
|---|---|
| Documentos ficam no card (lead); a visao do cliente agrega os documentos dos cards vinculados. Reaproveitamento de documento pessoal entre leads fica para depois | aprovada pelo usuario em 2026-10-09 |
| Ida para VPS (Hostinger KVM 8, Sao Paulo) na contratacao | pode_decidir_depois |
| Unicidade de CPF por indice: `pdv_establishment_customers_document_unique (client_id, document_number) WHERE document_number IS NOT NULL` ja existe desde `006_pdv.sql`, mas compara o texto bruto. Ha 1 par duplicado por CPF normalizado no dev (tenant `JBoot`: mesmo CPF salvo com e sem mascara), entao nenhum indice por CPF normalizado foi criado e nenhum dado foi alterado. A unicidade normalizada vale so pelo servico (`createIfCpfAbsent`) | pendencia; exige decisao sobre saneamento do dado |
| Cadastro de cliente pelo PDV (`POST /pdv/admin/customers`) ainda grava `document_number` como digitado e nao checa CPF normalizado; pode recriar com mascara um CPF ja cadastrado pelo Flow | pendencia fora do escopo do Flow |
| Cliente fora dos quadros do usuario (inclusive cadastrado so pelo PDV, ou orfao de card excluido) nao tem caminho de vinculo: a decisao manda o caso para a central ou `board_admin`, mas nao existe override; a central so vincula se for membro de quadro com card do cliente | resolvida em 2026-10-11: override por `flow:admin` (Sprint 3) |
| Vinculo entre bancos nao e atomico (cliente em `jboot_pdv`, vinculo em `kanban_card_customers`). Falha do vinculo depois de criar cliente novo e compensada: `CustomersService.discardJustCreated` apaga o cliente criado na mesma requisicao (so do `client_id` e sem `customer_pdv`; `customer_juridico` sai por CASCADE) e o erro original e propagado, entao a nova tentativa volta a `not_found`. Risco residual: a propria compensacao falhar; fica logada (`card_customer_compensation_failed`, so `clientId`/`customerId`) e o cliente orfao exige saneamento manual. Falha ao gravar `customer_juridico` depois do vinculo NAO desfaz o vinculo: o erro chega a UI e o dado e completado pelo PATCH | compensado; risco residual registrado |
| Lookup por CPF sem rate limit (a platform nao tem throttler); exposicao limitada a membro com edicao do card e a status sem dados | risco registrado |
| Dado geral do cliente nao pode ser apagado pelo card (servico de clientes usa COALESCE); CPF nao e editavel pelo card (corrigir CPF = trocar cliente) | limitacao conhecida |
| Premissas do orquestrador da Sprint 2 (obrigatoriedade da lista inicial, historico por envio, bloqueio sem efeito retroativo) e decisoes derivadas (lista inicial pula nome inativo, reenvio apos aceite, revisao so do envio mais recente, bloqueio vale para `board_admin`, `board_viewer` nunca revisa) | aprovadas pelo usuario em 2026-10-11 |
| Bloqueio de coluna tambem vale para a importacao de dominio na coluna padrao: se o `board_admin` marcar a coluna padrao (BACKLOG) com `requires_complete_checklist` e houver obrigatorio ativo, a importacao juridico/DataJud passa a falhar com 422 | resolvida em 2026-10-11: importacao entra e sinaliza pendente (Sprint 3) |
| Target `code-up:kanban-attachments` citado nos contratos nao existia em `tools/code-up.sh` | resolvida em 2026-10-11 (T1) |
| Exclusao logica do card nao remove objetos do bucket (por desenho: o Flow e registro permanente); nao ha rotina de expurgo de objetos de card excluido | pendencia de produto/operacao |
| Content-type do arquivo e o informado pelo cliente (sem verificacao de magic bytes), igual aos anexos da Sprint 4 | resolvida em 2026-10-11 (T5): assinatura conferida contra o tipo declarado; risco residual: verificacao so de cabecalho (ZIP declarado como docx passa; conteudo interno nao e inspecionado nem ha antivirus) |
| Visao agregada de documentos por cliente e reaproveitamento de documento entre leads | fora desta sprint (premissa aprovada em 2026-10-09) |
| `GET /kanban/boards` e `GET /kanban/boards/:id` mostram nome/descricao de quadros a qualquer usuario do tenant com sessao Flow, mesmo nao membro (conteudo ja exige membresia desde a revisao 3) | decidido em 2026-10-11: mantem visivel |
| `board_viewer` nao entra na sala WebSocket do quadro (`board.join` exige admin/member); le pelo HTTP sem realtime | resolvida em 2026-10-11 (T6): viewer ativo entra so para receber eventos |
| `BoardView` nao esconde acoes de mutacao (arrastar card/coluna, "Novo card") para `board_viewer`; o backend recusa com 403 e a UI mostra o erro | limitacao de UI anterior ao T6; ajuste visual exige passo `ui-ux` | resolvida em 2026-10-11 (T7): viewer sem acoes de mutacao no `BoardView`/`CardModal`; backend segue sendo a barreira |

## Gates Obrigatorios Por Sprint

- `docs/agents/orchestration/ui-ux.md` antes das telas.
- `docs/skills/security-checklist/SKILL.md` (dado pessoal, upload de arquivo).
- Testes, type-check e build dentro do container do projeto.
- Sprints 7 a 9: decisao do PE/Architect sobre provedor e fronteira de IA
  (`docs/agents/stacks/ai-llm.md`), confirmacao humana, avaliacao versionada
  com amostra real anonimizada e revisao de dado pessoal enviado ao provedor.
- Sprints 4 a 9: `docs/product/flow-crm-leads-sprint-4-9-gate.md` (PE Decision
  de 2026-10-11) e `make ai-api-graph-gate`.
