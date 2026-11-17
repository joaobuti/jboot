# Flow — Peticoes Iniciais De Consignado (JEC E JEF) Geradas Pela Rotina

```yaml
target_project: implementations/bff-jboot-platform + implementations/app-jboot-next-platform
target_module: modules/kanban
lifecycle_status: in_development
decisoes: docs/architecture/decisions/020-flow-initial-petitions-generator.md
texto_do_cliente: docs/product/flow-initial-petitions-original-prompt.md
abertura: docs/product/flow-initial-petitions-kickoff.md
etapa_anterior: docs/product/flow-action-analysis-sprints.md (A1)
branch: feature/flow-office-kit (decisao do usuario, 2026-10-28: mesma branch, sem commit)
```

## Pedido (2026-10-27)

Hoje um estagiario cola o prompt do escritorio no Cowork, anexa a pasta do cliente e recebe as
peticoes em `.docx`. No Flow, a rotina Claude roda pela regra "Executar agente" da coluna seguinte a
Analise de Acoes, le os dados pelo conector e entrega as peticoes no card, pendentes de aprovacao do
advogado. As decisoes 1 a 15 do usuario estao no kickoff e na ADR 020; nao se reabrem.

## PE Decision

- Deployment Boundary Gate: mesmo modulo `kanban`, mesmo processo e deploy do BFF e do app Platform;
  herda NestJS, Next.js e PostgreSQL. Sem runtime, container ou servico novo.
- Stack Fit Gate: nao se aplica (nenhuma unidade nova de build ou deploy). Dependencias dentro do host:
  - montagem do `.docx` com a biblioteca `docx` (npm, MIT): nota de rodape real, tabela, sombreamento,
    realce, "manter com o proximo", quebra de pagina e imagem. O `docxtemplater` so preenche modelo e
    exige modulos pagos para imagem e nota; OOXML escrito a mao foi descartado (relacoes de nota e
    numeracao sao faceis de errar). Passa pelo `security-checklist` na S4;
  - recorte do print com `pdfjs-dist` e `@napi-rs/canvas`, ja no projeto.
- Envio no modo Flow em duas ferramentas (Q3): uma peticao por chamada, guardada como provisoria, e o
  fechamento com o relatorio, que promove as provisorias, encerra a execucao e move o card na mesma
  transacao.
- Pre-condicoes no disparo: sem UF no endereco da ficha ou sem a lista de acoes ajuizadas e sem a
  confirmacao "sem acoes anteriores", o Flow falha a execucao antes de chamar a rotina.
- Peticao reaproveita `kanban_card_generated_documents` (aprovacao, PDF, versao editada, gatilho do
  Drive) com a origem nova `routine_petition`; tabelas proprias para execucao, peticao, vinculo com as
  acoes da analise e julgados usados.
- Acoes ajuizadas e advogados no banco do Flow (`jboot_kanban_*`), junto da validacao e dos documentos
  do cliente.

## Decisoes Do Usuario (2026-10-28)

| # | Tema | Decisao |
|---|---|---|
| Q1 | Registro | ADR nova: `docs/architecture/decisions/020-flow-initial-petitions-generator.md` |
| Q2 | Branch | `feature/flow-office-kit`, sem commit |
| Q3 | Envio no modo Flow | Duas ferramentas: peticao por chamada (provisoria) e fechamento transacional |
| Q4 | Prazo da execucao de peticoes | 5 min para chegar ao Flow; 30 min sem chamada; 3 h no total. Comentario e Analise de acoes ficam com 5/15 min |
| Q5 | Recusas dentro da ementa | Ementa isenta de "—" e "(a)" (regra 10.1.2, texto literal); "{", "}", "nao informado" e ponto duplo valem nela; "(...)" nao e ponto duplo |
| Q6 | Advogado que assina | No maximo um advogado ativo por escritorio e UF |
| Q7 | Aprovacao da peticao | Scope novo `flow:petition:approve` (seed do Operador Senior e do Usuario Teste); `flow:admin` tambem aprova |
| Q8 | Migracao das regras | Regra que ja gravou Analise de Acoes vira `action_analysis`; as demais `comment`. Lista do banco de dev conferida com o usuario antes de aplicar |
| Q9 | Modo IA sem rede | Decidir depois do S0 |
| Q11 | Print no RMC sem refinanciamento (secao 8 x secao 12 do prompt) | Sem print: a linha do cartao vai em texto (decisao do usuario, 2026-10-28; ADR 020, decisao 13) |
| Q10 | Rotina sem WebFetch | Decidir depois do S0 |

