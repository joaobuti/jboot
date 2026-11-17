# Flow — Contrato De Servicos Por Escritorio

```yaml
target_project: implementations/bff-jboot-platform + implementations/app-jboot-next-platform
target_module: modules/kanban
lifecycle_status: functional
depends_on: docs/product/flow-customer-documents-sprints.md (ficha, validacao por rotina Claude)
```

## Contexto

Cada escritorio mantem o proprio modelo de "Contrato de Prestacao de Servicos
Advocaticios". Hoje o texto ja usa tags entre colchetes duplos, por exemplo
`[[NOME_COMPLETO]]`, `[[CPF]]`, `[[ENDERECO_COMPLETO]]`. Os valores das tags
virao da extracao feita pela IA (rotina Claude da conta central) a partir dos
documentos da ficha.

## Decisoes Humanas (2026-10-21)

- Nova aba "Contrato Servicos" na tela Escritorios.
- Editor no estilo Word do Velzon: **Quill** (BSD). CKEditor 5 descartado: a
  licenca gratuita e GPL e o Flow e SaaS fechado.
- **Um modelo por escritorio**, com historico de versoes.
- **Tags livres**: valem as tags que existirem no modelo. Mudanca no modelo
  exige que o cliente ajuste o prompt da rotina; alinhado e aceito pelo
  cliente. Nao ha catalogo fixo de tags.
- **Todos os valores das tags vem da extracao da IA**, inclusive dados que nao
  estao na ficha (estado civil, profissao); alinhado e aceito pelo cliente.

## PE Decision

- `Deployment Boundary Gate`: mesmo processo `platform-api`, mesmo banco do
  tenant e mesma Platform Web; herda a stack do host. Sem servico novo.
- `Stack Fit Gate`: nao se aplica a runtime. Dependencias novas so de
  biblioteca: `quill` 2.0.3 e `react-quilljs` 2.0.5 na Web (as do template
  Velzon), `sanitize-html` 2.18.0 no BFF para limpar o HTML no servidor.
- Conteudo guardado como HTML do Quill, limpo por allowlist no servidor
  (sem script, estilo livre, iframe ou atributo de evento). A Web nunca
  renderiza HTML que nao tenha passado pelo servidor.
- Tag valida: `[[` + letras maiusculas, digitos ou `_` + `]]`, detectada no
  texto sem marcacao (formatacao no meio da tag nao a quebra). Texto entre
  `[[ ]]` fora desse formato vira aviso "tag mal escrita", nao bloqueio.
- Versoes imutaveis: salvar conteudo diferente do atual cria a versao N+1;
  salvar igual nao cria versao. Contratos gerados (sprint futura) gravam a
  versao usada.

## Sprints

### Sprint 1: Modelo No Editor

> Status: `concluida` (2026-10-21). O editor Quill e substituido pelo modelo em
> `.docx` na Sprint 3 (ADR 019, decisao 14).

Entregaveis:

- migration `089_kanban_office_service_contracts.sql` (versoes por escritorio);
- `GET /kanban/offices/{officeId}/service-contract` (atual + historico),
  `GET .../versions/{version}` e `PUT .../service-contract` (`flow:admin`),
  com auditoria `kanban_office_service_contract_saved`;
- aba "Contrato Servicos": escolha do escritorio, editor Quill, botao
  "Inserir tag", lista das tags detectadas e avisos, salvar, historico com
  visualizacao e restauracao de versao, previa com as tags destacadas.

Criterios de aceite:

- so `flow:admin` le e grava; escritorio de outro tenant responde 404;
- HTML com script, `onerror`, `style` livre ou `iframe` e limpo antes de gravar;
- tags formatadas no meio (`[[<b>CPF</b>]]`) continuam detectadas;
- salvar sem alteracao nao cria versao;
- colar texto do Word preserva paragrafos, negrito, italico e listas.

UI/UX (`docs/agents/orchestration/ui-ux.md`): nova aba no padrao de abas da tela
Escritorios; editor Quill do Velzon (tema snow) com cartoes laterais "Tags" e
"Versoes" no padrao de cards do template; previa e versao em modal. Sem padrao
novo de interface.

