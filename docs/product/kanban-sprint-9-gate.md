# Kanban Sprint 9 Gate

## Status

PE Decision e Stack Fit Gate concluidos pelo Architect em 2026-09-13.
Confirmacao humana: nao exigida pelo orquestrador para reabrir escopo de
produto (ja fechado por PO em `docs/product/kanban-sprints.md`, Sprint 9;
usuario ja autorizou implementacao direta apos fechamento do contrato
tecnico). Uma decisao tecnica do Architect diverge da redacao literal dos
Entregaveis do PO (mecanismo do scheduler — ver "Decisao Do Architect");
tratada como refinamento de implementacao, nao mudanca de regra de negocio,
e registrada explicitamente abaixo. Implementacao ainda nao iniciada.

Agents/skills declarados: Architect (este documento); implementacao usa
`kanban-board-domain` (backend) e `kanban-board-ui` (frontend), reaproveitando
o motor da Sprint 8.

## Escopo

Sprint 9: quatro `trigger_type` novos no motor generico de automacao por
coluna (Sprint 8), mesmo `action_type=send_email_notification`:
`due_date_approaching`, `card_stale`, `column_left`, `juridico_process_moved`.
Regras de negocio de cada trigger: ver `docs/product/kanban-sprints.md`,
secao "Sprint 9" (PO, nao reaberto aqui).

Projetos afetados:

- `implementations/bff-jboot-platform/modules/kanban`;
- `implementations/app-jboot-next-platform/modules/kanban` (seletor de
  trigger na aba "Automacoes" da settings de coluna, com campo `N`/`X` dias
  para os dois triggers de cron).

## PE Decision — Modelo De Dados

### `kanban_column_automation_rules`

- `trigger_type` CHECK estendido para incluir `due_date_approaching`,
  `card_stale`, `column_left`, `juridico_process_moved` (mantendo
  `column_entered`).
- Coluna nova `trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb`.
  Nao reaproveitar `action_config` (semanticamente e configuracao da acao —
  hoje so `boardMemberIdentityId` para `recipient_role=board_member` — nao da
  condicao de disparo; misturar os dois campos obriga o worker a interpretar
  chaves de dois dominios diferentes na mesma coluna e quebra a leitura do
  schema).
  - `due_date_approaching`: `{ "daysBefore": N }`, `N` inteiro `>= 0`.
  - `card_stale`: `{ "daysStale": X }`, `X` inteiro `> 0`.
  - `column_left`, `juridico_process_moved`: `{}` (sem configuracao adicional
    nesta sprint).
- Validacao de `N`/`X` (inteiro, faixa) no DTO/`ColumnAutomationRuleController`,
  nao so no banco — mesmo padrao do `action_config` atual.

### Idempotencia por dia (`due_date_approaching` / `card_stale`)

Decisao: **opcao A** do exemplo levantado pelo PO — `source_activity_id`
passa a ser nullable e ganha uma coluna irma `dispatch_date date NULL`, com
duas `UNIQUE` parciais no lugar da atual:

```sql
ALTER TABLE kanban_automation_dispatch_log
  ALTER COLUMN source_activity_id DROP NOT NULL,
  ADD COLUMN dispatch_date date NULL;

ALTER TABLE kanban_automation_dispatch_log
  DROP CONSTRAINT kanban_automation_dispatch_log_card_id_board_column_id_automat_key; -- nome real via \d

CREATE UNIQUE INDEX kanban_automation_dispatch_log_reactive_uq
  ON kanban_automation_dispatch_log (card_id, board_column_id, automation_rule_id, source_activity_id)
  WHERE source_activity_id IS NOT NULL;

CREATE UNIQUE INDEX kanban_automation_dispatch_log_scheduled_uq
  ON kanban_automation_dispatch_log (card_id, board_column_id, automation_rule_id, dispatch_date)
  WHERE dispatch_date IS NOT NULL;

ALTER TABLE kanban_automation_dispatch_log
  ADD CONSTRAINT kanban_automation_dispatch_log_origin_check
  CHECK ((source_activity_id IS NOT NULL) <> (dispatch_date IS NOT NULL));
```

Justificativa, rejeitando as duas alternativas:

- **Tabela separada para triggers de cron**: duplicaria status/attempt/retry
  machinery e fragmentaria a consulta de "historico de disparos de uma regra"
  (feature natural de UI futura) em duas fontes. Sem ganho — volume e baixo
  (1x/dia por regra) e o schema unificado com `CHECK` de exclusividade evita
  linha ambigua (nunca as duas colunas de origem preenchidas ao mesmo tempo).
- **Sintetizar um `CardActivity` fake por dia so para ter `source_activity_id`
  nao-nulo**: rejeitado — `CardActivity` e timeline visivel ao usuario no
  card; criar uma entrada de auditoria para um evento que nao aconteceu no
  card (so uma verificacao de cron) distorce o historico que Sprint 4
  formalizou como "estilo Azure DevOps". `dispatch_date` nao tem esse efeito
  colateral porque vive só em `kanban_automation_dispatch_log`, tabela interna
  do motor, nunca exibida como timeline do card.
- `dispatch_date` usa a data corrente do job (nao `due_date - N` nem outro
  calculo), porque a regra de negocio e "no maximo 1 disparo por (regra,
  card, dia)" — o dia relevante para idempotencia e o dia em que o job
  avaliou a condicao como verdadeira, nao um dia derivado do dado do card.
  Isso tambem cobre corretamente o criterio de aceite "mudar `due_date`
  reabre o disparo": o novo dia calculado (`due_date - N`) so bate com "hoje"
  em uma data diferente, e o par `(regra, card, dispatch_date)` daquele novo
  dia ainda nao existe no log.

### Scheduler

Job diario, roda 1x, horario `06:00` America/Sao_Paulo (fora do horario
comercial tipico, mas cedo o bastante para o e-mail chegar no inicio do dia
util — nao ha requisito de produto mais especifico; ver Open Questions).
Consulta, por client_id/database_ref (o job precisa iterar todos os
`database_ref` de kanban ativos — mesmo padrao de fan-out multi-tenant que
qualquer outro processo de background do platform-api ja precisa resolver;
nao ha isso hoje porque este e o primeiro scheduler do modulo, ver Stack Fit
Gate):

1. `due_date_approaching`: para cada regra ativa desse tipo, cards ativos
   (`status='active'`) na `board_column_id` da regra com `due_date IS NOT
   NULL` e `due_date - trigger_config.daysBefore = current_date` (calculo em
   SQL, nao em app, para evitar drift de timezone entre app e banco).
2. `card_stale`: para cada regra ativa desse tipo, cards ativos na coluna da
   regra cuja "data de entrada na coluna atual" (`MAX(created_at)` de
   `kanban_card_activities` com `type='system_event'` e
   `event_payload->>'kind' = 'card.moved'` e
   `event_payload->>'toBoardColumnId' = board_column_id`, ou `Card.created_at`
   se nunca houve tal evento) tem `>= trigger_config.daysStale` dias.
3. Cada card/regra que bate a condicao gera um `enqueue()` na fila BullMQ
   existente `kanban-column-automation`, job name novo
   `send-scheduled-email-notification` (nome de job diferente do
   `send-email-notification` da Sprint 8, mesma fila — o worker atual so
   processa jobs `send-email-notification`; ver extensao do worker abaixo),
   payload incluindo `dispatchDate` (data corrente do job, string `YYYY-MM-DD`,
   usada pelo worker para o `createOrGetExisting` com `dispatch_date` em vez
   de `source_activity_id`) e, para `due_date_approaching`, `daysBefore` (para
   o corpo do e-mail mostrar "faltam N dias").

Fan-out multi-tenant do job diario: o modulo kanban ja resolve
`database_ref` por requisicao via Identity/JWT; um cron in-process nao tem
request. Escopo desta sprint: o job itera a lista de `database_ref` de
kanban ativos (mesma fonte que o provisionamento usa — `database_refs` no
Identity, filtrado por `application_slug` do kanban), sequencialmente, sem
paralelismo novo. Nao e um problema novo introduzido por este contrato — e
inerente a "primeiro scheduler do modulo" e deve ser resolvido junto da
implementacao do scheduler, nao adiado.

### Extensao do hook `move()` (`column_left`)