## Decisoes Do Usuario (2026-10-29)

Pedido: a peca sai com `XXXX` no local, na data, no nome e na OAB do fecho, e nao ha como trocar uma
peticao com erro pela versao corrigida. Registradas na emenda da ADR 020 (decisoes 15 a 21).

| # | Tema | Decisao |
|---|---|---|
| Q12 | Data do fecho | Data da geracao, por extenso (a peca pode ser protocolada dias depois) |
| Q13 | Quem assina | Responsavel do card com OAB na UF da acao; hierarquia: responsavel pelo escritorio do card > `board_admin` > demais; empate, qualquer um |
| Q14 | Onde fica a OAB | Cadastro do usuario do Flow, varias OABs por usuario (uma por UF); Escritorios -> Advogados sai |
| Q15 | Local do fecho | Cidade/UF do escritorio do card (campo novo) |
| Q16 | Versao corrigida | A qualquer momento ate a peticao ter protocolo; volta a pendente de aprovacao e, aprovada, substitui o arquivo no Drive |
| Q17 | Branch | `feature/flow-petition-signature`, a partir da `main` |

## Sprint S0: Spike Da Rotina Na Nuvem Do Claude

> Status: `pendente` (roteiro pronto; quem roda e o usuario, na conta Claude da rotina).

Objetivo: medir o que a sessao da rotina consegue fazer, antes de fechar o modo IA (S6) e o prompt (S5).

Roteiro (rotina de teste, sem cliente real; colar como instrucao e disparar a mao):

1. `curl -sS -o /dev/null -w '%{http_code}' https://<BFF>.trycloudflare.com/health` e o mesmo para
   `https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm`. Anotar codigo ou erro de rede.
2. WebSearch por "Recurso Inominado consignado dano moral TJSC" e WebFetch da primeira pagina de
   acordao. Anotar se a ementa foi lida.
3. `python3 -c "import docx"` e, se faltar, `pip install python-docx`. Anotar se instalou.
4. Chamar `flow_add_card_comment` num card de teste com textos de 20 mil e 60 mil caracteres (o limite
   do Flow recusa; o que interessa e se o Claude envia a chamada inteira ou corta antes).
5. Anotar o tempo total e o maior intervalo sem chamar o Flow.

Resultado esperado: registro nesta secao (data, conta, respostas 1 a 5). Decide Q9 e Q10.

## Sprint S1: Resultado Esperado E Gerador Na Regra

> Status: `concluida` (2026-10-28). Smoke com a rotina real pendente (junto do smoke da A1).

Entregaveis:

- `actionConfig.expectedResult` (`comment` | `action_analysis` | `initial_petitions`) na regra
  "Executar agente", obrigatorio para rotina Claude e para chave de API; `actionConfig.documentGenerator`
  (`flow` | `ai`, padrao `flow`) so em `initial_petitions`, recusado nos demais;
- conclusao por comentario com `run_id` so em `comment`: em `action_analysis` e `initial_petitions` o
  comentario e gravado, a execucao continua aberta e o retorno diz que a conclusao e pela ferramenta
  propria (fecha o risco residual da A1);
- `flow_submit_action_analysis` so conclui execucao de regra `action_analysis` (ou sem resultado
  declarado, para execucoes ja disparadas antes da migracao);
- prazo por resultado esperado: `initial_petitions` com 30 min sem chamada e 3 h no total; os demais
  como hoje (5/15 min);
- migration das regras existentes (Q8);
- modal da regra: "Resultado esperado" e, so em Peticoes iniciais, "Quem gera o documento"; avisos do
  modal coerentes com o resultado escolhido.

Criterios de aceite:

- regra `execute_ai_agent` sem `expectedResult` e recusada na criacao; `documentGenerator` fora de
  `initial_petitions` e recusado;
- comentario com `run_id` em regra `action_analysis` nao conclui nem move o card;
- Analise de Acoes enviada para execucao de regra `comment` ou `initial_petitions` e recusada sem gravar;
- execucao `initial_petitions` sem chamada ha 20 min continua aberta; ha 31 min expira;
- regra antiga sem `expectedResult` continua funcionando como comentario ate a migracao.

Fora da S1: ferramentas de peticao (S5), pre-condicoes no disparo (S3).