Seguranca: `flow:admin` no controller; escritorio por `client_id` (404 fora do
tenant; FK composta no banco); HTML limpo por allowlist (`sanitize-html`)
antes de gravar e devolvido sempre limpo; a previa so renderiza HTML do proprio
editor ou ja limpo no servidor; auditoria sem conteudo do contrato.

Evidencias (2026-10-21, no container):

- migration 089 aplicada no banco de dev;
- BFF: type-check, lint, build e 622 testes (620 passam, 2 ignorados ja
  existentes); limpeza do HTML (inclusive tabelas), deteccao de tags com formatacao no meio,
  versoes por escritorio com PostgreSQL real, isolamento de tenant;
- Web: type-check, lint e 131 testes; `next build`;
- navegador: aba, editor, "Inserir tag" (`nome completo` -> `[[NOME_COMPLETO]]`),
  lista de tags e previa com tags destacadas; API: 404 para escritorio
  inexistente e 422 para contrato vazio;
- ajuste pos-teste do usuario: editor com altura fixa e rolagem interna;
  modulo de tabela do Quill 2 ligado (colar tabela do Word mantem linhas,
  celulas, negrito e tags; botoes inserir/remover linha, coluna e tabela).
  Limite conhecido: sombreamento, largura de coluna, celulas mescladas e
  varios paragrafos na mesma celula nao sao preservados.

## Decisoes De 2026-10-22 (Kit Do Escritorio)

Todas confirmadas pelo usuario. Detalhes e motivos em
`docs/architecture/decisions/019-flow-office-kit-generated-by-flow.md`.

- O modelo de cada escritorio e o kit inteiro, com todas as tags. O kit sai da
  substituicao das tags pelos valores extraidos pela IA.
- Quem monta o kit e o **Flow**, de forma deterministica. A IA confere e devolve
  valores.
- **Modelo e kit em `.docx`.** O modelo passa a ser o `.docx` do escritorio
  (upload versionado), no lugar do editor Quill da Sprint 1.
- **Contratos:** a linha com tags `_1` e o molde e e repetida por contrato.
- **Concordancia:** as marcas `(a)`/`(s)` sao resolvidas pelo genero e pela
  quantidade de instituicoes.
- **Renuncia:** blocos `[[SE_JEC]]`/`[[SE_JEF]]`, pela regra do prompt do
  escritorio (JEC padrao; JEF quando a acao tambem for contra o INSS; na duvida,
  JEC com alerta). A IA sugere e a pessoa confirma.
- **Valores calculados pelo Flow:** `DATA_POR_EXTENSO` e `LISTA_BANCOS`.
- **Declaracao de residencia sai do kit:** e o mesmo documento que o cliente ja
  envia assinado, conferido na validacao.
- **Dado de entrevista ausente** (estado civil, profissao) impede a aprovacao.
- **Documentos por etapa:**
  - a validacao le identidade, CPF, comprovante, declaracao e HISCON;
  - o HISCRED so na automacao da Analise de Acoes;
  - documento nao lido fica "nao conferido pela IA".

Sprint gate: liberado. Insumos externos para o teste da S3 e da S4: o `.docx`
do modelo do escritorio, sem a declaracao de residencia e com os blocos JEC/JEF,
e uma ficha real com HISCON de mais de 2 contratos.

## Decisoes De 2026-10-28 (Geracao Do Kit Na Confirmacao)

Confirmadas pelo usuario (ADR 019, decisao 19):

- os valores do kit vem da extracao da IA revisada por uma pessoa, nao direto da ficha;
- o kit e o modelo inteiro do escritorio (contrato de honorarios, procuracao, declaracao fatica, termo
  de renuncia), nao so o contrato;
- **gera sozinho** ao confirmar a validacao; valor vazio fica como no modelo original e o advogado
  responsavel corrige no arquivo;
