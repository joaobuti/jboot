# Flow — Kit Assinado, Validador De Assinatura E Requisitos De Entrada Da Coluna

```yaml
status: em andamento (S5; S1-S4 concluidas, conferencia na tela, teste com a rotina real e envio real por SMTP pendentes)
data: 2026-11-02
target_project: implementations/bff-jboot-platform + implementations/app-jboot-next-platform
target_module: modules/kanban
branch: feature/flow-signed-kit (a partir de feature/flow-customer-promobank)
relacionados: ADR 019 (decisoes 16 a 19), docs/product/flow-customer-promobank-sprints.md, docs/product/flow-ai-completion-sprints.md
```

## Pedido (2026-11-02)

Depois de gerado, o kit vai ao cliente, que assina e devolve. O kit assinado substitui o original no card e
passa por uma validacao nova, com um agente proprio (Validador de assinatura). So com o kit assinado aprovado
o card avanca para a etapa seguinte (a mesma em que o HISCON e obrigatorio).

## Decisoes Do Usuario (2026-11-02)

1. Assinatura manuscrita: o cliente imprime, assina e devolve; o escritorio envia o PDF ou as fotos. O
   Validador de assinatura (rotina Claude) confere. Plataforma de assinatura eletronica fica para depois.
2. Parecer da IA e confirmacao humana, como na validacao de cadastro (mesma permissao de confirmar).
3. Premissa do Kanban: acoes e automacoes configuraveis por coluna. O bloqueio do HISCON deduzido das regras
   de agente (P1 de flow-customer-promobank-sprints.md) nao e configuravel e sai. Requisitos de entrada
   viram regra da coluna; mover o card depois da assinatura tambem e regra configuravel.
4. Envio do kit: e-mail automatico ao cliente quando houver e-mail na ficha, configuravel por escritorio
   (liga/desliga, assunto e texto); o download manual no card continua.
5. Prompt do Validador de assinatura: escrito por nos, revisado pelo escritorio antes do uso real.
6. Ordem aprovada: S1 requisitos de entrada; S2 kit assinado e validador; S3 gatilho "kit assinado
   aprovado" -> mover; S4 e-mail do kit.

## PE Decision

- Deployment Boundary Gate: mesmo processo e deploy do BFF/web do Flow; a rotina nova usa o conector MCP e o
  gateway de IA que ja existem. Sem Stack Fit Gate.
- Requisitos de entrada (S1): regra da coluna com acao `require_to_enter` (gatilho `column_entered`, sem
  destinatario) e `actionConfig.requirements` (S1: `customer_hiscon`; S2: `signed_kit`). Nao dispara nada: os
  disparadores filtram pelo tipo de acao. O gate (`EntryRequirementsService`, junto do checklist em
  `CardsService.move`) le as regras ativas da coluna de destino. Migration cria `require_to_enter` com
  `customer_hiscon` nas colunas que o bloqueio deduzido barrava hoje, para nada mudar sem o usuario ver.
- Selo do card: "SEM HISCON" (e depois "ASSINATURA PENDENTE") so quando alguma coluna do quadro exige o
  requisito e o cliente validado nao o cumpre.
- Kit assinado (S2): versoes ligadas ao kit de origem (`kit_id`); novo kit de outra validacao invalida o
  assinado anterior. O original fica guardado; o card mostra o assinado. Drive: arquivo
  `KIT_<NOME>_<data>_ASSINADO.pdf` na pasta do cliente, ao lado do original.
- Validador de assinatura: rotina Claude com execucoes proprias (mesma expiracao 5/15 min), ferramentas de
  leitura do original (kit `.docx` convertido em PDF) e do assinado e de envio do parecer; confirmacao humana.
- S3: gatilho `signed_kit_approved` com `move_card`, no mesmo motor das regras `ai_completed`.
- S4: e-mail pela fila de e-mails do Flow, com o kit anexo, configuracao por escritorio.
- UI/UX: reuso do item do kit no bloco Documentos, dos selos `*-subtle`, do `ConfirmActionModal` e do editor
  de regras da coluna. Sem padrao novo.

