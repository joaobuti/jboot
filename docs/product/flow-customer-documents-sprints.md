# Flow — Documentos Da Ficha Do Cliente, Validacao Por Agente E Drive

## Ajuste Do Catalogo — 2026-10-21

Pedido humano: renomear o ultimo documento para HISCON e adicionar HISCRED.
Implementacao no fluxo existente: `extrato_beneficio` continua identificando os
arquivos HISCON ja enviados; `hiscred` e um upload separado. Ambos sao exigidos
para validar, mantendo uploads opcionais para salvar. O prompt sugerido contempla
os dois; rotinas privadas ja configuradas nao sao reescritas automaticamente.
Migration aditiva `095_kanban_customer_hiscred.sql`, mesmo runtime `kanban`.
Aceite: rotulos no cadastro/edicao, versionamento independente, preservacao de
arquivos e bloqueio de validacao sem HISCRED cobertos por testes automatizados.
Fora do escopo: novas regras de analise juridica e alteracao de pareceres antigos.
Estado: concluido (revisado em 2026-10-22; validacao real pela rotina do
escritorio Manaus leu HISCON e HISCRED).

## Estado

```yaml
status: implemented_pending_external_smoke
review_date: 2026-10-16
branch: feature/flow-customer-documents
human_confirmation: confirmed_by_human_2026-10-16   # "Aprovar e comecar"
lifecycle_status: functional   # nao production_ready: smokes externos pendentes
target_project:
  - implementations/bff-jboot-platform
  - implementations/app-jboot-next-platform
target_module: modules/kanban
blocking_status:
  - parallel_drive_worker_session_uncommitted_on_main   # reconciliar no merge (claim/complete/fail do worker)
  - external_smokes_pending   # rotina Claude real (URL publica) e Drive real (app OAuth Google)
  - routine_pdf_handling_undocumented               # spike S0: imagens ok por doc; PDF exige rasterizacao ou exclusao
```

## Pedido

Depois de finalizado o cadastro do cliente, o usuario clica em **Validar dados**
(listagem ou edicao do cliente). Um agente Claude valida os documentos anexados
na ficha cadastral e responde se estao ok ou com pendencias. Com a validacao
confirmada e o sincronismo da empresa ligado, os documentos vao para o Google
Drive da empresa, numa pasta nomeada pelo CPF/CNPJ do cliente.

Este e, por enquanto, o unico agente disparado por botao proprio no cadastro do
cliente; os demais seguem os gatilhos de automacao do Kanban.

## Decisoes Humanas (2026-10-16)

| Tema | Decisao |
|---|---|
| Dono do Drive | Um por empresa (tenant), conectado pela tela (ADR 016). |
| O que sincroniza | Documentos anexados na ficha cadastral do cliente, alem das peticoes aprovadas. |
| Gatilho da validacao | Botao **Validar dados** na listagem/edicao do cliente, fora dos gatilhos do Kanban. |
| Modo do agente | Rotina Claude (assinatura do usuario), via conector MCP do Flow. |
| Resultado do agente | Parecer apenas. Um humano confirma com 1 clique; so entao o cliente fica validado e os documentos vao ao Drive. |
| Destino central | Sempre o mesmo destino por contratante: Drive da empresa e conta Claude central da empresa, qualquer que seja o funcionario que clicou. 1 assinatura Claude + 1 conta GitHub (da conta central) por contratante. |
| Pasta no Drive | `<raiz da empresa>/<CPF ou CNPJ, so digitos>/`; CPF/CNPJ passa a ser obrigatorio no cadastro do Flow. |
| Peticoes | Novas peticoes aprovadas tambem vao para a pasta do CPF/CNPJ; itens ja sincronizados ficam onde estao. |

## Fatos Do Codigo Que Definem O Escopo

- A ficha do cliente (`establishment-customers` + fachada `/kanban/customers`)
  nao tem anexos. Os documentos atuais sao do card
  (`kanban_card_documents`, checklist por tipo do quadro).
