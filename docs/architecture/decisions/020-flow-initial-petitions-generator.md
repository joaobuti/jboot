# ADR 020: Peticoes Iniciais Da Rotina Com Gerador Configuravel (Flow Ou IA)

```yaml
date: 2026-10-28
status: accepted
decision_owner: human
human_confirmation: approved
confirmed_at: 2026-10-28
project: implementations/bff-jboot-platform
modules: [modules/kanban]
consumer: implementations/app-jboot-next-platform/modules/kanban
deployment_boundary: embedded_module
stack_decision: inherited_from_host
sprint_artifact: docs/product/flow-initial-petitions-sprints.md
supersedes_partially: docs/architecture/decisions/019-flow-office-kit-generated-by-flow.md (decisao 4, so para peticoes iniciais)
relates_to:
  - docs/architecture/decisions/019-flow-office-kit-generated-by-flow.md (decisoes 9, 11, 17 e 18)
  - docs/product/flow-action-analysis-sprints.md
  - docs/product/flow-initial-petitions-original-prompt.md
  - docs/product/flow-initial-petitions-kickoff.md
```

## Contexto

O escritorio gera as peticoes iniciais de consignado (JEC e JEF) colando um prompt no Cowork e anexando
a pasta do cliente. No Flow, a Analise de Acoes (ADR 019, decisao 18) ja registra no card as acoes
possiveis e move o card. A etapa seguinte e a rotina que redige as peticoes.

A ADR 019, decisao 4, descartou a geracao de documento pela IA para o kit do escritorio: a IA podia
alterar clausulas sem que ninguem percebesse e precisaria enviar arquivo pelo conector. Na peticao o
texto nao e fixo: a IA redige fatos, direito, pedidos, calculos e pesquisa jurisprudencia. O usuario
decidiu (2026-10-27) oferecer os dois geradores na regra.

## Fronteira Nova

- **Arquivo vindo da IA para o Flow** (modo IA). Ate aqui o conector so recebia dado estruturado. O
  `.docx` da rotina e dado nao confiavel: o Flow confere tipo, tamanho, nome e a seguranca do pacote
  (mesmos limites e a mesma recusa de macro, OLE, vinculo externo e zip-bomb da versao editada,
  `inspectEditedDocx`); nao confere o conteudo juridico. A revisao do advogado e a fronteira.
- **Documento juridico montado pelo Flow a partir de conteudo da IA** (modo Flow). O texto e da IA; a
  formatacao, as notas de rodape, as tabelas e o print sao do Flow, deterministicos.

## Decisoes Do Usuario (2026-10-27, Kickoff, Itens 1 A 15)

Registradas no kickoff e resumidas aqui; nao se reabrem.

1. Gerador na regra: `flow` (padrao) ou `ai`, os dois na mesma entrega.
2. "Resultado esperado" na regra "Executar agente": Comentario, Analise de acoes ou Peticoes
   iniciais. Define a ferramenta que encerra a execucao e o que e concluir sem erro.
3. Concluir sem erro em Peticoes iniciais: execucao encerrada com ao menos uma peticao registrada.
4. Cada peticao e documento do card pendente de aprovacao; Drive so depois de aprovar.
5. Peticao aponta as acoes da Analise de Acoes que cobre; a tela da analise mostra o vinculo.
6. Sem analise concluida, a rotina faz a triagem da secao 4.3 e diz isso no relatorio.
7. Litispendencia pela lista de acoes ja ajuizadas da ficha, com confirmacao "sem acoes anteriores".
   Revisao do usuario (2026-10-29): a confirmacao vem marcada por padrao quando o cliente entra no Flow
   (cadastro com escritorio ou vinculo ao card), com origem `default`; incluir acao ou desmarcar a desfaz,
   como a manual. Risco aceito: cliente com acao anterior nao informada passa pela pre-condicao; a
   conferencia de litispendencia fica no prompt da rotina e na revisao do advogado antes de protocolar.
8. Advogado que assina cadastrado por escritorio e UF; sem advogado na UF, XXXX e pendencia.
   (Substituida pela emenda de 2026-10-29, decisao 18.)