## Sprints

### S1: Requisitos De Entrada Da Coluna

> Status: `concluida` (2026-11-02). Conferencia na tela pendente. A migration `114` criou "Exigir para entrar:
> HISCON do cliente" nas colunas Analise de Acoes e Iniciais Geradas do quadro Manaus (dev).

- BFF: acao `require_to_enter`, validacao, migration (CHECK e regras do HISCON), gate e selo pela regra.
- Web: "Exigir para entrar" no editor de regras da coluna; rotulo na lista; mensagem do bloqueio.

### S2: Kit Assinado E Validador De Assinatura

> Status: `concluida` (2026-11-02). Conferencia na tela e teste com a rotina real pendentes; prompt do validador
> em rascunho para revisao do escritorio (`docs/product/flow-signature-validator-routine-prompt.md`).

- Migration `115`: `kanban_customer_signed_kits` (versoes, uma atual por kit), `kanban_signed_kit_validation_settings`
  (conta principal e por escritorio), `kanban_signed_kit_validations` (parecer e confirmacao), fila do Drive
  `signed_kit`.
- Original para a IA: texto do `.docx` do kit em partes (`officeKitText`), sem conversao em PDF (o Gotenberg nao
  roda no perfil do Flow); o assinado vai em paginas, como os documentos da ficha.
- Card: `GET .../office-kit/signature`, `POST .../office-kit/:kitId/signed` (dispara a validacao),
  `POST .../signature-validation` (validar de novo), `POST .../signature-validation/:runId/confirm`
  (`flow:validation:approve`), download do assinado. Conector: `flow_get_signature_validation_request`,
  `flow_get_signed_kit_original`, `flow_get_signed_kit_page`, `flow_submit_signature_validation`.
- Requisito de entrada `signed_kit` e selo "ASSINATURA PENDENTE"; Drive `KIT_<NOME>_<data>_ASSINADO.<ext>`.
- So o kit mais recente do cliente pode ser assinado; versao nova do assinado expira a validacao em andamento e
  tira a aprovacao da anterior.

### S3: Gatilho "Kit Assinado Aprovado" -> Mover

> Status: `concluida` (2026-11-02). Conferencia na tela pendente.

- Migration `116`: gatilho `signed_kit_approved`, so com `move_card` (CHECK no banco e validacao no servico).
- Motor de movimento (`MovementAutomationRepository.recover`): evento `card.signed_kit_approved` do card que esta
  na coluna da regra; o processamento confere a coluna de novo e passa por `CardsService.move` (transicao,
  checklist, WIP e requisitos de entrada da coluna de destino).
- Web: gatilho "Quando o kit assinado for aprovado" no editor de regras, so com "Ir para a coluna".

### S4: E-mail Do Kit Ao Cliente

> Status: `concluida` (2026-11-02). Conferencia na tela e envio real por SMTP pendentes.

- Migration `117`: `kanban_office_kit_email_settings` (por escritorio: ligado, assunto, texto com [[NOME]] e
  [[ESCRITORIO]]) e `kanban_office_kit_emails` (um envio por kit, com destinatario, assunto e texto montados na
  geracao; reserva de 2 min; nova tentativa em 1, 2, 4 e 8 min; `failed` na quinta).
- Na geracao do kit (`OfficeKitGenerationService`), com o envio ligado no escritorio do modelo e e-mail valido na
  ficha, o kit entra na fila; falha na fila nao desfaz o kit. O agendador de automacoes (passada de 1 min) envia
  pelo SMTP do Flow com o `.docx` anexo e grava `card.office_kit_emailed` nos cards do cliente.
- Escritorios -> Contrato Servicos: card "Envio do kit ao cliente" (`GET|PUT kanban/offices/:officeId/kit-email`,
  `flow:admin`). Card: linha com a situacao do e-mail no item do kit; o download manual continua.

