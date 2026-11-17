# ADR 019: Kit Do Escritorio Gerado Pelo Flow A Partir Dos Valores Extraidos Pela IA

```yaml
date: 2026-10-22
status: accepted
decision_owner: human
human_confirmation: approved
confirmed_at: 2026-10-22
project: implementations/bff-jboot-platform
modules: [modules/kanban]
consumer: implementations/app-jboot-next-platform/modules/kanban
deployment_boundary: embedded_module
stack_decision: inherited_from_host
sprint_artifact: docs/product/flow-office-service-contract-sprints.md
supersedes_partially: docs/product/flow-office-service-contract-sprints.md (Sprint 1, modelo no editor Quill)
relates_to:
  - docs/architecture/decisions/017-flow-customer-documents-validation-drive.md
  - docs/architecture/decisions/018-flow-validation-by-office-claude-account.md
  - docs/product/flow-customer-documents-sprints.md
```

## Contexto

Hoje o escritorio usa um prompt proprio num Projeto do Claude: anexa o
`KIT_MODELO_AL.docx` e os documentos do cliente. A IA confere os documentos,
extrai os emprestimos do extrato e, so com status APTO, devolve o kit preenchido
em `.docx`: contrato, procuracao, hipossuficiencia, LGPD, declaracao de ciencia,
declaracao fatica, termo de renuncia e declaracao de residencia.

No Flow ja existem, na `main`:

- a validacao dos documentos pela rotina Claude do escritorio (ADR 017 e 018),
  incluindo a S6: leitura de todas as paginas, recusa de PDF com senha,
  situacao por documento, `extractedData` preenchendo so campos vazios da ficha
  e CPF dispensavel;
- o modelo do escritorio na aba Escritorios -> Contrato Servicos: editor Quill,
  tags livres `[[ASSIM]]`, versoes (Sprint 1 de
  `flow-office-service-contract-sprints.md`).

O modelo cadastrado de Manaus (versao 2) ja e o kit inteiro, com 24 tags:

- `NOME_COMPLETO`, `NACIONALIDADE`, `ESTADO_CIVIL`, `PROFISSAO`,
  `DOCUMENTO_IDENTIDADE`, `CPF`, `ENDERECO_COMPLETO`;
- `BANCO_1`, `CONTRATO_1`, `BANCO_2`, `CONTRATO_2`, `INICIO_1`, `VALOR_1`,
  `PARCELAS_1`, `INICIO_2`, `VALOR_2`, `PARCELAS_2`;
- `DATA_POR_EXTENSO`, `LISTA_BANCOS`, `FORMA_DE_DESCONTO`;
- `TIPO_COMPROVANTE`, `MES_REFERENCIA`, `NOME_TITULAR_COMPROVANTE`,
  `VINCULO_COM_TITULAR`.

O modelo tem 4 tabelas, linhas fixas para 2 contratos, 47 marcas de genero ou
plural fora das tags (`portador(a)`, `o(a)`, `da(s)`, `financeira(s)`...), a
declaracao de residencia condicional e o termo de renuncia com duas versoes
(Juizado Especial Civel estadual ou Juizado Especial Federal).

## Decisoes Confirmadas Pelo Usuario (2026-10-21/22)

1. Todo escritorio tem **um modelo** na aba Contrato Servicos, e ele contem
   **todas as tags** do kit.
2. O kit e gerado **substituindo as tags pelos valores extraidos pela IA** a
   partir dos documentos do cliente. Os valores vem da extracao, inclusive o que
   nao esta na ficha (decisao de 2026-10-21, ja registrada na Sprint 1).
3. Os documentos que a IA pode ler sao **configuraveis por etapa**: a validacao e
   cada automacao de coluna leem so o que usam. O objetivo e nao enviar dado que
   seria descartado (HISCON e HISCRED nao sao usados na mesma etapa).

## Decisoes Recomendadas Pelo PE (Confirmadas Pelo Usuario Em 2026-10-22)