- `documentNumber` e opcional e so aceita CPF na fachada do Flow. A tabela
  `pdv_establishment_customers` e compartilhada com o PDV, que aceita cliente sem
  documento: a obrigatoriedade fica na fachada do Flow, nao na tabela.
- Modo rotina so envia identificadores; o conector le quadros e cards, nao le
  cliente nem arquivo e nao grava resultado de validacao.
- A replica Drive esta presa a `kanban_card_generated_documents` e usa caminhos
  por UUID. O Drive conectado pela tela (ADR 016) esta no branch
  `codex/flow-drive-oauth-wip`, fora da `main`.

## Documentos Exigidos Na Ficha

Fonte: contratante (Edervandes Chagas, WhatsApp, 2026-10-16 15:36-15:37) e
decisao do usuario na mesma data.

| Item | Aceita | Obrigatoriedade |
|---|---|---|
| Identidade | RG **ou** CNH | sempre |
| CPF | documento do CPF | sempre (dispensa com CNH/RG novo: pergunta aberta 5) |
| Comprovante de residencia atual | em nome do cliente ou de terceiro | sempre |
| Declaracao de residencia de terceiros, assinada | declaracao | somente quando o comprovante esta em nome de terceiro |
| HISCON | documento HISCON (tipo anterior preservado) | sempre |
| HISCRED | documento HISCRED | sempre |

Regras:

- Catalogo fixo nesta fase (decisao do usuario, 2026-10-16), igual para todo
  contratante.
- Os campos de upload aparecem no cadastro e na edicao, mas **nao sao
  obrigatorios para salvar o cliente** (decisao do usuario, 2026-10-16).
- Sem todos os itens obrigatorios (incluindo a condicional), o botao
  **Validar dados** fica bloqueado; nenhum disparo ao agente acontece com ficha
  incompleta. Decisao do usuario (2026-10-16): o extrato e obrigatorio na
  ficha porque o agente depende dele, embora o contratante tenha citado o
  extrato na etapa de elaborar os documentos.
- Total por ficha: 4 itens (comprovante em nome do cliente) ou 5 (comprovante
  de terceiro + declaracao).
- O atendente marca "comprovante em nome de terceiro" ao anexar o
  comprovante; a marcacao torna a declaracao obrigatoria. O agente confere de
  forma independente (nome do comprovante x cliente; presenca de assinatura na
  declaracao, sem atestar autenticidade) e aponta pendencia.
- Formatos: PDF e imagem. PDF e convertido em imagens por pagina no BFF antes de
  ser entregue ao agente (spike S0: so imagem e documentada em tool MCP).
- Extrato e comprovante tem validade (pergunta aberta 6); ficha reaproveitada
  em caso novo com extrato vencido volta a `pendente_validacao`.

## PE Decision

```yaml
execution_mode: implementation
deployment_boundary_gate: embedded_module   # BFF Platform + Platform Web (modulo kanban); gateway sem mudanca prevista
stack_fit_gate: not_applicable              # herda stack do host; nenhuma unidade nova de deploy
sprint_artifact: docs/product/flow-customer-documents-sprints.md
sprint_gate: secao "Gate" de cada sprint abaixo
decision_record: docs/architecture/decisions/017-flow-customer-documents-validation-drive.md
graph: nodes planned capability:flow-customer-documents e capability:flow-customer-validation
open_questions: ver tabela; nenhuma bloqueia S0
```

## Arquitetura

```text
Ficha do cliente (Flow)
  anexos versionados (MinIO canonico, banco do tenant)
        |
  [Validar dados] --> run de validacao (banco do tenant, outbox)
        |                     |
        |              svc-jboot-ai-gateway (execucao claude_routine)
        |                     |
        |              rotina Claude do usuario --MCP--> conector Flow
        |                       flow_get_customer / flow_get_customer_document
        |                       flow_set_customer_validation(runId, parecer)
        v
  parecer na tela --> [Confirmar validacao] (humano)
        |
  replica Drive (outbox existente, nova origem customer_document)
        --> Drive da empresa/<CPF|CNPJ>/
```

