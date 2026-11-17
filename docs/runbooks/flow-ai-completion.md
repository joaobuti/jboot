# Flow — Confirmacao Integral Da IA

O gatilho **Quando o card e atualizado pela IA** somente dispara apos uma
confirmacao estruturada explicita da conclusao de TODAS as tarefas do prompt.
Texto como "pronto", comentario ou resposta `succeeded` do provider nao bastam.
Nenhuma confirmacao aprova documentos nem altera checklist/revisao humana.

## Prompt Obrigatorio Para Rotina Claude

Adicionar ao prompt da rotina:

> Execute todas as atividades solicitadas. Registre os resultados no card.
> Apenas quando TODAS as atividades estiverem concluidas com sucesso, sem
> falhas, tarefas pendentes, incertezas ou revisao humana pendente, chame a
> ferramenta `flow_complete_automation` como ultima atividade, usando o `run_id`,
> `board_id` e `card_id` recebidos. Envie `confirmation` igual a
> `{"version":1,"status":"succeeded","allTasksCompleted":true}`.
> Se alguma atividade nao estiver concluida, explique a pendencia no card e
> NAO chame a ferramenta de conclusao. Um comentario nao conclui a execucao.

Tool MCP recebe:

```json
{
  "runId": "<run_id recebido>",
  "boardId": "<board_id recebido>",
  "cardId": "<card_id recebido>",
  "confirmation": {"version": 1, "status": "succeeded", "allTasksCompleted": true}
}
```

A ferramenta exige o mesmo dono, tenant e card de uma execucao `dispatched`,
com permissao do conector e card visivel. Repeticao nao gera novo evento.
Comentarios antigos com `runId` continuam aceitos, mas nao concluem runs.
Recarregue as tools do conector apos atualizar o backend.

## Prompt Obrigatorio Para Agente De API

Habilitar explicitamente a ferramenta **Confirmar conclusao integral da
automacao** (`kanban.automation.complete`) na versao do agente. O manifest
passa a usar `2026-10-21.v1`; versoes anteriores continuam executando suas
ferramentas, mas nao geram conclusao sem uma confirmacao explicita.

Adicionar ao prompt:

> Execute todas as atividades solicitadas e registre os resultados pelas
> ferramentas autorizadas. Somente quando TODAS estiverem concluidas com
> sucesso, faca como ultima function call `kanban_automation_complete`, com
> `{"version":1,"status":"succeeded","allTasksCompleted":true}`.
> Se houver falha, tarefa pendente ou revisao humana, nao confirme a conclusao.

As instrucoes de conclusao tambem acompanham o input enviado pelo Flow. Os
prompts privados existentes nao sao sobrescritos. Sem confirmacao, o run fica
`awaiting_confirmation`; com proposta que exige revisao, `review_required`.

## Regra De Movimentacao

Em Automacoes da coluna, selecionar o gatilho, **Ir para a coluna** e o destino.
O destino deve ser ativo, do mesmo quadro e diferente da origem. Para o novo
gatilho, a acao suportada e movimentacao. Email/execucao IA preservam os
gatilhos ja suportados; `move_card` tambem funciona nos gatilhos existentes.

O job de recovery existente avalia movimentos a cada minuto, em lotes de ate
100 candidatos por tenant. Dono da regra precisa manter entitlement,
membresia do cliente, `flow:write` e `flow:admin`; visibilidade, papel no quadro, transicao,
ACL, checklist e WIP passam pelo `CardsService.move`. O provider nunca escolhe
a coluna de destino. Se o card ja mudou de coluna, a tentativa e ignorada.

Diagnostico: `kanban_movement_automation_outbox` registra `pending`,
`processing`, `completed`, `skipped`, `failed`, tentativas, regra e codigo
sanitizado. Movimento e receipt sao atomicos; claim antigo nao pode concluir.
Reentrega nao move novamente. Falhas transitorias tentam ate cinco vezes;
claims abandonados por cinco minutos sao recuperados ou encerrados por limite.
Cadeias automaticas acima de dez movimentos param com `automation_chain_limit`.
Nao reprocessar uma regra de negocio rejeitada sem revisar a causa.

Nao ha novo processo, fila, porta ou provider. Migration aditiva:
`docker/postgres/init/092_kanban_ai_completion_move.sql`.