- o arquivo vai **so para o Drive** por enquanto (nao entra na ficha). Revisado em 2026-10-30: o kit
  mais recente tambem aparece para baixar no bloco Documentos do card (ADR 019, decisao 19).

PE Decision (2026-10-28):

- `Deployment Boundary Gate`: mesmo processo `platform-api`, banco do tenant e Platform Web; herda a
  stack. Sem servico novo. `Stack Fit Gate`: nao se aplica (motor `.docx` docxtemplater ja existe no BFF).
- Ordem: Sprint 3 (modelo `.docx`) antes da Sprint 4 (geracao). Sem modelo `.docx` a confirmacao nao
  gera kit e registra o motivo.
- A geracao roda depois da confirmacao, fora da transacao dela: falha nao desfaz a confirmacao nem o
  card de entrada (como o card da decisao 16) e fica visivel na etapa Validacao.
- Envio ao Drive pela fila existente (`kanban_document_syncs`) com nova origem `office_kit`; o arquivo
  fica no storage do Flow so como origem do envio, sem aparecer na ficha.

Perguntas da S4 (as quatro recomendacoes do PE aprovadas pelo usuario em 2026-10-28):

| # | Pergunta | Recomendacao do PE |
|---|---|---|
| Q1 | "Vazio no modelo original" = manter a tag `[[CAMPO]]` visivel no `.docx` | Manter a tag: o advogado acha o campo por busca |
| Q2 | Parecer com pendencias confirmado gera kit? | Nao gera (regra do escritorio "KIT NAO GERADO"); so parecer aprovado |
| Q3 | Marca de genero/plural nao reconhecida | Gerar mantendo o texto original da marca e listar o trecho no aviso |
| Q4 | Drive inativo ou falha no envio | Kit fica na fila e sobe quando o Drive voltar; a etapa Validacao mostra "kit aguardando Drive" |

`sprint_gate`: S3 liberada (decisoes de 2026-10-22); S4 liberada (Q1-Q4 aprovadas). Insumo externo: o
`.docx` do escritorio com os blocos JEC/JEF.

### Sprint 2: Valores Das Tags Pela IA E Documentos Por Etapa

> Status: `concluida` (2026-10-22). Smoke com a rotina real pendente (colar o prompt novo).

Entregaveis:

- pedido de validacao (`flow_get_customer_validation_request`) inclui
  `contractModel`: escritorio, versao e tags da versao atual do modelo do
  escritorio da validacao, sem tags de bloco e sem as que o Flow calcula;
- parecer (`flow_submit_customer_validation`):
  - `tagValues` (objeto tag -> texto), aceito so com `aprovado`, so para tags do
    modelo enviado, mais `BANCO_n`/`CONTRATO_n`/`INICIO_n`/`VALOR_n`/`PARCELAS_n`
    acima de 2;
  - `gender` (`masculino`/`feminino`) e `waiverCourt` (`jec`/`jef`);
  - `generalFindings` (pendencias que nao sao de um documento) e `alerts` (nao
    impeditivos);
- a validacao guarda os valores, o genero, a renuncia e a versao do modelo;
- tela de revisao na etapa Validacao:
  - uma linha por tag, com o valor sugerido pela IA, editavel;
  - destaque para tag sem valor;
  - genero e renuncia JEC/JEF;
  - alertas e pendencias gerais;
- documentos por etapa:
  - lista "Documentos que a rotina pode ler" em Configuracoes -> IA -> Validacao
    de cadastro;
  - a mesma lista na regra de automacao "Executar agente";
  - as ferramentas recusam documento fora da lista (`document_not_allowed`);
  - documento nao lido mostra "nao conferido pela IA";
  - padrao: todos liberados. Na configuracao do cliente, a validacao fica sem o
    HISCRED e a regra da Analise de Acoes o libera;
- prompt padrao da validacao atualizado com a versao de
  `docs/product/flow-office-kit-routine-prompt.md`.

Ate a S3, as tags vem do modelo em HTML (Quill) ja cadastrado. A S3 troca a fonte
para o `.docx` sem mudar o contrato das ferramentas.

Criterios de aceite:

- `tagValues` com parecer `pendencias` e descartado;
- tag fora do modelo e descartada, exceto `_n` dos contratos;
- valor maior que o limite e descartado;
- documento fora da lista da etapa responde `document_not_allowed` e nao e lido;
- a rotina de automacao so ve os documentos liberados na propria regra;
- a revisao mostra divergencia entre `NOME_COMPLETO`/`CPF` e a ficha;
- a auditoria registra so nomes de tags, nunca valores.

Evidencias (2026-10-22, no container):

- migration 097 aplicada no banco de dev;
- BFF: type-check, lint, build e 689 testes (687 passam, 2 ignorados ja existentes), incluindo
  PostgreSQL real para politica, modelo no run, valores do kit e revisao so no aprovado;
  `document_not_allowed` na validacao e na automacao; `tagValues` descartados com `pendencias`;
  tag fora do modelo, nao textual e longa descartadas; `BANCO_3` aceito pela linha-molde;
  auditoria sem valores;
- Web: type-check, lint, 146 testes e `next build`. Telas: "Valores do kit" na etapa Validacao
  (genero, JEC/JEF, uma linha por tag, sugestao da IA quando alterada, contagem de tags sem
  valor), pendencias e alertas do parecer, selo "Nao conferido pela IA", cartao "Documentos que
  a rotina de validacao pode ler" e lista de documentos na regra "Executar agente";
- prompt padrao da tela atualizado para a versao generica de
  `docs/product/flow-office-kit-routine-prompt.md` (sem regras proprias do escritorio de Maceio).

#### Complemento Da Sprint 2: Card Automatico Na Confirmacao (2026-10-26)

ADR 019, decisao 16.

- Migration 098: tabela `kanban_office_intake_boards` e colunas `intake_*` na validacao.
- O pedido grava o escritorio escolhido (`intake_office_id`).
- A confirmacao cria o card no BACKLOG do board de entrada do escritorio (`CustomerIntakeCardService`,
  sobre `createCardFromCustomer`, com idempotencia `validation-intake:<run>`), vincula o cliente e
  registra o resultado: `created`, `existing`, `no_office`, `no_board`, `no_backlog` ou `failed`.
- Tela de configuracao: coluna "Board de entrada" por escritorio.
- Etapa Validacao: resultado com link "Abrir card".
- O modal de confirmacao (`ConfirmActionModal`, que substitui `window.confirm` no modulo) explica o
  efeito da confirmacao.
- A busca de cliente no card aceita o cliente da ficha pelo escritorio do usuario.

Evidencias (2026-10-26, no container):

- BFF: 697 testes (695 passam, 2 ignorados ja existentes), com PostgreSQL real para board de
  entrada, resultado no run e visibilidade por escritorio da ficha;
- Web: type-check, lint e 147 testes.

#### Complemento Da Sprint 2: Responsavel Do Card De Entrada (2026-10-29)

> Status: `concluida` (2026-10-29).

Decisao do usuario: o card criado na confirmacao recebe como responsaveis todos os responsaveis do escritorio
(aba Usuarios). Quem nao e membro ativo do board de entrada ou nao ve o card fica de fora, com aviso na etapa
Validacao; o card e criado do mesmo jeito. Os advogados do escritorio (nome/OAB/UF) nao sao usuarios do Flow.

- BFF: `AssigneesService.assignBySystem`, `listOfficeResponsibles`, migration
  `109_kanban_validation_intake_assignees.sql` (`intake_assignees` no run), nomes no status;
- Web: o aviso do card de entrada lista o responsavel e quem ficou de fora; o modal de confirmacao e a aba
  Usuarios dizem que o responsavel do escritorio recebe o card.

Evidencias (2026-10-29, no container): migration 109 aplicada duas vezes no dev; testes do servico de
responsaveis, do card de entrada, do status e do repositorio no PostgreSQL real; suites completas do BFF e
da Web, lint, build e `make ai-check`.

#### Complemento Da Sprint 2: Pastas Do Drive Por Escritorio (2026-10-26)