Regras:

- O parecer da IA e dado nao confiavel: nao muda status do cliente nem dispara
  Drive. So a confirmacao humana muda o cliente para `validado`.
- Novo anexo ou nova versao apos a validacao volta o cliente para
  `pendente_validacao`; documentos ja replicados ficam, a nova versao replica
  apos nova confirmacao.
- Tools novas do conector exigem o scope do conector e a mesma visibilidade do
  usuario (escritorio/`flow:customers:read`); `flow_set_customer_validation`
  so aceita `runId` `dispatched` do mesmo dono e cliente.
- Execucao central: o run e executado pelo agente de validacao da empresa em
  nome da identidade central (dono do agente), nao de quem clicou. O gateway hoje
  exige requester = dono do agente; a S2 faz o BFF enviar a identidade central
  como requester e grava quem clicou no run e na auditoria.
- A identidade central precisa enxergar clientes de todos os escritorios
  (`flow:admin`); o conector le e grava o parecer com essas permissoes.
- Leitura de documento pelo conector nao aplica o mascaramento de CPF (a
  validacao depende dele); exige aceite especifico do gestor na politica do
  conector.

## Sprints

### S0 — Fundacao: Drive Por Empresa Na Main E Spike De Leitura

Estado: `em andamento` — ADR 016 integrada neste branch (2026-10-16:
cherry-pick de `fcb7e67f4`, conflitos so em docs/compose/gerados, BFF 583
testes e Web 118 testes no container, API/Architecture Graph sem erro); spike
de leitura concluido pela documentacao. Pendentes: app OAuth do JBoot no
Google Cloud (smoke) e reconciliar com a sessao paralela que altera o worker
Drive na `main` sem commit.

- Levar a ADR 016 (`codex/flow-drive-oauth-wip`, `fcb7e67f4`) para a `main`,
  rebaseada, depois que a sessao paralela no worker Drive for commitada.
- Spike: confirmar como a rotina Claude le RG/comprovante (imagem e PDF)
  devolvidos por tool MCP; registrar formatos suportados, limites de tamanho e
  o formato de conteudo da tool.

Gate: ADR 016 na `main` com testes/gates; resultado do spike registrado com
fonte; formatos aceitos na S1 definidos a partir dele.

#### Resultado Do Spike De Leitura (2026-10-16, documentacao oficial)

Fontes: `https://code.claude.com/docs/en/mcp` (secoes "Images in tool results"
e limites de saida), `https://code.claude.com/docs/en/routines` e
`https://platform.claude.com/docs/en/api/claude-code/routines-fire`,
consultadas em 2026-10-16.

| Item | Evidencia | Consequencia |
|---|---|---|
| Imagem em resultado de tool MCP | PNG, JPEG, GIF e WebP chegam inline ao Claude, podendo ser reduzidas; o original fica em arquivo da sessao | `flow_get_customer_document` devolve imagem como conteudo `image` |
| PDF em resultado de tool MCP | Nao documentado | PDF nao e enviado cru; S1 decide entre rasterizar paginas em imagem no BFF ou aceitar so imagem |
| Limite de saida | 25.000 tokens por resultado por padrao, aviso a partir de 10.000; imagem conta no limite | Uma pagina/documento por chamada; tool paginada por `page` |
| Repositorio na rotina | Rotina e "prompt, um ou mais repositorios e conectores"; sem conexao GitHub a rotina pula execucoes e desliga apos 72 h | Tratar repositorio GitHub conectado como requisito do usuario ate prova em contrario; entra no passo a passo da tela |
| Conectores na rotina | Somente conectores da conta claude.ai; servidores locais (`claude mcp add`) nao aparecem | Validacao real so com conector publico em HTTPS |
| Payload do disparo | Chega como `routine-fire-payload` nao confiavel; o prompt salvo precisa referenciar o bloco | Modelo de prompt da validacao referencia o bloco explicitamente |
| Header `anthropic-beta` no `/fire` | "accepts requests with and without it" | Adapter atual da `main` esta correto; nada a mudar |

