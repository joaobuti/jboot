# /jboot-plan-feature

## Objetivo

Planejar uma feature em projeto ou modulo existente antes de qualquer codigo funcional.

Este comando reduz implementacao por inferencia, obriga leitura de contratos e transforma uma intencao de produto em plano tecnico auditavel.

## Uso

```text
/jboot-plan-feature target=<project> module=<module-opcional> goal="<objetivo>"
```

Exemplos:

```text
/jboot-plan-feature target=implementations/bff-jboot-platform module=modules/pdv goal="multiloja no estoque"
/jboot-plan-feature target=implementations/app-jboot-next-platform module=modules/juridico goal="configurar sessao eproc"
```

## Entradas

Obrigatorias:

- `target`: projeto alvo.
- `goal`: objetivo da feature.

Opcionais:

- `module`: modulo alvo.
- `gate`: sprint gate relacionado.
- `constraints`: restricoes conhecidas.
- `non_goals`: itens fora de escopo.

## Preflight

1. Identificar `target_project`.
2. Identificar `target_module` quando o projeto for modular.
3. Carregar `PROJECT_CONTRACT.md`.
4. Carregar `MODULE_CONTRACT.md` quando aplicavel.
5. Verificar se a solicitacao cria novo projeto/modulo. Se criar, interromper e redirecionar para `/jboot-new-module` ou futuro `/jboot-new-project`.
6. Quando o modulo ou servico alvo ja tiver API, ler `make ai-api-context MODULE=<modulo|servico>` para mapear rotas, consumidores e dependencias entre modulos antes de propor mudancas cross-module.
7. Ler `make ai-architecture-context NODE=<id>`/`make ai-architecture-impact NODE=<id>` e declarar nodes/edges, owner, lifecycle e provenance planejados.
8. Classificar `graph_steward_required` pelos triggers de
   `docs/agents/orchestration/ai-graph-architect.md`; atualizacao rotineira nao
   aciona o steward.

## Agents E Skills

Usar:

- `docs/agents/orchestration/product-owner.md`: detalhar escopo, usuarios, criterios de aceite e perguntas abertas.
- `docs/agents/orchestration/product-engineer.md`: mapear projeto, modulo, contratos, tests, gates, agents e skills locais.

Referenciar quando aplicavel:

- `docs/agents/orchestration/architect.md`: somente se houver decisao relevante de arquitetura, custo, seguranca ou contrato.
- `docs/agents/orchestration/ai-graph-architect.md`: somente para mudanca
  estrutural/semantica, relacao cross-project ambigua, drift nao mecanico ou
  evolucao do proprio Architecture Graph.
- Agents/skills locais do projeto: como referencia de execucao futura, sem executar codigo.

## Fluxo

1. Normalizar objetivo e target.
2. Ler contratos relevantes.
3. Classificar tipo de mudanca: UI, backend, dados, runtime, seguranca, IA, integracao ou cross-project.
4. Levantar perguntas abertas.
5. Separar perguntas bloqueantes de pendencias nao bloqueantes.
6. Definir criterios de aceite.
7. Definir testes automatizados esperados.
8. Definir agents/skills a usar na implementacao.
9. Entregar plano.

## Bloqueios

Bloquear planejamento como feature comum quando:

- a tarefa criar novo projeto, modulo, produto, landing, app, BFF, worker, servico ou integracao;
- a tarefa pedir mapeamento de implementacao, desenho arquitetural, novo servico, nova integracao ou feature cross-module em `implementations/*` sem `PE Decision`, `Stack Fit Gate` quando aplicavel, `sprint_artifact`, `sprint_gate`, `open_questions` e `blocking_status`;
- nao houver target suficientemente claro;
- perguntas abertas afetarem escopo, produto, marca, arquitetura, seguranca, dados, custo, deploy ou operacao e o usuario nao decidir nem aprovar pendencia/risco.

## Saida Esperada

```text
AI Command:
  command: /jboot-plan-feature
  target_project:
  target_module:
  mode: planning
  status:

Feature Plan:
  objective:
  in_scope:
  out_of_scope:
  acceptance_criteria:
  impacted_contracts:
  impacted_domains:
  required_tests:
  required_validations:
  open_questions:
  risks:

Planned Agent Activation:
  using_agent:
  using_skill:
  referenced_only:
  not_using:

PE Decision:
  execution_mode:
  delivery_type:
  target_project:
  target_module:
  sprint_artifact:
  sprint_gate:
  stack_fit_gate:
  open_questions:
  blocking_status:
  graph_steward_required:
  graph_steward_trigger:
```

## Nao Faz

- Nao cria branch.
- Nao altera codigo funcional.
- Nao cria contratos.
- Nao substitui `/jboot-new-module`.