ADR 019, decisao 17.

- Caminho: `<raiz>/<escritorio>/<CPF - nome>/<arquivo>`. A pasta do escritorio e criada quando
  nao existe; a do cliente e achada pelo CPF no inicio do nome, entao trocar o nome no cadastro nao
  cria pasta nova.
- Escritorio do documento da ficha: o da validacao confirmada mais recente (escritorio do pedido),
  senao o primeiro vinculo ativo do cliente; sem nenhum, pasta `Sem escritorio`. Peticao: escritorio
  do card.
- Arquivos ja enviados nao sao movidos.

Evidencias (2026-10-26, no container): BFF type-check, lint e 699 testes (697 passam, 2 ignorados
ja existentes), incluindo criacao da pasta do escritorio e reuso da pasta do cliente pelo CPF.

#### Complemento Da Sprint 2: Botao Validar Libera Sozinho Apos Falha Da Rotina (2026-10-26)

Pedido do usuario: erro da IA nao pode deixar o botao Validar bloqueado por 30 minutos.

- A rotina que nao alcanca o Flow (tunel, conector, autorizacao) nao consegue avisar a falha: o
  conector e o proprio canal. O Flow passa a medir a chegada: `picked_up_at` (migration 099) e
  gravado na primeira chamada da rotina pelo conector, e cada chamada renova o prazo.
- Sem leitura do pedido em 5 minutos: `expired` com `routine_not_reached` e botao liberado.
- Depois da leitura: 15 minutos sem chamar o conector viram `routine_no_answer` (antes: 30 min).
- A etapa Validacao mostra o motivo em texto; a tela consulta a cada 15 s, entao libera sem
  recarregar.

Evidencias: ver relatorio da sessao (BFF e Web no container).

#### Complemento Da Sprint 2: Editar Automacao Existente (2026-10-26)

Pedido do usuario: a lista de documentos liberados so podia ser escolhida na criacao da regra.

- Cada regra ganha o botao Editar, que abre o mesmo modal preenchido e salva pelo `PATCH`
  ja existente (`UpdateColumnAutomationRuleDto`); sem mudanca de API.
- Editaveis: gatilho, prazo em dias, agente, documentos do cliente e destinatario do e-mail.
- O tipo de acao (e-mail x agente) nao muda na edicao: o `PATCH` nao limpa `recipient_role`;
  para trocar, remove-se a regra e cria-se outra.
- Regra com agente fora da lista do usuario (de outro usuario ou desativado) mantem o agente
  e permite ajustar so os documentos.

Evidencias: `tsc`, `eslint` e `automation-agent-action.spec.ts` (6 testes) no container.

### Sprint 3: Modelo Do Escritorio Em `.docx`

> Status: `concluida` (2026-10-29). Pendencia operacional, fora do codigo: enviar na aba o `.docx`
> validado do escritorio (`KIT_MODELO_AM`), sem ajuste no Word (ADR 019, decisao 20).

Entregaveis:

- aba Contrato Servicos com upload do `.docx` do escritorio (`flow:admin`):
  - cada envio e uma versao nova;
  - lista de tags detectadas no texto, mesmo com formatacao no meio da tag;
  - avisos de tag mal escrita;
  - lista das marcas de genero e plural encontradas, separando reconhecidas e
    nao reconhecidas;
  - deteccao dos blocos JEC/JEF;
- validacao do arquivo no upload:
  - tamanho, assinatura do conteudo e zip seguro;
  - sem macro;
  - blocos abertos e fechados;
  - linha-molde `_1` dentro de uma linha de tabela;
- download da versao e historico. As versoes HTML (Quill) da Sprint 1 ficam so
  como historico, sem edicao;
- o editor Quill e a previa HTML saem da aba.

Criterios de aceite:

- `.docx` com macro, zip malformado ou acima do limite e recusado;
- tag formatada no meio (`[[NOME_` em negrito + `COMPLETO]]`) e detectada;
- bloco sem fechamento e recusado com mensagem;
- enviar o mesmo arquivo nao cria versao;
- so `flow:admin` envia; escritorio de outro tenant responde 404.