Ainda depende de teste empirico (conector publico): leitura real de imagem de
documento pela rotina e comportamento com PDF rasterizado.

### S1 — Anexos Na Ficha Do Cliente E CPF Obrigatorio

Estado: `concluida` (2026-10-16, sem commit). Evidencias: BFF 593 testes (10
novos, incluindo repositorio com PostgreSQL real) e build; Web 122 testes,
type-check e lint sem erro, `next build`; API Graph (5 rotas novas ligadas ao
cliente tipado) e Architecture Graph sem erro; E2E no navegador (CPF exigido,
fila do cadastro novo, envio/versao/terceiro/remocao na edicao, DOCX 415,
download assinado, chave sem nome de arquivo, auditoria sem dado pessoal);
`docs/security/flow-customer-documents-checklist.md`. CNPJ fica pendente: os
documentos exigidos sao de pessoa fisica (pergunta aberta 8).

- Campos fixos de upload da ficha (identidade, CPF, comprovante, declaracao
  condicional, extrato), opcionais para salvar; upload com versao,
  download e remocao logica; armazenamento canonico no MinIO e metadados no
  banco do tenant; formatos/tamanho conforme spike.
- CPF ou CNPJ obrigatorio na fachada do Flow (criacao e edicao), com
  validacao de digitos; clientes antigos sem documento ficam impedidos de
  validar ate completar.
- Telas: aba "Documentos" no cadastro/edicao do cliente (via `ui-ux`,
  `platform-crud-ui`).
- Status do cliente: `cadastro_incompleto`, `pendente_validacao`,
  `em_validacao`, `validado`, `com_pendencias`.

Gate: testes e PostgreSQL real no container, type-check/build web, API Graph,
Architecture Graph, security review (upload: tipo/tamanho, isolamento por
tenant/escritorio).

### S2 — Validar Dados Com Agente Claude

Estado: `concluida` localmente (2026-10-16, sem commit); smoke com rotina real
pendente (exige Flow em URL publica HTTPS e a conta central com assinatura
Claude e GitHub). Evidencias: BFF 609 testes (16 novos, repositorio com
PostgreSQL real, conversor com PDF real) e build; Web 127 testes, type-check e
lint; E2E: aceite proprio de documentos (400 sem aceite), agente de rotina e
configuracao central, 409 com ficha incompleta, disparo recusado pelo gateway
de dev vira run `failed` com codigo, tools via OAuth real do conector (pedido,
pagina de PDF e de imagem como JPEG, pagina fora do documento, run alheio,
parecer e reenvio recusado), confirmacao pela tela tornando o cliente
`validado`, auditoria sem CPF.

Decisao tecnica (dentro do BFF, sem nova unidade de deploy): PDF renderizado
por pagina com `pdfjs-dist` 6.4.299 (Apache-2.0) e imagens reduzidas com
`@napi-rs/canvas` 1.0.11 (MIT, binario pronto para glibc); prova em
2026-10-16 com PDF real gerado pelo Chromium, texto legivel na imagem. `npm
audit` sem achado novo dessas dependencias.

- Configuracao da empresa: agente de validacao (agente `claude_routine` do
  catalogo).
- Botao **Validar dados** na listagem e na edicao; cria run com outbox e
  idempotencia; dispara o gateway (`sourceType = flow_customer_validation`).
- Conector: `flow_get_customer`, `flow_get_customer_document`,
  `flow_set_customer_validation` (parecer: ok/pendencias por documento, texto).
