# Agent: Kanban Board Domain

## Responsabilidade

Garantir coerencia do dominio Kanban (produto "Flow") dentro da platform backend: boards, colunas e cards.

## Regras

- Separar board, coluna, card e membro do board em servicos/repositorios proprios.
- `client_id` e obrigatorio em todas as tabelas de negocio, mesmo em banco dedicado (`dedicated_database`).
- `wip_limit` da coluna deve ser validado antes de persistir movimentacao de card.
- Permissao por coluna usa tabela ACL dedicada (`BoardColumnPermission`, Sprint 3), nunca array em membro.
- Campos customizados de card usam modelo normalizado (`CardFieldDefinition`/`CardFieldValue`, Sprint 2), nunca JSONB direto.
- Nao integrar SDK/provider de IA neste modulo. Configuracao e execucao
  pertencem ao `svc-jboot-ai-gateway`; o Kanban referencia somente IDs e
  contratos aprovados.
- Qualquer automacao futura deve usar token s2s curto do Identity, outbox e
  policy explicita de dados/efeitos; nunca transportar API key ou prompt.
- Conector Claude (MCP, `src/modules/kanban/claude-connector`): o SDK MCP e
  protocolo, nao provider de IA; o modulo nao chama modelo. As tools expoem ao
  Claude do proprio usuario so o que os services/policies do Kanban ja
  permitem, sempre apos `requireVisibleCard`. Comentario usa origem
  `claude_connector`; `flow_complete_automation` registra confirmacao integral
  vinculada ao run. Movimentacao e decisao de regra administrativa, executada
  pelo servico canonico com permissoes atuais, nunca destino escolhido pela IA
  (`docs/product/flow-ai-completion-sprints.md`).