Implementacao (2026-10-28):

- migration `107_kanban_office_service_contract_docx.sql` (formato, arquivo e analise na versao);
- `POST .../service-contract/versions` (multipart) e `GET .../versions/{version}/download`; o `PUT` do
  HTML saiu; analise em `offices/service-contract/office-kit-docx.ts`, na worker thread dos `.docx`;
- regras alem do aceite: tag `_1` de contrato fora de linha de tabela e bloco dentro de bloco sao
  recusados; linhas `_2+`, bloco diferente de JEC/JEF e falta de um dos blocos viram aviso;
- UI/UX: sem padrao novo. A aba reaproveita o campo de arquivo, as regras de 10 MB e o download dos
  modelos de documento (`DocumentTemplatesPanel`) e os cartoes "Tags"/"Versoes" da Sprint 1.

Evidencias (2026-10-28, no container): migration 107 aplicada duas vezes no dev; BFF type-check, lint,
build e 807 testes (805 passam, 2 ignorados ja existentes), com analise de `.docx` sintetico (tag com
formatacao no meio, blocos, linha-molde, marcas do modelo de Manaus) e versao `.docx` sobre o historico
HTML no PostgreSQL real; Web type-check, lint, 170 testes e `next build`. Em 2026-10-29: o texto real do
modelo de Manaus (versao 2, HTML) convertido em `.docx`, com a linha `_2` removida e os blocos JEC/JEF
acrescentados como o escritorio fara no Word, passou na analise (23 tags, blocos JEC/JEF, linha-molde com
as 5 tags `_1`, nenhuma marca nao reconhecida). O arquivo `.docx` proprio do escritorio e o upload na tela
ficam com o escritorio.

### Sprint 4: Kit Gerado Em `.docx`

> Status: `concluida` (2026-10-29), com as decisoes de 2026-10-28 (geracao sozinha na confirmacao, tag
> sem valor visivel, so Drive) e o plural por palavra (decisao do usuario, 2026-10-29).

Entregaveis:

- montagem deterministica sobre a versao do modelo `.docx` e os valores
  revisados, com o motor `.docx` ja existente no Flow (docxtemplater):
  - substituicao das tags;
  - linha-molde repetida por contrato e linhas sem valor removidas;
  - bloco JEC ou JEF mantido conforme a revisao;
  - marcas de genero e plural resolvidas;
  - `DATA_POR_EXTENSO` e `LISTA_BANCOS` calculados;
- checagem final (revisada em 2026-10-28, decisao 19): valor vazio **nao** bloqueia; o trecho fica
  como no modelo (a tag `[[CAMPO]]` fica visivel, Q1; marca nao reconhecida mantem o texto, Q3) e a
  geracao lista os campos sem valor para o advogado corrigir;
- arquivo `KIT_<NOME>_<AAAA-MM-DD>.docx`, gravado com a versao do modelo e os
  valores usados, enviado **so** para a pasta do CPF no Drive (sem download na ficha, decisao 19);
- geracao **automatica** na confirmacao do parecer por quem tem `flow:validation:approve`.

Criterios de aceite:

- cliente com 1, 2 e 3 contratos gera o numero certo de linhas em todas as
  tabelas;
- cliente feminino e masculino, com 1 e com 2 ou mais bancos, sem nenhuma marca
  `(a)`/`(s)` restante;
- JEC e JEF geram so o bloco escolhido;
- marca desconhecida no modelo bloqueia com mensagem apontando o trecho;
- gerar de novo com o mesmo modelo e os mesmos valores produz o mesmo conteudo;
- o `.docx` gerado abre no Word e no LibreOffice sem aviso de reparo.

Implementacao (2026-10-29):

- plural por palavra (decisao do usuario, 2026-10-29): contrato(s), emprestimo(s), parcela(s) e
  desconto(s) seguem a quantidade de contratos, e tambem o artigo ou preposicao com marca logo antes
  deles (`pelo(s) contrato(s)`); as demais marcas seguem a de instituicoes;