- Tela: parecer, historico de validacoes e **Confirmar validacao**.
- Aceite especifico na politica do conector para leitura de documentos.

Gate: testes de autorizacao (outro tenant/escritorio/dono, runId alheio),
injecao de prompt tratada como dado, E2E local da tool; smoke com rotina real
depende de URL publica (mesmo bloqueio do conector).

### Alertas Visuais E Validar Na Listagem

Estado: `concluida` (2026-10-16; adiado e depois liberado pelo usuario: botao
na edicao do cliente e na coluna Acoes da listagem). Listagem ganha a coluna
"Documentacao" (pendentes com contagem, em validacao, parecer com pendencias,
aguardando confirmacao, validado, nao validado), calculada em lote com a mesma
regra da etapa Validacao, e o botao "Validar" (so com ficha completa e agente
configurado). Evidencias: BFF 615 testes, Web 128 testes, navegador (alerta,
botao desabilitado em ficha incompleta, resultado do disparo exibido).

- Alerta na listagem/ficha para cliente com documento pendente.
- Alerta para cliente com documentos validados pelo agente e ainda nao
  aprovados (parecer com pendencias ou aguardando confirmacao humana).

### S3 — Replica No Drive Por CPF/CNPJ

Estado: `concluida` localmente (2026-10-16); smoke com conta Google pendente
(depende do app OAuth do JBoot no Google Cloud). Evidencias: migration 087
(`source_type`/`customer_id` na outbox), confirmacao enfileira na mesma
instrucao SQL, reconciliacao cobre Drive ligado depois, worker resolve origem e
pasta por CPF (`driveLocation`); BFF 614 testes (5 novos, 2 com PostgreSQL
real), build e lint; runbook `flow-drive-sync.md` atualizado. Sem tela nova:
a varredura de 2 min envia, e alertas visuais seguem adiados.

- Outbox Drive com origem `customer_document` alem de `generated_document`.
- Confirmacao humana enfileira os documentos atuais da ficha.
- Caminho `<raiz>/<CPF|CNPJ digitos>/`; novas peticoes aprovadas vao para a
  mesma pasta; itens ja sincronizados nao sao movidos.
- Nova versao confirmada replica como novo arquivo versionado.

Gate: testes do worker com origem nova, reconciliacao, runbook atualizado,
smoke com conta Google de teste (depende do app OAuth do JBoot).

### S4 — Validacao Pela Conta Claude Do Escritorio (ADR 018)

> Status: `concluida` (2026-10-21, branch `feature/flow-office-validation`).

Decisoes humanas de 2026-10-21: o `flow:admin` configura as contas e indica o
escritorio; o responsavel do escritorio e quem fica vinculado a conta Claude
dele (marcacao por vinculo, pode haver mais de um); escolha do escritorio ao
validar; escritorio sem rotina usa a conta principal; confirmar o parecer exige
a permissao nova "Aprovar parecer da validacao".

Entregaveis:

- migrations `093_kanban_office_validation.sql` (responsavel, rotina por
  escritorio, escritorio do run) e `094_identity_flow_validation_approve.sql`
  (permissao `flow:validation:approve`, concedida a quem tem `flow:admin`);
- Escritorios -> Usuarios: marcacao "Responsavel" por escritorio;
- IA -> Validacao de cadastro: "Contas Claude dos escritorios" (agente por
  escritorio, responsaveis e alerta sem responsavel) e a conta principal como
  reserva; `PUT /kanban/settings/customer-validation/offices/{officeId}`;
- Validar dados: `POST .../validation` aceita `officeId`; varios escritorios sem
  escolha respondem 409 `customer_validation_office_required` (a lista abre a
  etapa Validacao para escolher);
- parecer aceito so de responsavel do escritorio do run; confirmacao exige
  `flow:validation:approve`.

### S5 — Rotina Da Conta Principal Le O Cliente Do Card (ADR 018)

