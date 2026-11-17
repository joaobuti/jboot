# Flow — Analise De Acoes: Retorno Estruturado E Card Movido Pelo Flow

```yaml
target_project: implementations/bff-jboot-platform + implementations/app-jboot-next-platform
target_module: modules/kanban
lifecycle_status: in_development
decisoes: docs/architecture/decisions/019-flow-office-kit-generated-by-flow.md (decisao 18)
prompt: docs/product/flow-action-analysis-routine-prompt.md
branch: feature/flow-office-kit (decisao do usuario, 2026-10-26: mesma branch, sem commit)
```

## Pedido (2026-10-26)

- As possiveis peticoes iniciais devolvidas pela rotina da Analise de Acoes devem ser registradas e
  vinculadas ao card do cliente.
- Sem erro na execucao e com pelo menos uma peticao, o card vai sozinho para a coluna seguinte
  (no board do cliente: "Iniciais Geradas").

## PE Decision

- Deployment Boundary Gate: mesmo modulo `kanban`, mesmo processo e deploy do BFF e do app
  Platform; herda NestJS, Next.js e PostgreSQL. Sem runtime novo.
- Stack Fit Gate: nao se aplica (nenhuma unidade nova de build ou deploy).
- O comentario de texto livre nao permite contar acoes nem detectar erro. A rotina passa a devolver
  o resultado por uma ferramenta estruturada, como a validacao de cadastro ja faz.
- A IA continua sem mover card. Quem move e o Flow, deterministicamente, depois de validar o
  retorno, com as permissoes do dono da regra (mesma checagem de transicao, checklist e WIP da
  tela).

## Decisoes Do Usuario (2026-10-26)

| Tema | Decisao |
|---|---|
| Destino do card | Coluna escolhida na propria regra ("Ao registrar acoes, mover para"); reordenar colunas nao muda o destino |
| Unidade registrada | Cada linha "Acao" de cada bloco e uma peticao possivel; o total bate com o "TOTAL GERAL DE ACOES" do cliente |
| PDF do relatorio | Depois. O prompt do cliente gerava PDF so do relatorio (tabelas), nao da peticao. Agora: tela do card |
| Branch | Mesma branch, sem commit |

## Sprint A1: Acoes Registradas No Card E Card Movido

> Status: `concluida` (2026-10-26). Smoke com a rotina real pendente (colar o prompt versao 2,
> reconectar o conector e escolher a coluna de destino na regra).

Entregaveis:

- ferramenta do conector `flow_submit_action_analysis` (`run_id`, cabecalho, acoes por bloco ou
  motivo de nao conclusao);
- validacao do retorno pelo Flow:
  - bloco conhecido (`caixa`, `e`, `a`, `b`, `c`, `d`) e campos obrigatorios por bloco
    (ano em Caixa/A/B/C; contrato-raiz no E; um contrato no A e no D; tipo RMC/RCC no D);
  - um contrato em no maximo um bloco (regra 8 do cliente), ignorando "nao identificado" e
    "ilegivel";
  - um envio por execucao;
- registro da analise e das acoes vinculados ao card, ao cliente e a execucao (migration 100);
- o envio conclui a execucao; "nao concluida" encerra a execucao como falha;
- card movido pelo Flow para a coluna configurada na regra quando a analise conclui com ao menos
  uma acao e o card ainda esta na coluna da regra; bloqueio (transicao, checklist, WIP) deixa o card
  e registra o motivo;
- historico do card: "registrou a analise de acoes" com total e resultado do movimento;
- execucoes de rotina das automacoes ganham o prazo do botao Validar: 5 min sem a rotina chegar ao
  Flow (`routine_not_reached`) e 15 min sem chamar o conector depois disso (`routine_no_answer`); a
  falha aparece no historico do card;
- regra "Executar agente": campo opcional "Ao concluir sem erro, mover o card para" (ver complemento abaixo);
- secao "Acoes identificadas" no card: acoes por bloco, contratos e resumo;
- prompt: so as partes `[FLOW]` mudam (secoes 0, 10.9 e 11); regras do cliente intactas.

Criterios de aceite:

- retorno com bloco desconhecido, campo obrigatorio ausente ou contrato em dois blocos e recusado
  com mensagem que a rotina consegue corrigir, sem gravar nada;
- segundo envio da mesma execucao e recusado;
- analise concluida com 1+ acoes e destino configurado move o card; com 0 acoes, nao move;
- "nao concluida" nao move e mostra o motivo;
- destino bloqueado por checklist ou transicao nao move e mostra o motivo;
- card que saiu da coluna da regra durante a analise nao e movido;
- rotina que nao chega ao Flow libera a execucao em 5 min com o motivo no historico.

