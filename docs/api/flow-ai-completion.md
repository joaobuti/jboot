# Flow — Extensao De Automacoes

Escopo: `docs/product/flow-ai-completion-sprints.md`.

API existente `POST /kanban/boards/:boardId/columns/:columnId/automation-rules`:

```json
{
  "triggerType": "ai_completed",
  "actionType": "move_card",
  "actionConfig": {"toBoardColumnId": "<UUID da coluna de destino>"},
  "triggerConfig": {},
  "isActive": true
}
```

`recipientRole` e proibido para `move_card`. `toBoardColumnId` precisa ser UUID,
coluna ativa do mesmo tenant/quadro e diferente da coluna da regra. Rejeicao:
400 de combinacao/configuracao; 403 sem `flow:admin`/board_admin; 404 para recurso
inexistente no contexto. PATCH da regra valida os valores efetivos apos merge;
desativar e permitido mesmo se a coluna de destino tiver sido arquivada.

O novo gatilho aceita `move_card`; gatilhos anteriores tambem podem usar essa
acao. Regras de IA continuam limitadas a entrada/saida da coluna. Os campos
de resposta continuam os de `ColumnAutomationRuleRow`, com os novos valores de enum.

Contrato MCP/confirmation API e diagnostico:
`docs/runbooks/flow-ai-completion.md`. O evento interno
`ai.automation_completed` contem somente IDs/proveniencia, sem texto do prompt
ou resposta da IA. Evento e transicao do run para completed sao atomicos.
