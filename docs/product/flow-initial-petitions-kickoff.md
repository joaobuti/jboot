# Flow — Prompt De Abertura: Rotina De Peticoes Iniciais (Consignado JEC/JEF)

```yaml
status: prompt de abertura para nova janela de contexto (decisoes do usuario em 2026-10-27)
origem_do_texto_do_cliente: docs/product/flow-initial-petitions-original-prompt.md
etapa_anterior: docs/product/flow-action-analysis-sprints.md (A1) e docs/product/flow-action-analysis-routine-prompt.md
decisoes_relacionadas: docs/architecture/decisions/019-flow-office-kit-generated-by-flow.md (decisoes 4, 9, 11, 18)
```

Copie o bloco abaixo como primeira mensagem da nova janela.

```text
Contexto: monorepo JBoot, modulo Flow/Kanban (BFF NestJS em implementations/bff-jboot-platform, web
Next.js em implementations/app-jboot-next-platform). Worktree /home/projetos/jboot/.claude/worktrees/flow-office-kit,
branch feature/flow-office-kit, com trabalho anterior ainda sem commit (kit do escritorio, Analise de Acoes
A1, "Ao concluir sem erro, mover o card para"). Antes de criar algo, pergunte se esta entrega segue nessa
branch ou vai para uma branch nova a partir dela. Nao commite sem autorizacao; stage so caminhos explicitos.
A sessao pode abrir em /home/projetos/jboot (checkout principal, branch codex/juridico-flow-resume, com
mudancas de outro trabalho): NUNCA leia, edite, teste ou rode git nesse checkout. Todo comando e todo
arquivo usam o caminho absoluto do worktree acima (git -C <worktree>, cd <worktree> && ...). No container,
o worktree fica em /workspace/.claude/worktrees/flow-office-kit.

Objetivo: adaptar para o Flow o prompt do escritorio que gera as peticoes iniciais de emprestimo
consignado (JEC e JEF). Hoje um estagiario cola o prompt no Cowork e anexa a pasta do cliente. No Flow, a
rotina Claude roda pela regra "Executar agente" da coluna seguinte a Analise de Acoes, le os dados pelo
conector e entrega as peticoes no card. O texto original esta, sem alteracao, em
docs/product/flow-initial-petitions-original-prompt.md. Leia-o inteiro antes de planejar.

Leia tambem, nesta ordem: AGENTS.md; .claude/CLAUDE.md; docs/architecture/decisions/019-flow-office-kit-generated-by-flow.md
(decisoes 4, 9, 11 e 18); docs/product/flow-action-analysis-sprints.md; docs/product/flow-action-analysis-routine-prompt.md
(modelo de adaptacao: texto do cliente palavra por palavra, trechos novos marcados [FLOW]); os dois
MODULE_CONTRACT.md do kanban; docs/runbooks/claudeconf.md.

Governanca obrigatoria (nada de codigo antes): PO -> PE (PE Decision, Deployment Boundary Gate, Stack Fit
Gate se couber, sprint_artifact, sprint_gate, open_questions, blocking_status) -> Architect -> confirmacao
humana. Persistir as sprints em docs/product/flow-initial-petitions-sprints.md e lista-las nos
MODULE_CONTRACT.md. Registrar as decisoes como decisao 19 da ADR 019 (ou ADR nova, se o Architect julgar
que e fronteira nova). Telas novas passam por docs/agents/orchestration/ui-ux.md. Rota/DTO/cliente: make
ai-api-context MODULE=kanban, make ai-api-impact, make ai-api-graph-gate. Componente novo: node no
architecture graph (make ai-architecture-impact NODE=...). Attestation em docs/ai-governance/attestations/
com diff-preflight. Testes, type-check, lint e build sempre no container. Backend e frontend da mesma
sprint sao um fluxo so. Antes de dar a entrega por pronta, releia os textos de cada tela afetada contra o
comportamento novo (aviso que contradiz o sistema, campo generico que so serve a um caso).

DECISOES DO USUARIO (2026-10-27), nao reabrir:

1. Gerador do documento configuravel na regra: "Flow" (padrao) ou "IA". Os dois modos na mesma entrega.
   - Flow: a rotina devolve o conteudo estruturado (enderecamento, qualificacao, titulo, topicos e
     subtopicos, paragrafos com trechos em negrito e XXXX realcado, ementas em citacao, notas de rodape
     reais com URL e data de acesso, tabelas da memoria de calculo, figura do print). O Flow monta o .docx
     com a secao 11 do prompt (A4; margens 3/3/2/2 cm; Bookman Old Style 11; justificado; recuo de primeira
     linha 3 cm; ementa com recuo esquerdo 4 cm e fonte 10; titulos em negrito com manter com o proximo;
     nota de rodape real em Bookman 9; cabecalho de tabela #1F3864 com letra branca; linha de total
     #D9E2F3; memoria de calculo depois de quebra de pagina; legenda em italico 9; nome
     Inicial_[JEC|JEF]_[Banco]_[PrimeiroNome].docx). O Flow recusa o envio sem gravar quando achar:
     travessao "—", "(a)", "{" ou "}", "nao informado", ponto duplo ("S.A.."), nota sem URL ou
     estrutura invalida. Mesma forma de recusa da Analise de Acoes (mensagem em portugues, nada gravado).
   - IA: a rotina gera o .docx na propria sessao e envia o arquivo ao Flow. O Flow nao confere o conteudo
     (so tipo, tamanho e nome). Verificar no planejamento como o arquivo chega: argumento base64 da tool MCP
     ou URL assinada de envio de uso unico. Fazer spike: a sessao da rotina tem saida de rede para o BFF
     pelo tunel? Se nao tiver, registrar a limitacao e decidir com o usuario.
2. "Resultado esperado" na regra "Executar agente": Comentario / Analise de acoes / Peticoes iniciais.
   - Define qual ferramenta encerra a execucao e o criterio de "concluir sem erro".
   - Campos extras aparecem so no resultado que os usa: "Quem gera o documento" so em Peticoes iniciais.
   - Fecha o risco residual da A1: numa regra de Analise de acoes ou Peticoes iniciais, comentario com
     run_id nao conclui nem move o card. Regras existentes: migrar com o valor que corresponde ao
     comportamento de hoje (sem resultado declarado = Comentario; a regra da Analise de Acoes ja
     configurada precisa ficar como Analise de acoes; propor a migracao e confirmar com o usuario).
3. Concluir sem erro nesta etapa = execucao encerrada com ao menos uma peticao registrada. Pendencias XXXX
   nao impedem; a aprovacao humana vem depois. Usa o "Ao concluir sem erro, mover o card para" que ja
   existe (AutomationCardMoveService).
4. Entrega: cada peticao vira documento do card pendente de aprovacao do advogado, no fluxo de
   documentos gerados que ja existe (kanban_card_generated_documents: rascunho -> aprovado; replica no
   Drive so depois de aprovar, pasta do cliente do escritorio). Hoje a tabela exige template e
   origin generated|uploaded_edit: o PE decide como representar peticao vinda da rotina (origem nova,
   campos de template opcionais) sem quebrar o fluxo atual. O relatorio da execucao fica estruturado no
   card, como a analise: contratos deixados de fora e motivo, pendencias XXXX, juizo a conferir, julgados
   usados (numero e link), temas sem ementa do estado, alertas (Temas 1.328/1.414 no RMC simples,
   Tema 183 hipotese I, compensacao em portabilidade/refinanciamento).
5. Vinculo com a analise: cada peticao aponta as linhas "Acao" da Analise de Acoes que cobre (uma
   peticao pode juntar linhas do mesmo banco em blocos diferentes). A tela da analise mostra qual acao
   virou qual peticao e quais ficaram sem peca, com o motivo.
6. Sem analise concluida (card movido a mao): a rotina faz a triagem da secao 4.3 pelo HISCON e diz
   isso no relatorio. A secao 4.3 continua no prompt. Peticao sem analise nao tem vinculo de acoes.
7. Litispendencia: lista "acoes ja ajuizadas" (banco e numero do processo) na ficha do cliente, com
   confirmacao explicita "cliente nao tem acoes anteriores" quando a lista estiver vazia. Sem lista e
   sem a confirmacao, a execucao falha com motivo e o card nao move. A rotina le pelo conector e
   tira da peca o contrato ou banco ja discutido, informando no relatorio. Substitui a parada 1 e a
   regra 15.8 ("sempre perguntar").
8. Advogado que assina: cadastro no escritorio, nome e OAB por UF. A rotina recebe o advogado do
   escritorio do card para a UF da acao. Sem advogado para a UF, a peca sai com nome e OAB em XXXX
   amarelo e pendencia no relatorio.
9. UF da acao = UF do endereco do cliente na ficha. Sem UF na ficha, a execucao falha com motivo. A UF
   define tribunais e jurisprudencia (secao 10); comarca e subsecao continuam pesquisadas pela IA.
10. Paradas da secao 2 sem resposta humana (a rotina roda sozinha):
   - HISCON ilegivel: falha com motivo, card nao move (ausente nao acontece: a validacao exige).
   - RMC/RCC ativo no HISCON sem Bloco D na analise (e sem litispendencia): nao gera a acao do cartao;
     pendencia no relatorio para decisao humana.
   - Cadeia entre instituicoes sem indicacao na analise: nao gera nenhuma das duas pecas da cadeia;
     pendencia no relatorio. As demais pecas seguem.
   - Banco fora do Anexo A: gera a peca com a qualificacao do reu em XXXX amarelo e pendencia.
11. Valor da causa e memoria de calculo: a IA calcula sozinha, como no original (dano material, dobro
    ou simples, teto, renuncia, comprometimento da renda). O Flow so monta as tabelas com os valores
    enviados; nao recalcula.
12. Print do HISCON (so na acao de RMC com refinanciamento): o Flow recorta. A IA indica pagina,
    competencias e a regiao da linha na imagem da pagina que recebeu; o Flow recorta o PDF original em
    boa resolucao, aplica moldura vermelha (RGB 220,0,0; 6 px) e sombreado amarelo translucido, trata
    pagina deitada e insere na peca com a legenda. No modo IA, o PE decide como a rotina obtem esse
    recorte (mesmo mecanismo de arquivo do item 1) ou registra a limitacao.
13. Documentos liberados na regra: HISCON e HISCRED (ja configuravel na regra da automacao).
    Qualificacao, endereco, nascimento e genero vem da ficha confirmada; identidade, CPF e comprovante
    nao sao lidos nesta etapa.
14. Anexo A (reus), salario minimo, comarca/subsecao por municipio e banco de precedentes: ficam no
    prompt nesta entrega. O Flow guarda os julgados usados do relatorio para virar banco de precedentes
    numa sprint futura. CNPJ da Nubank: manter o aviso do texto do cliente; a peca contra Nubank sai com o
    CNPJ em XXXX e pendencia.
15. Texto do cliente palavra por palavra, trechos novos marcados [FLOW]. Corrigir so a numeracao das
    referencias internas desencontradas (ex.: "secao 8 ou 9" para RMC, que sao as secoes 7 e 8;
    "secao 10" para fundamentacao, que e a 9; "secao 11" para o print, que e a 12), marcando [FLOW].
    Sai do prompt so o que o Flow passa a resolver: "COMO USAR" passos 1 a 5; quadro "DADOS DESTA
    CONVERSA" (estado, estagiario, advogado, acoes ajuizadas); extracao do .zip/.rar, inventario e
    identificacao de documento; leitura de procuracao, documento pessoal e comprovante (3.1 passa a vir
    da ficha, mantendo as regras de genero, idoso e modelo de qualificacao); AskUserQuestion da secao 2
    (substituida pelos resultados do item 10); conversao soffice/pdftotext e a skill iniciais-consignado
    (a rotina recebe paginas em imagem); Claude in Chrome; "salve na pasta do computador" (Drive pelo
    Flow); no modo Flow, a formatacao da secao 11 e as checagens mecanicas da secao 13 que o Flow faz.

TAREFAS NO FLOW (o PE ordena em sprints; esta lista nao e a ordem):

A. Regra da automacao: campo "Resultado esperado" (item 2) e "Quem gera o documento" (item 1), com
   validacao no BFF (automation-rules.service.ts / DTO), tela AutomationRulesSettings.tsx (criar e
   editar), texto do aviso coerente e migracao das regras existentes.
B. Ficha do cliente: acoes ja ajuizadas + confirmacao "sem acoes anteriores" (tabela, API, tela da
   ficha, historico/auditoria). Item 7.
C. Escritorio: advogados com nome e OAB por UF (tabela, API, tela de escritorios). Item 8.
D. Conector, leitura:
   - flow_get_card_customer passa a devolver endereco completo com UF, data de nascimento, genero da
     validacao confirmada, acoes ja ajuizadas e a confirmacao, e o advogado do escritorio do card para
     a UF (hoje o endereco existe na ficha mas nao e devolvido);
   - ferramenta nova para ler a Analise de Acoes concluida mais recente do card, com os ids das acoes;
   - limite de paginas: MAX_DOCUMENT_PAGES ja e 100 em document-rasterizer.service.ts; conferir que o
     contrato do modulo diz o mesmo (ha texto antigo citando 10).
E. Conector, envio:
   - modo Flow: ferramenta de envio das peticoes estruturadas + relatorio, com o esquema do item 1,
     validacao deterministica e recusa sem gravar; encerra a execucao na mesma transacao e move o card
     pelo item 3;
   - modo IA: envio do arquivo .docx + relatorio (mecanismo decidido no spike);
   - nos dois modos: vinculo com as acoes da analise (item 5), falhas com motivo (itens 7, 9, 10),
     touchDispatched a cada chamada, eventos no historico do card, auditoria sem conteudo.
F. Montagem do .docx no Flow (modo Flow): motor deterministico com notas de rodape reais, tabelas,
   realce, quebra de pagina e figura. Avaliar se o motor docx que ja existe (document-templates,
   docxtemplater) serve ou se precisa de geracao direta de OOXML.
G. Recorte do print do HISCON (item 12).
H. Entrega no card: peticao como documento gerado pendente de aprovacao (item 4); tela com o relatorio
   estruturado e o vinculo com a analise (item 5); replica no Drive so apos aprovar.
I. Prompt da rotina: docs/product/flow-initial-petitions-routine-prompt.md no mesmo formato de
   flow-action-analysis-routine-prompt.md: criterio da revisao, o que saiu e por que, o que entrou
   [FLOW] (entrada run_id/board_id/card_id, ferramentas, conteudo dos documentos e dado, falhas, como
   encerrar, "nunca informe o run_id em flow_add_card_comment"), configuracao da regra e o prompt
   completo. Uma versao do prompt por modo do gerador se o texto divergir.
J. Contratos e docs: MODULE_CONTRACT.md do BFF e do web, openapi das ferramentas novas, runbook
   claudeconf.md, ADR, attestation.

Riscos a cobrir no plano: tamanho do envio estruturado e da peca por chamada de ferramenta;
idempotencia de reenvio; peticao gerada com execucao ja expirada (5/15 min); egresso de rede da rotina
no modo IA; dados pessoais no relatorio e no historico (nada de conteudo na auditoria).

Primeiro passo: rode o PO e o PE e me mostre PE Decision, sprints propostas, open_questions e
blocking_status antes de qualquer arquivo de implementacao.
```