Migracao das regras (Q8), conferida no banco de dev em 2026-10-28: nenhuma regra gravou Analise de
Acoes ainda (smoke pendente), entao o criterio so pelo historico marcaria todas como `comment`. A
migration 101 tambem marca `action_analysis` a rotina Claude que libera so o HISCON
(`extrato_beneficio`), configuracao documentada da Analise de Acoes.

Aplicado no dev em 2026-10-28, com confirmacao do usuario: as tres regras da coluna "Analise de Acoes"
do board Manaus ficaram `action_analysis`. A `423e9052` (inativa, todos os documentos liberados) nao
entrava no criterio da migration e foi ajustada a mao, a pedido do usuario. A `f8c6ccba`, que duplicava
a `37e6a1e0` (mesmo agente e documentos, as duas ativas, duas rotinas por card), foi desativada. Fica
ativa so a `37e6a1e0`, com destino.

Evidencias (2026-10-28, no container):

- BFF: type-check, lint, build e 713 testes (711 passam, 2 ignorados ja existentes), incluindo
  PostgreSQL real para 30 min parada, teto de 3 h (`routine_time_limit`) e `dispatched_at` no disparo;
  regra exigindo resultado esperado e gerador so em peticoes; comentario com `run_id` sem concluir em
  regra de Analise de acoes; Analise de Acoes recusada (`wrong_expected_result`) em outra execucao;
- Web: type-check, lint, 155 testes e `next build`;
- `make ai-check` e `make ai-diff-check` aprovados.

Risco conhecido ate a S5: uma regra configurada como Peticoes iniciais dispara a rotina, mas a rotina
ainda nao tem ferramenta para concluir; a execucao expira pelo prazo com o motivo no card.

## Sprint S2: Acoes Ja Ajuizadas E Advogados Por UF

> Status: `concluida` (2026-10-28). Uso real pela rotina comeca na S3 (leitura pelo conector e
> pre-condicao no disparo).

Entregaveis:

- Ficha do cliente: lista de acoes ja ajuizadas (banco, numero do processo CNJ) e a confirmacao explicita
  "cliente nao tem acoes anteriores" (quem e quando).
  - Confirmar so com a lista vazia; incluir uma acao revoga a confirmacao (`lawsuit_added`); a pessoa
    tambem pode desfazer a confirmacao (`withdrawn`).
  - Remover acao e logico (quem e quando ficam); o historico mostra acoes removidas e confirmacoes.
  - Numero do processo no padrao CNJ (`NNNNNNN-DD.AAAA.J.TR.OOOO`, com ou sem mascara); repetido no
    mesmo cliente e recusado.
  - Leitura `flow:customers:read` ou `flow:admin`; escrita `flow:customers:write` ou `flow:admin`;
    visibilidade igual a da ficha (escritorio vinculado ou admin).
  - Auditoria sem conteudo: id do cliente, id da acao e evento.
- Escritorio: advogados com nome, OAB (numero e UF) e situacao; no maximo um advogado ativo por
  escritorio e UF (Q6), recusa com mensagem; so `flow:admin`.

Criterios de aceite:

- confirmar "sem acoes anteriores" com acao na lista e recusado;
- incluir acao depois da confirmacao revoga a confirmacao e o historico mostra os dois eventos;
- numero fora do padrao CNJ ou repetido no cliente e recusado;
- cliente de outro escritorio responde 404;
- segundo advogado ativo na mesma UF do escritorio e recusado; inativar o primeiro libera a UF.

UIUX Decision (ui-ux.md):

- `scenario_classification: covered_by_template`. Ficha: passo novo "Acoes ajuizadas"
  (`ri-scales-3-line`) no modal de cliente, entre "Dados juridicos" e "Escritorios", no padrao dos passos
  "Documentos" e "Validacao" (componente proprio que grava na hora; cliente ainda nao salvo mostra aviso
  para salvar primeiro). Tabela simples (Banco, Processo, Registrado por, Acao), formulario em linha para
  incluir, confirmacao "Cliente nao tem acoes anteriores" so com a lista vazia, estado em alerta
  (`success` confirmado, `warning` sem lista e sem confirmacao) e "Historico" recolhido.
- Escritorios: aba nova "Advogados" (`ri-scales-3-line`) em `/flow/escritorios`, no padrao
  `platform-crud-ui` da lista de escritorios: seletor de escritorio, tabela (Nome, OAB, Situacao, Acoes),
  modal de criar/editar sem steps (tres campos) e inativar/reativar com `ConfirmActionModal`.