Dentro do `if (card.boardColumnId !== dto.toBoardColumnId)` existente em
`cards.service.ts::move()` (linha ~246), ao lado da chamada atual
`dispatchColumnEnteredAutomations(..., dto.toBoardColumnId, ...)`: uma
segunda chamada `dispatchColumnLeftAutomations(context, boardId,
card.boardColumnId, cardId, movedActivity.id)`, buscando regras ativas
`trigger_type=column_left` para `card.boardColumnId` (coluna de origem, ja
em escopo, sem query extra) e reaproveitando o mesmo `movedActivity.id` como
`source_activity_id` (mesmo evento `card.moved` serve de origem para
`column_entered` no destino e `column_left` na origem — sao duas
avaliacoes/dispatches do mesmo `CardActivity`, a `UNIQUE` parcial reativa ja
os diferencia porque `board_column_id` e `automation_rule_id` mudam).
Mesmo job `send-email-notification`/worker atual, sem trigger_type extra no
payload necessario (o `automationRuleId` no payload ja resolve o
`trigger_type` no worker, se o corpo do e-mail precisar variar por tipo —
ver "MailerService" abaixo).

### Extensao de `notifyProcessChanged()` (`juridico_process_moved`)

Em `domain-integrations.service.ts::notifyProcessChanged()`, apos
`recordIntegrationEvent()` (que ja retorna a `CardActivity` criada, com
`id`), resolver a coluna atual do card (`this.cardsRepository... /
columns.findById` a partir de `link.cardId`) e buscar regras ativas
`trigger_type=juridico_process_moved` para essa `board_column_id`. Se
houver, enqueue no mesmo padrao dos demais triggers reativos, com
`sourceActivityId = <id da activity de juridico_process_changed>`. Sem
monitor ativo, `notifyProcessChanged()` nunca e chamado (ausencia de fato
gerador — regra de negocio do PO, nao redecidida aqui).

### `MailerService` / payload de e-mail

- `column_left`: mesmo template usado por `column_entered`
  (`sendColumnEnteredNotification`), pois o conteudo relevante e o mesmo
  (card, coluna origem/destino, quem moveu, quando) — so muda a redacao do
  assunto/corpo para deixar claro que e "saiu de" em vez de "entrou em".
  Decisao: parametrizar o metodo existente com uma flag/`direction:
  'entered' | 'left'` em vez de criar metodo novo no `MailerService`, porque
  os dados de entrada sao identicos byte a byte.
- `due_date_approaching`: template novo, `sendDueDateApproachingNotification`
  — precisa de `cardTitle`, `dueDate`, `daysBefore` (do payload do job, nao
  recalculado), `columnName`. Mensagem explicita "faltam N dias para o prazo
  do card X" (regra de negocio do PO: e-mail deve mostrar quantos dias
  faltam).
- `card_stale`: template novo, `sendCardStaleNotification` — `cardTitle`,
  `columnName`, `daysStale` (configurado na regra, nao recalculado no
  momento do envio — o job so enfileira quando a condicao ja bateu o
  limiar).
- `juridico_process_moved`: template novo, `sendJuridicoProcessMovedNotification`
  — `cardTitle`, `columnName`, `numeroProcesso`, `tribunal`,
  `novasMovimentacoes` (mesmos campos que `notifyProcessChanged()` ja recebe
  em `ProcessChangeNotification`, propagados no payload do job).
- Os quatro templates seguem o padrao visual/estrutura do template existente
  de `column_entered` (saudacao por nome do destinatario resolvido, link para
  o card); nenhum requer segundo provedor SMTP nem mudanca de configuracao
  de ambiente.

### Worker (`automation-worker.service.ts`)

`process()` passa a aceitar dois job names na mesma fila:
`send-email-notification` (Sprint 8, reativo) e
`send-scheduled-email-notification` (novo, cron). O branch de idempotencia
usa `sourceActivityId` quando presente e `dispatchDate` quando presente
(mutuamente exclusivos, refletindo o `CHECK` do banco). Resolucao de
destinatario (`resolveRecipients`) e inalterada — `recipient_role` funciona
identicamente para os 4 triggers novos. `buildEmailContent` ganha um branch
por `trigger_type` (lido de `automationRuleId` -> regra, ou propagado no
payload do job para evitar round-trip extra — decisao de implementacao, sem
impacto de contrato) para montar o template certo.

## Stack Fit Gate — Scheduler