4. **Quem gera e o Flow, nao a IA.** A IA confere e devolve um valor por tag; o
   Flow monta o kit de forma deterministica.
   - Motivos: o texto juridico fixo nunca passa pela IA; a revisao humana se
     limita a conferir valores; um valor corrigido gera de novo sem IA; a
     checagem final e garantida; o uso da assinatura Claude Pro cai.
   - A geracao pela IA foi descartada. Ela pode alterar clausulas sem que
     ninguem perceba, obriga a reler o kit inteiro e precisaria de upload de
     arquivo pelo conector. Tambem nao reproduz o processo de hoje: hoje a IA
     edita o `.docx` original, e na rotina so teria o HTML do Flow.
5. **Linha-molde para contratos.** A linha de tabela com tags `_1` e o molde. O
   Flow a repete para cada contrato devolvido (`_1`, `_2`, `_3`...) e remove a
   linha cujas tags ficarem todas sem valor. Vale para as 4 tabelas.
6. **Marcas de genero e plural resolvidas pelo Flow**, usando dois valores: o
   genero do cliente (a IA le no documento; a pessoa confirma na revisao) e a
   quantidade de instituicoes financeiras. Marca nao reconhecida bloqueia a
   geracao. **Revisado em 2026-10-28 (decisao 19, Q3):** a marca nao reconhecida
   nao bloqueia; o texto original fica e a geracao avisa onde ela esta.
   **Revisado pelo usuario em 2026-10-29 (plural por palavra):** contrato(s),
   emprestimo(s), parcela(s) e desconto(s), e o artigo com marca logo antes deles,
   seguem a quantidade de contratos; as demais marcas, a de instituicoes.
7. **Blocos condicionais por tags de bloco** no proprio modelo: `[[SE_JEC]]`...
   `[[FIM_SE_JEC]]` e `[[SE_JEF]]`...`[[FIM_SE_JEF]]` para o termo de renuncia.
   As tags de bloco nunca recebem valor e saem do texto final. A declaracao de
   residencia nao precisa de bloco porque sai do kit (decisao 15).
8. **Valores calculados pelo Flow, nao pela IA:**
   - `DATA_POR_EXTENSO`: e a data da geracao;
   - `LISTA_BANCOS`: montada a partir dos `BANCO_n`.
9. **Documento nao lido pela validacao fica fora dela** (opcao A). Ele nao
   recebe selo da IA e a tela o marca como "nao conferido pela IA"; a conferencia
   dele passa a ser da pessoa que confirma o parecer ou da etapa que o usa.
   - Rejeitada a opcao B: ler tudo so para conferir, o que nao economiza nada.
   - Rejeitada a opcao C: tornar o documento obrigatorio so na etapa que o usa,
     o que muda a regra de cadastro completo.
10. **Declaracao de residencia de terceiro conferida como documento enviado.**
    Ela continua obrigatoria no cadastro quando o comprovante e de terceiro. A IA
    confere: assinada, mesmo titular e endereco do comprovante e vinculo
    informado. Declaracao sem vinculo e pendencia. Nao ha campo novo de
    entrevista.

11. **HISCRED fora da validacao** (confirmado pelo usuario em 2026-10-22). Os
    emprestimos do kit saem do HISCON. O HISCRED e usado mais adiante, quando a
    rotina da Analise de Acoes avalia as acoes possiveis.
    - Configuracao do cliente: a validacao le identidade, CPF, comprovante,
      declaracao de residencia de terceiro e HISCON; a regra "Executar agente" da
      coluna Analise de Acoes libera o HISCRED (e o que mais a analise usar).
    - Com a decisao 9, o HISCRED aparece na ficha como "nao conferido pela IA" ate
      a Analise de Acoes. A automacao continua lendo so documentos da ficha com
      validacao confirmada; o HISCRED entra porque faz parte da ficha confirmada,
      mesmo sem ter sido lido.

    - **Revisado pelo usuario em 2026-10-26:** a Analise de Acoes le o **HISCON**, nao o HISCRED. O
      HISCON e usado nas duas etapas: na validacao, para os contratos do kit; na Analise de Acoes, para
      os blocos de acoes (`docs/product/flow-action-analysis-routine-prompt.md`). A regra da coluna
      Analise de Acoes libera so o HISCON. O HISCRED continua fora da validacao e hoje nao e lido por
      nenhuma rotina; fica na ficha como "nao conferido pela IA".