- Sem padrao novo, sem item de menu novo.

Evidencias (2026-10-28, no container):

- migration 102 aplicada no banco de dev;
- BFF: type-check, lint, build e 721 testes (719 passam, 2 ignorados ja existentes), com PostgreSQL real
  para inclusao revogando a confirmacao, numero repetido, confirmar com lista, remover e incluir de novo,
  desfazer (`withdrawn`), isolamento por tenant, um advogado ativo por UF, inativar liberando a UF e
  reativar com a UF ocupada; CNJ e OAB normalizados; cliente fora da visibilidade sem gravar;
- Web: type-check, lint, 159 testes e `next build`;
- rotas `.../prior-lawsuits` e `.../lawyers` respondendo no BFF em execucao (401 sem token).

## Sprint S3: Leitura Pelo Conector E Pre-Condicoes

> Status: `concluida` (2026-10-28). Smoke com a rotina real fica para a S5 (o prompt de peticoes ainda
> nao existe).

Entregaveis:

- pre-condicoes num servico so (`PetitionPreconditionsService`): cliente vinculado com validacao aprovada,
  UF do endereco da ficha entre as 27, acoes ja ajuizadas listadas ou a confirmacao "sem acoes
  anteriores";
- no disparo da regra Peticoes iniciais: pre-condicao falhando encerra a execucao antes de chamar a rotina
  (sem gastar a assinatura) e deixa o motivo no historico do card; o card nao se move;
- na leitura: `flow_get_card_customer` repete a checagem (condicao que caiu depois do disparo encerra a
  execucao) e devolve `petition` com UF, endereco, nascimento, genero da validacao, acoes ajuizadas e o
  advogado ativo do escritorio do card na UF (`lawyerGap` quando falta: card sem escritorio ou UF sem
  advogado). Analise de acoes e Comentario continuam sem esses dados;
- `flow_get_card_action_analysis`: analise concluida mais recente do card com o `actionId` de cada acao;
  sem analise concluida, `analysis` nulo com a orientacao da secao 4.3;
- contrato do modulo com o limite real de 100 paginas (feito na S1);
- historico do card com os motivos novos; ajuda da regra e aviso da ficha dizendo o que o Flow confere.

Criterios de aceite:

- regra Peticoes iniciais com cliente sem UF ou sem acoes ajuizadas declaradas nao chama a rotina e o card
  mostra o motivo; Analise de acoes nao passa por essa checagem;
- advogado ausente nao bloqueia e chega como `lawyer: null` com o motivo;
- confirmacao revogada ou acao removida nao contam como declaradas;
- leitura da analise pula analise nao concluida mais recente e recusa automacao de outro resultado.

Evidencias (2026-10-28, no container):

- BFF: type-check, lint, build e 729 testes (727 passam, 2 ignorados ja existentes), incluindo cada
  codigo de pre-condicao, UF normalizada, `lawyerGap`, disparo sem chamar a rotina, leitura encerrando a
  execucao, `petition` so em peticoes, tool nova na lista do conector e PostgreSQL real para a analise
  concluida mais recente;
- Web: type-check, lint, 159 testes e `next build`.

## Sprint S4: Motores Do Documento E Do Print

> Status: `concluida` (2026-10-28). Conferencia visual do `.docx` no Word/LibreOffice pendente (peca de
> exemplo entregue ao usuario; o Gotenberg do dev nao subiu, erro de rede antiga do Docker).

Entregaveis (`src/modules/kanban/initial-petitions/document/`, funcoes puras, sem rota nem tool ainda):

- `petition-content.ts`: esquema do conteudo (enderecamento, prioridade de idoso, blocos titulo, topico,
  paragrafo com trechos em negrito/italico e nota de rodape, ementa, tabela, figura; memoria de calculo
  com as duas tabelas da secao 5);
- `petition-validation.ts`: recusas da decisao 6 com mensagens em portugues e local do problema; ementa
  isenta de "—" e "(a)" (Q5); nota com URL http(s) e data de acesso valida e nao futura; ementa exige nota;
  figura so com print recortado; colunas da tabela; peca com topicos; nome
  `Inicial_[JEC|JEF]_[Banco]_[PrimeiroNome].docx` sem acento nem caminho;