> Status: `concluida` (2026-10-21, mesmo branch).

A coluna "Analise de Acoes" (quadro Manaus) usa a automacao "Executar agente"
com a rotina da conta principal. Para analisar as acoes, a rotina precisa da
ficha e do extrato. Tools novas do conector, so dentro da execucao
`dispatched` do dono da regra e com o aceite de documentos:

- `flow_get_card_customer` (run_id): ficha do cliente vinculado ao card,
  parecer da ultima validacao aprovada e lista dos documentos validados;
- `flow_get_card_customer_document` (run_id, tipo, pagina): pagina do
  documento validado como imagem (ex.: extrato do INSS/Promobank).

Cliente sem validacao aprovada por uma pessoa nao e lido
(`customer_not_validated`). Auditoria so com ids.

Fora de escopo (sprint futura): valores das tags do contrato do escritorio;
contrato gerado. A extracao dos dados pessoais para a ficha entrou na S6.

Evidencias S4/S5 (2026-10-21, no container): migrations 093/094 aplicadas no
banco de dev (5 entitlements `flow:admin` receberam a permissao); BFF
type-check, lint, build e 624 testes (622 passam, 2 ignorados ja existentes),
com repositorio real para responsavel e parecer por escritorio; Web type-check,
lint e 130 testes. API real: token novo traz `flow:validation:approve`;
responsavel fora do vinculo recusado (422); Manaus com rotina propria e cliente
de Manaus roteado para a conta do escritorio (`route: office`), cliente da
Matriz para a conta principal. Navegador: tela de Validacao de cadastro com as
contas dos escritorios e responsaveis; marcacao de responsavel no modal de
usuarios. Corrigido junto: badges `badge-soft-*` (inexistentes no Velzon desta
app) nas duas telas tocadas; o restante do modulo ficou como tarefa separada.

### S6 — Documentos Do Fluxo Do Cliente: Paginas, Senha, Situacao E Dados Extraidos

> Status: `concluida` (2026-10-21, mesmo branch; smoke real com a rotina pendente).

Decisoes humanas (2026-10-21):

- HISCON = Historico de Consignado; HISCRED = Historico de Credito (rotulos
  completos na ficha e no prompt). Os dois passam de 10 paginas e todas sobem
  para a IA.
- O documento CPF e dispensavel quando o RG novo ou a CNH ja trazem o numero.
- Os dados lidos pela IA atualizam a ficha **automaticamente no retorno**,
  em **todos os campos da ficha que existirem nos documentos**, e **a ficha
  sempre prevalece**: so campo vazio recebe valor.