12. **Dado de entrevista ausente impede a aprovacao** (Q2, como no prompt do
    escritorio). Estado civil ou profissao sem valor na ficha geram pendencia
    impeditiva. A excecao e a profissao "aposentado/aposentada/pensionista"
    indicada pelo HISCON.
13. **Termo de renuncia segue a regra do prompt do escritorio** (Q1).
    - O padrao e JEC (40 salarios minimos, acao so contra banco).
    - Quando a acao tambem for contra o INSS, vale JEF (60 salarios minimos,
      art. 3 da Lei 10.259/2001).
    - Na duvida, JEC com alerta.
    - A IA devolve a sugestao (`waiverCourt`: `jec` ou `jef`) e a pessoa pode
      trocar na revisao. O Flow mantem o bloco escolhido.
14. **`.docx` no modelo e no kit** (Q3 e Q4).
    - O kit sai em `.docx`, como o escritorio usa hoje para imprimir e assinar.
    - O modelo do escritorio passa a ser o proprio `.docx` do escritorio
      (upload versionado na aba Contrato Servicos), no lugar do HTML do Quill,
      para manter a formatacao do Word.
    - As tags continuam `[[ASSIM]]`, escritas pelo escritorio no Word. A geracao
      usa o motor `.docx` que ja existe no Flow (docxtemplater), com a
      linha-molde, os blocos e as marcas de genero e plural das decisoes 5 a 7.
    - Revisa a decisao Quill da Sprint 1: o editor Quill sai, e as versoes HTML
      ja gravadas ficam so como historico.
15. **Declaracao de residencia sai do kit** (Q6). E o mesmo documento que o
    cliente ja envia assinado. A secao e as tags `TIPO_COMPROVANTE`,
    `MES_REFERENCIA`, `NOME_TITULAR_COMPROVANTE` e `VINCULO_COM_TITULAR` saem do
    modelo. O kit fica com 7 documentos.

16. **Card automatico na confirmacao** (decisao do usuario, 2026-10-26). Ao confirmar a validacao,
    o Flow cria o card do cliente, ja vinculado a ele, na coluna **BACKLOG** do **board de entrada do
    escritorio** do pedido.
    - O board de entrada e configurado por escritorio em Configuracoes -> IA -> Validacao de cadastro.
    - E uma acao do sistema em nome de quem confirmou (`flow:validation:approve`), auditada
      (`kanban_customer_validation_intake_card`).
    - Nao duplica: se o cliente ja tem card ativo no board, o card existente e reaproveitado. Repetir a
      mesma confirmacao tambem nao cria outro card.
    - Nunca desfaz a confirmacao. Sem escritorio, sem board de entrada, sem coluna BACKLOG ou com falha,
      o motivo fica registrado na validacao e aparece na etapa Validacao.
    - A busca de cliente no card passa a aceitar o cliente da ficha vinculado a um escritorio do usuario
      (admin: qualquer escritorio), alem do cliente ja ligado a um card visivel. E a mesma regra da tela
      Clientes.

    - **Complemento do usuario em 2026-10-29:** o card criado recebe como responsaveis todos os responsaveis do
      escritorio (aba Usuarios, `is_responsible`). Quem nao e membro ativo do board de entrada ou nao ve o card
      fica de fora; o card e criado do mesmo jeito e a validacao mostra quem ficou de fora e por que. Card que ja
      existia nao muda de responsavel. Os advogados do escritorio (nome/OAB/UF) nao sao usuarios e nao entram.