- `petition-docx.ts`: montagem com a biblioteca `docx` 9.8.1 (versao fixa, publicada em 2026-09-28):
  A4, margens 3/3/2/2 cm, Bookman Old Style 11, justificado, espacamento simples, recuo de 3 cm; ementa
  com recuo de 4 cm e fonte 10; titulos em negrito com "manter com o proximo"; nota de rodape real em
  Bookman 9 ("Disponivel em: <URL>. Acesso em: 30 set. 2026."); XXXX realcado em amarelo; cabecalho de
  tabela #1F3864 com letra branca e total #D9E2F3; memoria de calculo depois de quebra de pagina;
  figura na largura util com legenda em italico 9. mm convertido com arredondamento (a lib trunca);
- `hiscon-print.ts`: pagina redesenhada do arquivo original em alta resolucao (lado maior 3200 px) na
  mesma orientacao da imagem da rotina (pagina deitada inclusa); recorte e destaque em fracoes;
  sombreado amarelo translucido e moldura vermelha RGB 220,0,0 de 6 px; destaque fora do recorte e
  recusado. `DocumentRasterizerService.renderCanvas` compartilha o desenho da pagina com `render`.

Evidencias (2026-10-28, no container):

- BFF: type-check, lint, build e 740 testes (738 passam, 2 ignorados ja existentes), com o XML do
  `.docx` conferido (pagina, margens, fonte, recuos, realce, notas, cores, quebra, imagem, legenda),
  mesmo conteudo gerando o mesmo `document.xml` (exceto o id interno de desenho), PDF minimo com
  `/Rotate 90` e pixels da moldura e do sombreado;
- `npm audit --omit=dev`: nenhum achado da arvore da `docx`; 16 achados anteriores do BFF viraram tarefa
  separada.

## Sprint S5: Modo Flow Ponta A Ponta

> Status: `concluida` (2026-10-28). Smoke com a rotina real pendente: colar o prompt, reconectar o
> conector e rodar num card com ficha completa. Depende tambem do S0 (WebFetch, Q10).

Entregaveis:

- migration 103 (prints, rascunhos, execucao com relatorio, peticoes, vinculo peticao x acao, julgados e
  origem `routine_petition` em `kanban_card_generated_documents`) e 104 (scope `flow:petition:approve`);
- tools do conector:
  - `flow_create_hiscon_print`: recorte do HISCON da regra, devolvido em imagem para a rotina conferir;
  - `flow_submit_initial_petition`: uma peticao por chamada, conferida (esquema, recusas da S4, acoes da
    analise, acao em duas pecas, nome repetido) e montada para achar erro cedo; reenvio com a mesma chave
    substitui; regra com gerador IA responde `generator_is_ai`;
  - `flow_finish_initial_petitions`: relatorio estruturado; com analise, cada acao numa peca ou com motivo;
    monta e sobe os .docx, grava tudo e encerra a execucao numa transacao; move o card com ao menos uma
    peticao; execucao encerrada remove os arquivos;
- peticao como documento do card em rascunho; aprovacao com `flow:petition:approve` ou `flow:admin` pede o
  PDF e libera o Drive (nome da peticao na pasta do cliente do escritorio);
- painel "Peticoes iniciais" no card (pecas, Baixar, Aprovar, relatorio) e vinculo na secao "Acoes
  identificadas";
- prompt `docs/product/flow-initial-petitions-routine-prompt.md` (versao Flow);
- scheduler descarta rascunhos e prints de execucao expirada.

UIUX Decision (ui-ux.md):

- `scenario_classification: covered_by_template`: secao no modal do card no padrao de
  `CardActionAnalysisPanel` (titulo `h6` com contagem, linha de contexto, alerta para nao concluida,
  lista em cartoes pequenos); acoes Baixar/Aprovar como botoes `sm outline`; aprovacao com
  `ConfirmActionModal`. Relatorio em listas curtas, so os itens com conteudo. Sem menu novo.
- Aviso do painel herdado do passo 6 do "COMO USAR" do escritorio (revisar ementas e XXXX).

Criterios de aceite:

- peticao com travessao fora da ementa, acao fora da analise, acao em duas pecas ou nome repetido e
  recusada sem gravar;