Tipo real da entrega: job de fundo, baixo volume (1x/dia, N regras ativas x
M cards por cliente — ordem de dezenas/centenas, nao milhares, no horizonte
atual do produto), dentro de um processo que ja tem BullMQ+Valkey como
dependencia de infra obrigatoria (Sprint 8).

Candidatos avaliados:

1. **`@nestjs/schedule` (`@Cron`) in-process, disparando o job diretamente**
   — e o que o `Entregaveis` da Sprint 9 no PO sugere textualmente
   ("Scheduler novo (`@nestjs/schedule`, cron diario)").
2. **BullMQ repeatable job** (`queue.add(name, data, { repeat: { pattern }
   })`) na fila `kanban-column-automation` ja existente, consumido pelo
   worker atual.

Avaliacao:

- **Eficiencia para o escopo**: ambos triviais para 1 execucao/dia. Sem
  diferenca pratica de custo/latencia.
- **Runtime/deploy**: (1) introduz `@nestjs/schedule` como primeiro uso real
  no codebase — timer in-memory, vive e morre com o processo `platform-api`.
  (2) reaproveita 100% da infra ja obrigatoria (Valkey/BullMQ), sem
  dependencia nova ativada.
- **Duplicidade em escala horizontal**: este e o criterio decisivo. O
  proprio PO ja registrou o risco em "Riscos" da Sprint 9: se
  `platform-api` escalar para mais de uma instancia, um `@Cron` in-process
  roda em **cada** instancia simultaneamente (mesma classe de problema ja
  documentada para o WebSocket gateway) — precisaria de lock distribuido
  (`redlock` ou equivalente) para ser seguro, o que nao esta no escopo do
  PO nem e trivial. Um **BullMQ repeatable job** e deduplicado pelo proprio
  Redis/Valkey: o `queue.add` com `repeat` e idempotente por
  nome+padrao+dados (chamar de N instancias no boot produz um unico
  agendamento), e so um worker consome cada execucao — sem lock adicional,
  sem codigo novo de coordenacao. Isso elimina de graca exatamente o risco
  que o PO sinalizou como preocupacao.
- **Manutencao/consistencia**: usar BullMQ repeatable mantem **uma unica
  forma de agendar/enfileirar trabalho assincrono** no modulo (a mesma da
  Sprint 8), em vez de duas (timers in-process E fila). Menos superficie
  conceitual para quem le o codigo depois.
- **Testes**: BullMQ repeatable e testavel com o mesmo mock de `Queue` ja
  usado nos testes da Sprint 8 (`automation-queue.service.spec` equivalente).
  `@Cron` exige testar separadamente o agendamento do NestJS scheduler
  (harness diferente).
- **Evolucao**: se o volume crescer ao ponto de precisar sharding por
  cliente/regiao, um repeatable job na fila ja participa do mesmo modelo de
  distribuicao de trabalho entre workers que o resto do motor; um `@Cron`
  in-process precisaria ser reescrito para sair do modelo de timer local.

Decisao: **BullMQ repeatable job**, nao `@nestjs/schedule`. Isso diverge da
redacao literal do `Entregaveis` do PO, mas nao da regra de negocio (ainda
"1 avaliacao diaria, mesma fila, mesmo worker reaproveitado" — exatamente o
que o PO pediu em intencao). E uma correcao de mecanismo tecnico dentro do
que o Stack Fit Gate existe para decidir, nao uma reabertura de escopo de
produto. Ver "Decisao Do Architect" para o registro formal da divergencia.

`@nestjs/schedule` permanece no `package.json` sem uso ativo apos esta
sprint; nao ha necessidade de remove-lo (pode servir para um caso futuro
genuinamente in-process/single-instance-safe), mas nenhuma nova adocao dele
deve ocorrer sem repetir este raciocinio.

## Endpoints

Sem endpoint novo. `ColumnAutomationRuleController` (CRUD existente da
Sprint 8) passa a aceitar os 4 `trigger_type` novos e o campo
`trigger_config` no DTO de create/update, com validacao condicional
(`daysBefore`/`daysStale` obrigatorios e sujeitos a range apenas para seus
respectivos `trigger_type`).

## Validacao Planejada