- motor proprio sobre o XML do Word (`offices/service-contract/office-kit-render.ts`), na worker thread
  dos `.docx`, em vez do docxtemplater: os blocos `[[SE_X]]` e a linha-molde `_1` nao cabem na sintaxe
  dele sem reescrever as tags, e as marcas ficam fora das tags. Tag ou marca dividida pelo Word em varios
  runs vai inteira para o primeiro run;
- `OfficeKitGenerationService` roda depois da confirmacao e do card de entrada, fora da transacao; so
  parecer aprovado e modelo `.docx`; valores revisados, senao os da IA; resultado em
  `kanban_customer_validation_runs.kit_result` (`generated`, `not_approved`, `no_model`,
  `model_not_docx`, `failed`); kit em `kanban_customer_office_kits` (migration `108`) com o relatorio
  (tags sem valor, marcas nao resolvidas, CPF diferente da ficha);
- Drive: nova origem `office_kit` na fila existente, pasta do escritorio do modelo e do CPF, nome
  `KIT_<NOME>_<AAAA-MM-DD>.docx`; Drive desligado deixa o kit sem fila e a reconciliacao o envia depois;
- etapa Validacao: aviso do kit (motivo de nao gerar, envio ao Drive, campos `[[CAMPO]]` a corrigir);
  o texto da confirmacao diz que o kit e gerado; "Valores do kit" so para consulta depois da confirmacao
  (o BFF recusa revisao com `customer_validation_kit_already_generated`).

Evidencias (2026-10-29, no container): migration 108 aplicada duas vezes no dev; BFF type-check, lint,
build e 819 testes (817 passam, 2 ignorados ja existentes), com montagem de 1 a 3 contratos, genero
feminino/masculino/sem genero, plural por palavra, JEC/JEF, tag e marca divididas em runs, kit gravado e
enfileirado no Drive no PostgreSQL real; Web type-check, lint e 171 testes; montagem com o texto real do
modelo de Manaus: 3 contratos em linhas proprias, todas as marcas resolvidas, so os campos sem valor
como `[[TAG]]`. Em 2026-10-29, com o `KIT_MODELO_AM` real (4 tabelas, linhas fixas `_1`/`_2`, renuncia
so JEC, Declaracao de Residencia, 106 runs com destaque amarelo), sem nenhuma edicao: analise com 20 tags e
so o aviso da Declaracao; montagem com 3 contratos numerados 1-3 em cada tabela, Declaracao fora, nenhum
destaque restante, nenhuma marca sem resolver, e no JEF o trecho da renuncia trocado (ADR 019, decisao 20).
Excecao registrada: um hook de governanca bloqueou a criacao de arquivos nesta sessao por
falso positivo (texto do CLAUDE.md e `new Worker(` no historico da conversa); com autorizacao do usuario,
os arquivos da S4 foram gravados pelo terminal. Pendente fora do codigo: abrir um kit real no Word
depois que o escritorio enviar o `.docx` e validar um cliente.

## Riscos

- Resolvido pela ADR 019 (modelo em `.docx`, Sprint 3): o Quill perdia
  sombreamento, largura de coluna, celulas mescladas e estilos de pagina.
- Tag dividida pelo Word em varios trechos de texto (ex.: corretor ortografico no
  meio da tag): a S3 detecta e a S4 substitui considerando o texto do paragrafo,
  nao o trecho isolado.
- Tag renomeada no modelo fica sem valor; a tela de revisao da S2 destaca a tag
  vazia e a S4 nao gera com valor vazio.
- Marca de genero ou plural escrita fora do padrao no modelo (ex.: `portador/a`)
  nao e reconhecida e bloqueia a geracao. A S3 lista as marcas no upload.
- O prompt adaptado (`docs/product/flow-office-kit-routine-prompt.md`) usa campos
  que so existem depois da S2 (`contractModel`, `tagValues`, `gender`,
  `generalFindings`, `alerts`). Ate la, vale o prompt padrao atual da tela de
  validacao.