- fechamento sem relatorio, sem peticao ou com acao sem peca e sem motivo e recusado sem gravar;
- fechamento aceito grava rascunhos, encerra a execucao e move o card; segundo fechamento e recusado;
- aprovacao so com a permissao; documento aprovado pede o PDF; Drive com o nome da peticao;
- documento de peticao nao aceita dado de lead (CHECK) e as consultas do lead nao enxergam peticoes.

Evidencias (2026-10-28, no container):

- migrations 103 e 104 aplicadas no dev (scope concedido a quem tem `flow:admin`);
- BFF: type-check, lint, build e 746 testes (744 passam, 2 ignorados ja existentes), com PostgreSQL real
  para o fechamento completo, segundo fechamento, aprovacao com PDF pendente, CHECK de origem e descarte
  de rascunho; servico com recusas e remocao dos arquivos; tools pelo esquema MCP; nome no Drive;
  allowlist de visibilidade de card atualizada;
- Web: type-check, lint, 162 testes e `next build`.

Debitos:

- versao editada pelo advogado (upload do .docx revisado) para peticao: nao entrou; o fluxo do lead
  (`uploaded_edit`) continua so para documentos de lead;
- as rotas novas nao foram exercitadas no BFF em execucao: o dev hoje roda o codigo do checkout
  principal.

## Sprint S6: Modo IA

> Status: `pendente` (depende do S0 e da S5).

- Envio do `.docx` gerado pela rotina pelo mecanismo escolhido no S0; o Flow confere tipo, tamanho,
  nome e a seguranca do pacote (macro, OLE, vinculo externo, zip-bomb), nao o conteudo.
- Print no modo IA pelo mesmo mecanismo ou limitacao registrada; versao IA do prompt.

## Revisao Da Unificacao (2026-10-28)

Decisao do usuario: manter tudo do worktree `flow-office-contract` (gatilho customizavel `ai_completed`,
acao `move_card`, acoes manuais por coluna) e revisar estas sprints (`docs/product/flow-branch-unification.md`;
ADR 020, decisao 14).