17. **Pastas do Drive por escritorio** (decisao do usuario, 2026-10-26). Os documentos do cliente
    ficam em `<raiz>/<escritorio>/<CPF - nome>/`.
    - A pasta do escritorio (ex.: `Manaus`, `Boa Vista`) e criada quando nao existe.
    - A pasta do cliente e `CPF - nome`.
    - Revisao do usuario em 2026-10-30: pastas e arquivos sao achados pelo **nome exato**. Pasta com o
      mesmo nome no pai e reaproveitada (a mais antiga, se ja houver duplicada); sem ela, e criada.
      Arquivo com o mesmo nome na pasta e substituido pela versao nova (o Drive guarda a anterior no
      historico); sem ele, e criado. Cliente renomeado no cadastro ganha pasta nova. Os envios do mesmo
      cliente rodam um por vez (trava consultiva no PostgreSQL), o que impede pastas duplicadas por
      envios paralelos.
    - Escritorio do documento da ficha: o do pedido na validacao confirmada mais recente; senao o
      primeiro escritorio vinculado ao cliente; sem nenhum, `Sem escritorio`. Peticao: o escritorio
      do card.
    - Barras, aspas e caracteres de controle saem do nome da pasta.
    - Substitui a pasta so com o CPF (ADR 017). Arquivos ja enviados ficam onde estao.

18. **Analise de Acoes devolve dados; o Flow registra e move o card** (decisao do usuario, 2026-10-26;
    `docs/product/flow-action-analysis-sprints.md`, A1).
    - A rotina registra o resultado por `flow_submit_action_analysis`, no lugar do comentario de texto.
      Cada linha "Acao" de um bloco do cliente e uma peticao inicial possivel, gravada vinculada ao
      card, ao cliente e a execucao.
    - O Flow confere o envio (bloco, campos por bloco, um contrato em um bloco so) e recusa sem gravar.
    - O destino e regra geral da automacao, para qualquer agente: "Ao concluir sem erro, mover o card
      para". O Flow decide o que e concluir sem erro: rotina que conclui pelo comentario com `run_id`,
      agente de chave de API `completed` e, na Analise de Acoes, analise concluida com ao menos uma
      acao. Move com as permissoes do dono da regra e as mesmas checagens da tela (transicao,
      checklist, WIP); no worker da chave de API, sem scopes, so o papel no board. A IA continua sem
      mover card.
    - Nao move quando: nao ha acao, a analise nao foi concluida, a regra nao tem destino, o card saiu da
      coluna da regra durante a analise ou o destino bloqueia. O motivo fica no card.
    - Execucoes de rotina nas automacoes expiram como o botao Validar: 5 min sem a rotina chegar ao
      Flow, 15 min parada depois disso.
    - O PDF do relatorio (padrao visual do cliente) fica para depois, montado pelo Flow sobre os
      mesmos dados. O prompt do cliente nao gera a peticao em si.

    - **Revisado em 2026-10-28 (unificacao, `docs/product/flow-branch-unification.md`):** o destino saiu
      da regra do agente. O card anda por uma regra propria `ai_completed -> move_card`, com o gatilho
      customizavel de `docs/product/flow-ai-completion-sprints.md`; a Analise de Acoes concluida com ao menos
      uma acao grava `ai.automation_completed` na transacao do registro. `AutomationCardMoveService` saiu.
    - **Revisado em 2026-10-28 (ADR 020):** a conclusao por comentario com `run_id` passa a valer so para
      regra com resultado esperado "Comentario"; peticoes iniciais tem rotina propria, com gerador Flow
      ou IA. A decisao 4 continua valendo para o kit do escritorio.