9. UF da acao e a UF do endereco da ficha; sem UF a execucao falha.
10. Paradas da secao 2 resolvidas sem pergunta (falha, pendencia ou XXXX).
11. Valor da causa calculado pela IA; o Flow nao recalcula.
12. Print do HISCON recortado pelo Flow a partir da regiao indicada pela IA.
13. Documentos da regra: HISCON e HISCRED; qualificacao vem da ficha confirmada.
14. Anexo A, salario minimo, comarcas e precedentes ficam no prompt; o Flow guarda os julgados usados.
15. Texto do cliente palavra por palavra, trechos novos marcados `[FLOW]`.

## Decisoes Do PE E Do Architect (Confirmadas Pelo Usuario Em 2026-10-28)

1. **Registro em ADR nova** (Q1): o modo IA substitui em parte a decisao 4 da ADR 019, so para
   peticoes iniciais. O kit do escritorio continua gerado pelo Flow.
2. **Resultado esperado em `actionConfig.expectedResult`**: `comment`, `action_analysis` ou
   `initial_petitions`. `actionConfig.documentGenerator` (`flow` | `ai`) existe so em
   `initial_petitions`. A configuracao e copiada para a execucao no disparo, como o destino do card.
   - Comentario com `run_id` conclui so em `comment`. Nas outras, o comentario e gravado e a execucao
     segue aberta ate a ferramenta propria. Fecha o risco residual da A1.
   - Execucao ja disparada sem `expectedResult` segue como antes (comentario ou Analise de Acoes).
3. **Migracao das regras** (Q8): regra que ja gravou Analise de Acoes vira `action_analysis`; as demais
   `execute_ai_agent` viram `comment`. A lista do banco e conferida com o usuario antes de aplicar.
4. **Envio do modo Flow em duas ferramentas** (Q3): `flow_submit_initial_petition` (uma peticao por
   chamada, provisoria, recusada sem gravar; reenvio com a mesma chave substitui) e
   `flow_finish_initial_petitions` (relatorio; promove as provisorias a documento, encerra a execucao e
   move o card na mesma transacao). Motivo: varias peticoes numa chamada passam do limite de saida do
   modelo. Execucao expirada descarta as provisorias.
5. **Prazo de Peticoes iniciais** (Q4): 5 min para chegar ao Flow, 30 min sem chamada, 3 h no total
   (`routine_time_limit`). Comentario e Analise de acoes mantem 5/15 min.
6. **Recusas deterministicas** (Q5): "—", "(a)", "{", "}", "nao informado", ponto duplo, nota sem URL e
   estrutura invalida. A ementa (bloco de citacao) fica isenta de "—" e "(a)", porque a regra 10.1.2
   exige o texto literal; "(...)" nao conta como ponto duplo. A nota de rodape e montada pelo Flow a
   partir de URL e data de acesso.
7. **Pre-condicoes no disparo**: sem UF na ficha, ou sem acoes ajuizadas e sem a confirmacao, o Flow
   falha a execucao antes de chamar a rotina (nao gasta a assinatura Claude) e repete a checagem na
   leitura.
8. **Persistencia**: `kanban_card_generated_documents` ganha a origem `routine_petition` (lead e
   modelo opcionais por CHECK de origem; versao contada por peticao) para herdar aprovacao, PDF, versao
   editada e o gatilho do Drive. Tabelas proprias para a execucao com relatorio, a peticao, o vinculo
   peticao x acao e os julgados usados. Nome no Drive: o nome da peticao.
9. **Acoes ajuizadas e advogados no banco do Flow**, junto da validacao e dos documentos do cliente, sem
   transacao entre bancos. No maximo um advogado ativo por escritorio e UF (Q6).
10. **Aprovacao** (Q7): scope novo `flow:petition:approve`; `flow:admin` tambem aprova.
11. **Completude da analise**: com analise concluida, o fechamento recusa se uma acao nao estiver ligada
    a uma peticao nem tiver motivo no relatorio. O banco (texto livre) nao e conferido pelo Flow.
12. **Motores no host**: biblioteca `docx` (MIT) para montar o `.docx`; recorte com `pdfjs-dist` e
    `@napi-rs/canvas`, ja no projeto.

13. **Print so no RMC com refinanciamento** (decisao do usuario, 2026-10-28). O texto do escritorio se
    contradiz: a secao 8 (RMC sem refinanciamento) pede o print da linha do cartao e a secao 12 restringe
    o print ao RMC com refinanciamento. Prevalece a secao 12: no RMC simples a linha do cartao vai em
    texto. Registrado em `[FLOW]` na secao 8 do prompt.