- Backend: migration idempotente (`IF NOT EXISTS`/`DROP CONSTRAINT IF
  EXISTS`), teste de idempotencia por dia (mesma `dispatch_date` nao
  duplica), teste de `column_left` (hook dispara na coluna de origem, nao na
  de destino, e nao duplica com `column_entered` quando ambas as regras
  existem na mesma movimentacao), teste de `juridico_process_moved` (dispara
  so quando o card esta na coluna certa no momento do evento; nao dispara
  sem monitor ativo), teste de calculo de `card_stale` (reentrada na coluna
  reinicia contagem), teste de `due_date_approaching` (mudar/limpar
  `due_date` reabre/remove elegibilidade), teste do repeatable job
  (agendamento unico mesmo com multiplas chamadas de boot).
- Frontend: type-check, lint, testes Vitest, smoke do seletor de
  `trigger_type` com campo `N`/`X` condicional.
- Smoke manual: aplicar migration, criar as 4 regras, validar cada gatilho
  manualmente (mover card para dentro/fora de coluna, forcar `due_date` para
  hoje+N, aguardar/disparar o repeatable job manualmente em dev, simular
  `juridico_process_changed`), confirmar e-mails no Mailhog e linhas
  corretas em `kanban_automation_dispatch_log` (reativas com
  `source_activity_id`, agendadas com `dispatch_date`).

## Decisao Do Architect

- Scheduler: BullMQ repeatable job em vez de `@nestjs/schedule` — ver Stack
  Fit Gate acima. Diverge da redacao do PO, nao da regra de negocio.
- `trigger_config` como coluna nova separada de `action_config` — ver PE
  Decision acima.
- Idempotencia por dia via `source_activity_id` nullable + `dispatch_date` +
  duas `UNIQUE` parciais na mesma tabela, com `CHECK` de exclusividade — ver
  PE Decision acima.
- `column_left` reaproveita `movedActivity.id` (mesmo `CardActivity` de
  `column_entered`) como `source_activity_id`; nenhuma `CardActivity` nova e
  criada para este trigger.
- E-mail de `column_left` reaproveita o template de `column_entered`
  parametrizado por direcao; os outros 3 triggers ganham template novo cada.

## Riscos E Pendencias

- Fan-out multi-tenant do repeatable job (iterar todos os `database_ref` de
  kanban ativos) e trabalho novo de implementacao sem precedente direto no
  modulo — nao ha hoje nenhum processo de background que percorra todos os
  tenants. Escopo aceito nesta sprint (ver PE Decision, "Fan-out
  multi-tenant"), mas e o item de maior risco de estimativa da sprint.
- Consulta de `card_stale` depende de `event_payload->>'kind'` em jsonb sem
  indice dedicado; aceitavel no volume atual (baixo, por definicao do PO),
  mas se o numero de cards/regras crescer, considerar indice de expressao
  em `kanban_card_activities` — nao bloqueante para esta sprint.
- Sem cancelamento de job ja verdadeiro-hoje se a condicao deixar de valer
  entre a avaliacao do cron e o processamento assincrono na fila (ja
  registrado como fora de escopo pelo PO).
- `@nestjs/schedule` seguira no `package.json` sem uso; risco de alguem
  adotá-lo no futuro para um caso que na verdade precisa da garantia de
  dedup do BullMQ — mitigado por este documento ficar em
  `Contratos Obrigatorios` do modulo.

## Open Questions

1. Horario exato do job diario (`06:00` America/Sao_Paulo, proposto acima)
   — decisao trivial de implementacao, sem impacto de escopo; registrar aqui
   e seguir se ninguem se manifestar.
2. Range maximo aceito para `daysBefore`/`daysStale` (ex.: limitar a
   1-365?) — nao especificado pelo PO; proposta: sem limite superior alem de
   `> 0`/`>= 0` e `int4`, deixando a validacao de "faz sentido" para quem
   configura a regra. Nao bloqueante.
3. Divergencia de mecanismo de scheduler (`@nestjs/schedule` no texto do PO
   vs. BullMQ repeatable job decidido aqui) — sinalizada para o usuario
   decidir se quer registrar como aprovada tacitamente ou revisar
   explicitamente, dado que ja ha autorizacao de implementacao direta.

## Blocking Status

Nenhum bloqueio tecnico ou de produto genuino. Pendencia 3 acima e
transparencia de divergencia, nao bloqueio — segue para implementacao salvo
manifestacao em contrario do usuario, conforme autorizacao previa registrada
pelo orquestrador.