### S5: Validar Assinatura Como Acao Da Coluna

> Status: `em andamento` (2026-11-07). Branch `feature/flow-signature-validation-action` (worktree
> `.claude/worktrees/flow-signature-action`, a partir da `main`).

Pedido (2026-11-07, teste manual do cliente Salim): o disparo do Validador de assinatura ficou fixo no envio do kit,
com o agente numa tela separada (Configuracoes -> IA -> Validacao de cadastro). Isso fere a premissa do Flow: toda
chamada de IA parte de automacao ou acao configuravel, para a regra nao ficar presa no backend.

Decisoes do usuario (2026-11-07):

1. A validacao e disparada so pela acao "Validar assinatura" do catalogo de Acoes por coluna; nao dispara mais
   sozinha no envio do kit. O agente e escolhido na configuracao da acao na coluna.
2. Executa quem tem permissao no board e no card (mesmo modelo das outras acoes: `flow:actions:execute`, papel no
   board, coluna editavel e card visivel). A rotina roda na conta de quem configurou a acao, que escolhe entre os
   proprios agentes de rotina (rotina e conector pertencem ao dono do agente).
3. A configuracao antiga (`kanban_signed_kit_validation_settings`, uma linha de dev) e apagada sem migrar dados.
4. Categoria nova "Documentos" no catalogo.
5. Fora do escopo: o "Validar" da validacao de cadastro (lista de clientes) tambem e IA disparada por botao fixo;
   fica como pendencia para decisao propria (nao ha card nem coluna ali).

Entrega:

- Migration `122`: `kanban_column_actions.config` (jsonb, objeto) e remocao de `kanban_signed_kit_validation_settings`.
- Catalogo: acao `validar-assinatura` (categoria `documentos`, `interaction: 'execute'`, `perCardAvailability`,
  `config: 'routine_agent'`). Acao com `config` so e salva com `agentId`; o "Editar" da coluna mostra o seletor de
  agentes de rotina ativos da conta de quem configura.
- Disponibilidade no card: cliente vinculado, kit mais recente com assinado atual e sem parecer util (sem
  validacao, falhou, expirou ou pendencias). A execucao revalida tudo; validacao em andamento nao duplica.
- Execucao: `POST .../cards/:cardId/actions/validar-assinatura/execute` cria a validacao e dispara a rotina com o
  agente da acao, executor = `configured_by_identity_id`. Parecer, confirmacao (`flow:validation:approve`), requisito
  `signed_kit` e gatilho `signed_kit_approved` seguem como na S2/S3.
- Sai: disparo no envio, `POST .../office-kit/:kitId/signature-validation` ("Validar de novo"), `GET|PUT
  kanban/signature-validation/settings`, card "Validador de assinatura" e selo "nao configurado".

Criterios de aceite / sprint_gate:

- [x] Acao "Validar assinatura" so e salva com agente de rotina; a lista da coluna mostra acao e agente.
- [ ] Botao so nos cards da coluna com assinado atual sem parecer util.
- [ ] Clique cria a validacao, dispara a rotina na conta de quem configurou e o card mostra o status.
- [x] Envio do kit assinado nao dispara validacao.
- [ ] Parecer aprovado -> confirmacao -> automacao move o card (ponta a ponta).
- [x] Rotas e tela antigas removidas; testes, type-check e build do BFF e do web no container.
- [x] `make ai-api-graph-gate` e `make ai-architecture-graph-gate` aprovados.
- [ ] Teste manual com o cliente Salim (quadro Manaus).

Evidencias (2026-11-07, no container): BFF 937 testes (935 ok, 2 skips Gotenberg), `tsc`, `nest build` e ESLint do
escopo; web 196 testes, `tsc`, ESLint do escopo e `next build`; API Graph 0 erro, Architecture Graph 0 finding.
Botao no card, disparo real da rotina e o fluxo ate mover o card dependem do teste manual (migration `122` aplicada
no dev junto com a troca do runtime para esta branch).