- PDF com senha nao e aceito; o usuario e avisado no envio.
- Depois do parecer, a lista de documentos mostra "Recusado" (ou "Aprovado pela
  IA") no lugar de "Enviado vN".

Entregaveis:

- conversor: teto de 100 paginas (antes 10), `totalPages`/`truncated` no texto
  da tool quando o arquivo passa do teto; tools aceitam `page` ate 100;
- upload: PDF aberto com pdfjs antes de gravar; com senha responde 422
  `customer_document_password_protected`, corrompido 422
  `customer_document_unreadable` (nada vai ao storage); mensagem pt-BR na Web
  com o nome do documento;
- lista da ficha: `review` por documento a partir do ultimo parecer que leu
  exatamente aquele arquivo (`aprovado`/`recusado`, situacao e nota); arquivo
  substituido depois volta a "Enviado";
- perfil da ficha `cpfOnIdentity` (migration 096), gravado no run; dispensa o
  CPF e a rotina confere o numero no RG/CNH; mudar o perfil invalida o parecer
  anterior (mesma regra do comprovante de terceiro);
- `flow_submit_customer_validation.extractedData` (campos de `customer_juridico`:
  nascimento, nacionalidade, estado civil, profissao, RG/orgao/UF, mae,
  beneficio, especie, banco). O BFF normaliza (data real, UF valida, tamanho da
  coluna; resto descartado), grava no run e preenche so campo vazio num unico
  upsert com `COALESCE`; o run guarda `applied_fields`. Etapa Validacao mostra
  "Dados preenchidos pela IA" e a ficha aberta recebe esses campos sem perder o
  que foi digitado. Endereco nao e campo da ficha do Flow e fica fora;
- `flow_get_customer_validation_request` devolve a ficha inteira (campo `null` =
  vazio) e `cpfOnIdentity`; instrucoes e prompt padrao pedem todas as paginas,
  nova tentativa em pagina que falhar e o `extractedData`;
- conector nao grava mais `kanban_flow_customers_global_read` a cada tool de
  admin (a tool ja e auditada com o run).

Seguranca: dado extraido e dado nao confiavel (allowlist de campos, formato e
tamanho; chave desconhecida ignorada); a ficha prevalece no SQL, nao so na
aplicacao; auditoria `kanban_customer_validation_data_applied` so com nomes de
campos; falha ao preencher nao desfaz o parecer e gera
`kanban_customer_validation_data_apply_failed`. PDF com senha e recusado antes
do storage. Checklist: `docs/security/flow-hiscred-checklist.md` (secao S6).

Evidencias (2026-10-21, no container): migration 096 aplicada no banco de dev;
BFF type-check, lint e 637 testes (635 passam, 2 ignorados ja existentes),
incluindo `fillEmpty` em PostgreSQL real (ficha prevalece, branco conta como
vazio, outro tenant 404), perfil com upsert parcial e PDF com senha real
(fixture gerado com Ghostscript); Web type-check, lint e 134 testes.

## UIUX Decision (S1)

```yaml
objective: anexar os documentos da ficha no cadastro/edicao do cliente
target_project: implementations/app-jboot-next-platform
target_module: modules/kanban
scenario_classification: covered_by_template   # nova etapa no modal com steps existente (platform-crud-ui)
template_sources_checked:
  - implementations/app-jboot-next-platform/src/modules/kanban/components/customers/FlowCustomersPage.tsx
  - implementations/app-jboot-next-platform/skills/platform-crud-ui.md
flow:
  steps: [Dados gerais, Dados juridicos, Escritorios, Documentos]   # icones, sem numeros
  documents_step:
    rows: um por tipo fixo; status Enviado (versao, nome) ou Pendente; acoes Enviar/Substituir, Baixar, Remover
    condition: checkbox "Comprovante em nome de terceiro" mostra a linha da declaracao como exigida
    progress: "x de N documentos" (N = 4 ou 5); nao bloqueia salvar
    create_mode: arquivos ficam na fila e sobem apos salvar o cliente; falha de envio reabre o cliente em edicao na etapa Documentos
    edit_mode: cada envio/remocao grava na hora, independente do botao Salvar
  states:
    loading: spinner na etapa
    error: alerta com codigo traduzido (formato, tamanho, assinatura)
    empty: todos Pendente
    permission_denied: sem flow:customers:write os botoes ficam ocultos (403 do BFF)
cpf: obrigatorio na criacao; na edicao so editavel quando o cliente ainda nao tem CPF
reused_components: [Modal com steps, Section/Field locais, reactstrap Table/Badge/Input file]
new_components:
  - component: CustomerDocumentsStep
    justification: etapa do proprio modal; sem padrao novo
    classification: excecao_isolada
deferred: alertas visuais na listagem (decisao do usuario, 2026-10-16)
local_agent: implementations/app-jboot-next-platform/agents/frontend-next-typescript.md
local_skill: implementations/app-jboot-next-platform/skills/platform-crud-ui.md
decision_status: applied_pending_human_review
```

## UIUX Decision (S2)

```yaml
objective: validar a ficha por agente Claude e confirmar por humano
scenario_classification: covered_by_template   # nova etapa no modal + pagina de configuracao no padrao do conector
flow:
  validation_step: status, Validar dados (bloqueado sem documentos ou agente), parecer por documento, link da sessao, Confirmar validacao
  settings_page: flow:admin escolhe agente de rotina da conta central e copia o prompt da rotina
  connector_page: switch "Permitir que o Claude leia os documentos da ficha" com aceite proprio
  states:
    loading: spinner; em_validacao atualiza a cada 15 s
    error: alerta com codigo traduzido; agentes indisponiveis aparecem como erro, nao como lista vazia
    permission_denied: configuracao so flow:admin (403)
reused_components: [Modal com steps, Card/Alert/Badge/Table do conector]
new_components:
  - component: CustomerValidationStep
    classification: excecao_isolada
  - component: CustomerValidationSettingsPage
    classification: excecao_isolada
deferred: nenhum (botao na listagem e alertas entregues em 2026-10-16)
decision_status: applied_pending_human_review
```

## Perguntas Abertas

| # | Pergunta | Recomendacao | Bloqueia |
|---|---|---|---|
| 1 | Checklist do card e anexos da ficha convivem? | Ficha guarda os 4-5 itens acima; checklist do card reaproveita o extrato da ficha em vez de pedir de novo (HISCON/HISCRE) | S1 |
| 2 | Tipos de documento da ficha | Resolvida (2026-10-16): catalogo fixo, uploads opcionais para salvar, obrigatorios para validar | — |
| 3 | Quem pode validar e confirmar | Resolvida (2026-10-16): `flow:customers:write` ou `flow:admin` para validar e confirmar | — |
| 4 | Retencao no Drive ao remover documento da ficha | Seguir ADR 015: espelhar so exclusao canonica aprovada | S3 |
| 5 | CPF e documento separado sempre, ou o numero na CNH/RG novo dispensa? | Perguntar ao contratante; ate la, exigir separado | S1 |
| 6 | Validade maxima do comprovante "atual" e do extrato (dias) | Aguardando contratante; premissa provisoria 90 dias para os dois, configuravel no prompt da rotina | S2 (nao bloqueia) |
| 7 | Declaracao de terceiros tem modelo proprio? Exige documento de identidade do terceiro? | Perguntar ao contratante; com modelo, o Flow pode gerar a declaracao preenchida | S1 |
| 8 | Cliente pessoa juridica (CNPJ): quais documentos valem? | Fora do escopo por decisao do usuario (2026-10-16); reabrir com lista de documentos de PJ | — |

## Riscos

- Documentos com dados pessoais vao para a conta Claude do usuario; exige aceite
  especifico do gestor e fica registrado na politica do conector.
- CPF/CNPJ no nome da pasta expoe o dado a quem acessa o Drive da empresa
  (Drive do proprio contratante; aceito).
- Rotina depende de conector publico em HTTPS; em dev so ha teste local da tool.
- Sessao paralela altera o worker Drive na `main`; S0 so integra a ADR 016 apos
  o commit dela.

## Architecture Graph

Nodes `planned` em `docs/architecture-graph/registry.yaml`:
`capability:flow-customer-documents` e `capability:flow-customer-validation`,
contidos em `module:bff-jboot-platform/kanban`; a validacao `depends_on`
`capability:flow-claude-connector` e `capability:claude-routine-dispatch`. A
aresta para a replica Drive entra quando o node da replica estiver na `main`.

## Agent Activation

```yaml
using_agent:
  - docs/agents/orchestration/product-owner.md
  - docs/agents/orchestration/product-engineer.md
  - docs/agents/orchestration/architect.md
  - implementations/bff-jboot-platform/modules/kanban/agents/kanban-board-domain.md
using_skill:
  - docs/skills/ai-first-governance/SKILL.md
  - docs/skills/security-checklist/SKILL.md
referenced_only:
  - docs/agents/orchestration/ui-ux.md
  - docs/agents/orchestration/ai-graph-architect.md
```