UIUX Decision (ui-ux.md):

- `scenario_classification: covered_by_template`: secao somente leitura no modal do card, no padrao dos
  paineis existentes (`CardLeadDocumentsPanel`: titulo `h6`, lista, estados carregando/erro/vazio); o
  destino da regra e um campo novo no modal ja existente de automacao.
- Estados: carregando e sem analise nao mostram nada; erro em alerta; nao concluida em alerta com o
  motivo; sucesso com acoes por bloco e o resultado do movimento.
- Sem componente novo de padrao, sem impacto de menu.

Evidencias (2026-10-26, no container):

- migration 100 aplicada no banco de dev;
- BFF: type-check, lint, build e 707 testes (705 passam, 2 ignorados ja existentes), incluindo
  PostgreSQL real para gravacao vinculada ao card com encerramento unico da execucao, ordem dos blocos,
  isolamento por tenant e expiracao em 5/15 min; regras por bloco e regra 8; movimento, sem acao, sem
  destino, nao concluida, card movido no meio e destino bloqueado; regra com destino so para rotina;
  ferramenta no conector exigindo o aceite de documentos;
- Web: type-check, lint, 154 testes e `next build`;
- rota `GET .../action-analysis` respondendo no BFF em execucao (401 sem token);
- `make ai-check` aprovado (grafo de API com a rota e o consumidor; grafo de arquitetura sem achados).

### Complemento Da A1: "Ao Concluir Sem Erro, Mover O Card Para" (2026-10-26)

Revisao pedida pelo usuario. O campo nasceu amarrado a Analise de Acoes ("Ao registrar acoes") e
aparecia para qualquer rotina: numa rotina que so comenta, o destino nunca funcionava e nada avisava. O
aviso do modal tambem dizia "a rotina comenta; a IA nunca move o card", contradizendo o destino.

- O campo vira regra geral da automacao, na secao "Depois da execucao" do modal, para qualquer agente
  (rotina Claude ou chave de API).
- "Concluir sem erro" e decidido pelo Flow em um lugar so (`AutomationCardMoveService`):
  - rotina que conclui pelo comentario com `run_id`;
  - agente de chave de API concluido (`completed`); `review_required` nao move;
  - Analise de Acoes: analise concluida com ao menos uma acao.
- Falha, expiracao, analise nao concluida ou sem acao deixam o card. Conclusao generica com destino
  registra `card.automation_completed` no historico com o resultado.
- Agente de chave de API conclui no worker, sem token: o Flow move como o dono da regra sem scopes
  (vale so o papel dele no board). Nunca concede mais do que a tela; no pior caso, `blocked`.
- Risco residual (fechado em 2026-10-28, S1 de `flow-initial-petitions-sprints.md`): se a rotina da
  Analise de Acoes comentasse com `run_id` em vez de usar `flow_submit_action_analysis`, a execucao
  concluiria pelo caminho generico e o card moveria sem acoes. Com o "Resultado esperado" Analise de
  acoes, o comentario nao conclui nem move.

Evidencias (2026-10-26, no container): BFF type-check, lint e 137 testes dos modulos afetados
(conclusao generica com e sem destino, chave de API movendo como o dono sem scopes, review sem mover,
comentario com `run_id` acionando o movimento); Web type-check, lint, 154 testes e `next build`.

## Fora Desta Sprint

- PDF do relatorio com o padrao visual do cliente (opcao B de `flow-action-analysis-routine-prompt.md`).
- Geracao do texto das peticoes (prompt de peticoes, pendente).

## Revisao Da Unificacao (2026-10-28)

Decisao do usuario: manter o desenho da conclusao explicita da IA (`docs/product/flow-ai-completion-sprints.md`)
e revisar a A1 (`docs/product/flow-branch-unification.md`, item C).

- "Ao concluir sem erro, mover o card para" saiu da regra do agente e o `AutomationCardMoveService` saiu do
  codigo. O card anda por uma regra `ai_completed -> move_card` na coluna; a migration 105 converteu o
  destino da regra existente (no dev, a regra `9a9dd446` foi reativada com o mesmo destino).
- `flow_submit_action_analysis` grava `ai.automation_completed` na transacao do registro quando a analise
  e concluida com ao menos uma acao; `move_outcome`, `move_detail` e `target_column_id` sairam da tabela.
- A secao "Acoes identificadas" mostra se a analise contou como conclusao sem erro, em vez do movimento.
- O risco residual do comentario com `run_id` deixou de existir: comentario nunca conclui.

