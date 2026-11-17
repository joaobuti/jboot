# PDV Sprint 1 - Execution Review

## Status

`non_conformant_process`

## Motivo

A Sprint 1 foi implementada e validada tecnicamente, mas a execucao nao apresentou feedback explicito de ativacao dos agents e skills locais antes do codigo.

Isso quebra a rastreabilidade definida pela arquitetura de IA do projeto.

## Impacto

- Nao e possivel auditar, pela conversa, quais agents/skills foram efetivamente acionados.
- Os contratos locais foram usados como referencia operacional, mas isso nao equivale a ativacao formal.
- A entrega tecnica pode ser aproveitada, mas o processo de execucao nao atende ao padrao de qualidade esperado.

## Correcao De Processo Aplicada

Foram adicionadas regras explicitas em:

- `AGENTS.md`
- `docs/agents/orchestration/README.md`
- `docs/agents/orchestration/product-engineer.md`
- `implementations/bff-jboot-pdv/PROJECT_CONTRACT.md`
- `implementations/app-jboot-pdv-web/PROJECT_CONTRACT.md`
- `implementations/app-jboot-pdv-mobile/PROJECT_CONTRACT.md`
- `implementations/svc-jboot-fiscal/PROJECT_CONTRACT.md`

## Nova Trava

Antes de qualquer codigo em `implementations/*`, deve existir um bloco visivel:

```text
Agent Activation:
  project:
  using_agent:
  using_skill:
  referenced_only:
  not_using:
```

Sem esse bloco, a execucao deve ser considerada feita sem agents/skills.

## Decisao

Manter o codigo da Sprint 1 como implementacao tecnica validada, mas registrar a execucao como processo nao aderente.

Futuras sprints devem bloquear codigo ate que o preflight e o bloco `Agent Activation` sejam apresentados ao usuario.