19. **Kit gerado sozinho na confirmacao, com tag sem valor mantida** (decisao do usuario, 2026-10-28).
    - Ao confirmar a validacao, o Flow gera o kit sem acao extra, com a versao do modelo `.docx` e os
      valores revisados (Sprint 4 depois da Sprint 3).
    - Valor vazio nao bloqueia a geracao: o trecho fica como no modelo original. O advogado responsavel
      revisa o kit e corrige. Revisa a consequencia "a geracao so acontece ... sem nenhum valor vazio".
    - Os dados vem dos valores extraidos pela IA e revisados por uma pessoa, nao direto da ficha; e o kit
      inteiro do modelo, nao so o contrato.
    - Por enquanto o arquivo vai so para o Drive (pasta do CPF do escritorio, decisao 17); nao entra
      como documento na ficha do cliente.
    - **Revisado pelo usuario em 2026-10-30:** o kit mais recente do cliente aparece no bloco Documentos
      do card para baixar (`GET kanban/boards/:boardId/cards/:cardId/office-kit` e `.../:kitId/download`,
      URL assinada do storage do Flow). Quem ve o card pode baixar; o download e auditado
      (`kanban_customer_office_kit_downloaded`). Vale com ou sem Drive. Continua fora da ficha do cliente.
    - Recomendacoes do PE aprovadas em 2026-10-28 (secao "Decisoes De 2026-10-28" do sprint): tag sem
      valor fica `[[CAMPO]]` no arquivo; parecer com pendencias nao gera kit; marca de genero/plural nao
      reconhecida mantem o texto original com aviso; Drive inativo deixa o kit na fila ate voltar.

20. **O kit validado do escritorio entra como esta** (decisao do usuario, 2026-10-29). O `KIT_MODELO_AM`
    usado hoje pelo cliente final e o modelo; o Flow se adapta a ele na montagem, sem pedir ajuste no Word:
    - linhas fixas `_2`, `_3`... das tabelas saem; a linha `_1` e repetida por contrato e a celula "1" da
      numeracao vira o numero da linha (revisa a decisao 5, que pedia so a linha `_1` no modelo);
    - termo de renuncia sem blocos: no JEF, o Flow troca o trecho "RENUNCIA expressamente..." pelo texto da
      regra 4 do prompt do escritorio e "Juizado Especial Civel" por "Juizado Especial Federal" no mesmo
      paragrafo; blocos `[[SE_JEC]]`/`[[SE_JEF]]` continuam aceitos (revisa a decisao 7);
    - a secao "DECLARACAO DE RESIDENCIA" sai do kit na montagem, com a quebra de pagina que a abre, e as tags
      dela nao entram na lista pedida a IA (aplica a decisao 15 sem editar o modelo);
    - valor preenchido perde o destaque amarelo do modelo (regra 2 do prompt); tag sem valor continua
      destacada para o advogado.

## Em Aberto

Nenhuma decisao pendente. Os insumos externos sao: o `.docx` do modelo do
escritorio, sem a declaracao de residencia e com os blocos JEC/JEF, e uma ficha
real com HISCON de mais de 2 contratos para o teste da linha-molde.

## Consequencias

- O pedido de validacao leva:
  - as tags da versao atual do modelo do escritorio da validacao;
  - so os documentos liberados para a etapa;
  - os dados de entrevista: ficha, terceiro e vinculo.
- O parecer ganha:
  - `tagValues`, so com `aprovado`;
  - `gender` e `waiverCourt`;
  - pendencias gerais e alertas, que nao sao de um documento.
- A validacao guarda os valores e a versao do modelo usada.
- A revisao humana dos valores passa a ser a fronteira entre IA e documento
  juridico. A geracao so acontece com o parecer confirmado e sem nenhum valor
  vazio.
- O prompt do escritorio deixa de gerar arquivo. A versao adaptada esta em
  `docs/product/flow-office-kit-routine-prompt.md`.
- A automacao de coluna ganha a lista de documentos liberados na propria regra;
  a ferramenta recusa documento fora dela.