- S1: "Resultado esperado" continua e define quem conclui; comentario nunca conclui; `comment` conclui pela
  confirmacao explicita (`flow_complete_automation`, que recusa `action_analysis` e `initial_petitions` com
  `wrong_completion_tool`). O modal perdeu "Depois da execucao" e ganhou o gatilho "Quando a IA concluir a
  automacao sem erro" com "Ir para a coluna". Agente de chave de API novo usa `toolPolicyVersion =
  2026-10-21.v1` (com `kanban.automation.complete`).
- S5: `flow_finish_initial_petitions` grava `ai.automation_completed` quando ha ao menos uma peticao; o card
  anda pela regra de movimento. `kanban_card_petition_runs.completed` substituiu `move_outcome`.

Evidencias (2026-10-28, no container): BFF 787 testes (2 ignorados ja existentes), lint e type-check;
Web 170 testes, lint e type-check; AI Gateway 46 testes, lint e build; migrations 100, 103 e 105
aplicadas no dev (105 idempotente).

## Sprint S7: Fecho E Assinatura Montados Pelo Flow

> Status: `concluida` (2026-10-29). Smoke com a rotina real pendente: a rotina precisa parar de escrever o
> fecho (o envio com fecho e recusado com a orientacao) e o escritorio precisa de cidade/UF e da OAB no
> usuario responsavel.

Entregaveis:

- Cadastro do usuario do Flow (`/flow/usuarios`, botao "Advogado" por usuario): nome para assinatura e
  OABs (numero e UF, uma por UF). So `flow:admin`. Tabelas `kanban_user_lawyer_profiles` e
  `kanban_user_oabs` (migration 110); auditoria sem nome nem numero.
- Escritorio: cidade e UF (opcionais) no cadastro de `/flow/escritorios`.
- Escritorios -> Advogados sai (aba, rotas e servico); `kanban_office_lawyers` fica como historico.
- Quem assina: entre os responsaveis do card com OAB na UF da acao, o responsavel pelo escritorio do
  card, depois o `board_admin`, depois os demais; empate pelo mais antigo no card.
- Fecho no `.docx`, depois do corpo e antes da memoria de calculo, alinhado a esquerda e sem recuo:
  "Nesses termos," / "pede deferimento." / "Cidade/UF, 29 de outubro de 2026." / **Nome** (como cadastrado) /
  "OAB/UF nº 12345". Dado ausente sai `XXXX` realcado.
- Envio da rotina com o fecho ("Nesses termos", "pede deferimento" ou "OAB/") e recusado com orientacao;
  o conector entrega `petition.signer` (quem assina) e `petition.closingGaps` so para o relatorio.
- Execucao de peticoes guarda as pendencias do fecho (`closing_gaps`) e o card mostra o aviso.

Criterios de aceite:

- responsavel pelo escritorio com OAB na UF assina antes do `board_admin`, que assina antes dos demais;
- responsavel sem OAB na UF da acao e pulado; ninguem com OAB na UF sai `XXXX` com a pendencia;
- escritorio sem cidade sai `XXXX/XXXX` no local;
- data por extenso da geracao no fuso de Sao Paulo;
- OAB repetida na mesma UF do mesmo usuario e recusada; numero fora do padrao e recusado.

UIUX Decision (ui-ux.md):

- `scenario_classification: covered_by_template`. Usuarios: botao "Advogado" e coluna "OAB" na tabela do
  `ModuleUserManager`, so no Flow e so para `flow:admin` (sem a permissao, a coluna e o botao nao
  aparecem). Modal sem steps no padrao `platform-crud-ui` (nome para assinatura e linhas UF + numero com
  adicionar/remover). Escritorios: cidade e UF no modal existente e coluna "Cidade" na lista; aba
  "Advogados" removida. Sem item de menu novo.

Evidencias (2026-10-29, no container): migration 110 aplicada duas vezes no banco de dev (idempotente);
PostgreSQL real para a hierarquia (responsavel do escritorio > `board_admin` > demais, responsavel sem
OAB na UF pulado, outro tenant), cadastro substituido e removido, resumo por UF; fecho no `.docx` antes
da memoria de calculo com `XXXX` realcado; envio com fecho recusado.

## Sprint S8: Versao Corrigida Da Peticao

> Status: `concluida` (2026-10-29). Smoke no app com uma peticao real pendente (envio da corrigida e
> substituicao do arquivo no Drive ligado).

Entregaveis:

- `POST .../initial-petitions/documents/:documentId/corrected-version` (multipart, `.docx` ate 10 MB),
  com `flow:petition:approve` ou `flow:admin`; conferencia de seguranca de `inspectEditedDocx`.
- So sobre a versao atual da peticao; peticao com protocolo (`protocoled_at`) responde 409
  `petition_protocoled`.
- Versao corrigida: origem `uploaded_edit`, `based_on_document_id` da anterior, `rascunho` (pendente de
  aprovacao); a anterior vira `substituido`.
- Aprovada, o Drive atualiza o mesmo arquivo da peticao (o gatilho herda o `remote_file_id` da versao
  sincronizada anterior; o nome segue o da peticao, sem sufixo de versao).
- Card: botao "Enviar corrigida" em cada peticao sem protocolo, versao exibida quando maior que 1;
  historico do card registra a troca.
- Colunas `protocol_number` e `protocoled_at` na peticao, para a futura automacao de protocolo.

Criterios de aceite:

- corrigida sobre versao antiga, sobre peticao com protocolo ou sem permissao e recusada;
- arquivo com macro ou que nao e `.docx` e recusado sem gravar;
- aprovar a corrigida enfileira o Drive com o `remote_file_id` da versao anterior.

UIUX Decision (ui-ux.md):

- `scenario_classification: covered_by_template`. Botao "Enviar corrigida" na linha da peticao, ao lado
  de Aprovar, com o modal da versao editada do lead (`LeadDocumentUploadModal`) como referencia:
  `CorrectedPetitionModal` com aviso do que acontece (volta a pendente; aprovada, substitui no Drive).

Evidencias (2026-10-29, no container): PostgreSQL real para corrigida sobre aprovada (v2 `rascunho`,
anterior `substituido`), versao antiga e documento inexistente recusados, aprovar a v2 enfileira o Drive
com o `remote_file_id` da v1, protocolo trava a correcao. BFF: type-check, lint, build e 831 testes
(829 passam, 2 ignorados ja existentes). Web: type-check, lint (sem erro; avisos ja existentes), 176
testes e `next build`. `make ai-check` aprovado (API graph 0 erro; architecture graph 0 achado).

## Debitos Conhecidos

- Nome do banco na analise e texto livre: o Flow nao confere se uma peticao junta bancos diferentes;
  fica no relatorio e na revisao do advogado.
- Fonte Bookman Old Style e referenciada, nao embutida; o PDF do Gotenberg pode substituir a fonte.