14. **Unificacao com a conclusao explicita da IA** (decisao do usuario, 2026-10-28;
    `docs/product/flow-branch-unification.md`). Prevalece o desenho de `docs/product/flow-ai-completion-sprints.md`:
    - o movimento e uma regra propria `ai_completed -> move_card`, com gatilho customizavel; sai o
      "Ao concluir sem erro, mover o card para" da regra do agente (decisao 2 e item 3 do usuario passam a
      valer pela regra de movimento; migration 105 converte o destino existente);
    - comentario nunca conclui; `comment` conclui pela confirmacao explicita (`flow_complete_automation`,
      `kanban.automation.complete`); Analise de acoes e Peticoes iniciais concluem pela ferramenta propria,
      que grava `ai.automation_completed` na mesma transacao quando ha ao menos uma acao ou peticao;
    - `move_outcome` saiu da analise e da execucao de peticoes; a execucao de peticoes guarda `completed`.

## Emenda De 2026-10-29: Fecho Pelo Flow E Versao Corrigida

Decisoes do usuario em 2026-10-29 (`docs/product/flow-initial-petitions-sprints.md`, S7 e S8). A decisao
8 (advogado por escritorio e UF) e a decisao 9, na parte dos advogados, deixam de valer.

15. **Fecho montado pelo Flow.** "Nesses termos," / "pede deferimento." / local e data / nome do advogado
    em negrito / "OAB/UF nº" saem do Flow, nao da IA. A rotina nao escreve o fecho: o envio que o traz e
    recusado com orientacao. Motivo: o dado esta no Flow e o texto e fixo; a IA so acertava quando
    copiava o dado certo.
16. **Data do fecho e a da geracao**, por extenso, no fuso de Sao Paulo. A peticao pode ser protocolada
    dias depois; a correcao vai pela versao corrigida (decisao 20).
17. **Local do fecho e a cidade/UF do escritorio do card**, campo novo do escritorio. Sem escritorio ou
    sem cidade, sai `XXXX` realcado e a pendencia vai para a execucao.
18. **Quem assina e um responsavel do card com OAB na UF da acao.** A OAB fica no cadastro do usuario do
    Flow (nome para assinatura e uma OAB por UF: principal e suplementares). Entre os responsaveis com
    OAB na UF, vale a hierarquia: responsavel pelo escritorio do card, depois `board_admin` do board,
    depois os demais; empate, qualquer um (o Flow usa o mais antigo no card, para ser deterministico).
    Sem ninguem, nome e OAB saem `XXXX` e a pendencia vai para a execucao.
19. **Escritorios -> Advogados sai.** Os registros nao tem vinculo com usuario e nao sao migrados; a
    tabela `kanban_office_lawyers` fica como historico, sem leitura nem escrita.
20. **Versao corrigida da peticao.** Quem aprova peticao (`flow:petition:approve` ou `flow:admin`) envia
    o `.docx` corrigido a qualquer momento ate a peticao ter protocolo. A versao corrigida
    (`uploaded_edit`) passa a ser a atual e volta a pendente de aprovacao; a anterior fica `substituido`
    no historico. Aprovada, substitui o arquivo da peticao no Drive (mesmo arquivo, nova revisao do
    Drive). O arquivo passa pela mesma conferencia de seguranca da versao editada (`inspectEditedDocx`).
21. **Protocolo trava a correcao.** A peticao ganha `protocol_number` e `protocoled_at`, preenchidos pela
    futura automacao de protocolo; com protocolo, a versao corrigida e recusada. Ate a automacao existir,
    nada trava.

## Em Aberto

- Q9 (modo IA sem saida de rede da rotina) e Q10 (rotina sem WebFetch para abrir o acordao): decididas
  depois do spike S0 de `docs/product/flow-initial-petitions-sprints.md`.

## Consequencias

- A IA continua sem mover card e sem aprovar documento.
- No modo IA a revisao do advogado e a unica conferencia do texto; o Flow so garante que o arquivo e um
  Word seguro.
- Auditoria e historico guardam ids, contagens e resultados, nunca o texto das peticoes nem dados
  pessoais do relatorio.
