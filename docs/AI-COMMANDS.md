# AI Commands

Este catalogo define os comandos operacionais de IA do JBoot. Eles sao workflows auditaveis, nao apenas atalhos de prompt.

## Fonte De Verdade

- Regras globais: `AGENTS.md`
- Arquitetura de IA: `docs/ai-architecture.md`
- Orquestracao: `docs/agents/orchestration/*`
- Contratos: `implementations/<project>/PROJECT_CONTRACT.md` e `MODULE_CONTRACT.md`
- Especificacoes dos comandos: `docs/ai-commands/*.md`

## Regras Gerais

- Mudancas em governanca de IA usam `docs/skills/ai-first-governance/SKILL.md`,
  geram contexto derivado quando aplicavel e executam `make ai-conformance`.
- Implementacoes funcionais e mudancas materiais de governanca devem possuir
  attestation conforme `docs/ai-governance/schemas/execution-attestation.schema.json`.
- Em PR, o preflight deve avaliar o diff real; fixture de exemplo e apenas teste
  do validador e nao evidencia da execucao corrente.
- Resposta final de sprint exige fechamento terminal verificavel: todos os
  criterios do gate concluidos, validacoes cross-project aprovadas, pendencias
  classificadas, estado da sprint atualizado e arvore Git limpa. Um commit ou
  incremento validado e somente checkpoint de progresso.

- Todo comando que prepara ou executa trabalho em `implementations/*` deve identificar `target_project`.
- Quando o alvo for Platform modular, tambem deve identificar `target_module`.
- Antes de codigo funcional, deve existir `Agent Activation` visivel.
- Pedidos em linguagem natural para "mapear implementacao", "planejar implementacao", "desenhar arquitetura", "criar servico", "nova integracao", "feature cross-module", "integrar produtos" ou equivalentes em `implementations/*` devem ser tratados como workflows auditaveis de planejamento. Antes de recomendacao tecnica/arquitetural fechada, exigir `PE Decision`, `Stack Fit Gate` quando aplicavel, `sprint_artifact`, `sprint_gate`, `open_questions` e `blocking_status`.
- Comandos de criacao de novo projeto/modulo nao podem pular `PO -> PE -> Architect -> confirmacao humana`.
- Comandos de criacao de novo projeto/modulo devem executar `Stack Fit Gate` antes da recomendacao de stack: PE classifica o tipo real da entrega, Architect compara stacks candidatas e a baseline do repositorio so pode ser escolhida com justificativa de fit.
- Perguntas abertas que afetem escopo, produto, marca, arquitetura, seguranca, dados, custo, deploy ou operacao precisam de decisao operacional antes de materializar contrato, agent, skill ou codigo.
- Comandos documentados aqui nao substituem contratos; eles selecionam e executam o fluxo correto.
- Estados de projeto seguem `docs/architecture/implementation-lifecycle.md`; nenhum comando deve promover `production_ready` sem a Definition of Done completa.
- Nova implementacao arquitetural consulta contexto/impacto e atualiza
  nodes/edges do Architecture Graph no mesmo change. Conclusao exige
  `make ai-architecture-graph-gate` aprovado.
- O PE classifica `graph_steward_required` conforme
  `docs/agents/orchestration/ai-graph-architect.md`. Acionar o steward somente
  para mudanca estrutural, semantica ambigua, drift nao mecanico ou evolucao do
  graph; o executor permanece responsavel pela escrita rotineira no mesmo diff.

## Hooks De Automacao

O runtime Claude usa hooks locais em `.claude/settings.json` para aplicar parte da governanca dos comandos:

- `PreToolUse` em `Edit|Write|MultiEdit`: bloqueia edicoes em `implementations/*` quando o payload nao contem `Agent Activation` nem comando `/jboot-*`; tambem bloqueia sinais de novo modulo/projeto sem `/jboot-new-module`.
- `PostToolUse` em `Edit|Write|MultiEdit`: emite avisos quando arquivos sensiveis de runtime ou seguranca mudam sem `/jboot-runtime-profile` ou `/jboot-security-review`.
- `Stop`: emite aviso final quando a execucao aparenta tocar `implementations/*` sem `Agent Activation` visivel no payload.

Scripts:

- `tools/ai/claude-hook-pretool.sh`
- `tools/ai/claude-hook-posttool.sh`
- `tools/ai/claude-hook-stop.sh`

Exemplo versionado de configuracao:

- `docs/ai-commands/claude-settings-hooks.example.json`

Os hooks sao guardrails de runtime. Eles nao substituem revisao humana, contratos, gates, testes, security checklist ou dev runtime profile.

Codex, Cursor e Copilot atualmente seguem estes comandos por adapters/instrucoes versionadas. Nao ha, neste repositorio, mecanismo de hook runtime equivalente ao Claude para Codex; por isso o enforcement comum desses runtimes deve ficar em `make ai-check`, CI/CD e validadores em `tools/ai/`.

## Formato De Chamada

Formato recomendado:

```text
/jboot-<acao> target=<project> module=<module-opcional> key=value
```

Exemplo:

```text
/jboot-plan-feature target=implementations/bff-jboot-platform module=modules/pdv goal="multiloja no estoque"
```

## Comandos

| Comando | Quando usar | Especificacao |
|---|---|---|
| `/jboot-plan-feature` | Planejar feature em projeto/modulo existente antes de codigo. | `docs/ai-commands/jboot-plan-feature.md` |
| `/jboot-implement-feature` | Implementar feature em projeto/modulo existente com preflight, agents, skills e testes. | `docs/ai-commands/jboot-implement-feature.md` |
| `/jboot-new-module` | Criar novo modulo, produto modular ou capability com contrato proprio em `implementations/*`. | `docs/ai-commands/jboot-new-module.md` |
| `/jboot-security-review` | Revisar mudancas sensiveis antes de merge. | `docs/ai-commands/jboot-security-review.md` |
| `/jboot-runtime-profile` | Alterar runtime local, seeds, portas, healthchecks, workers ou dependencias operacionais. | `docs/ai-commands/jboot-runtime-profile.md` |

## Fluxo Resumido

### `/jboot-plan-feature`

1. Recebe objetivo, target e modulo.
2. Carrega contratos.
3. Aciona PO e PE para escopo, criterios, riscos e testes.
4. Classifica se algum trigger exige `ai-graph-architect`.
5. Identifica agents/skills locais para a execucao futura.
6. Entrega plano sem alterar codigo funcional.

### `/jboot-implement-feature`

1. Confirma target e modulo.
2. Carrega contratos e plano, quando existir.
3. Declara `Agent Activation`.
4. Executa preflight; com API no alvo, le `make ai-api-context MODULE=<modulo>` e, se tocar API, lista consumidores afetados com `make ai-api-impact`.
5. Aciona `ai-graph-architect` somente se o preflight identificar trigger estrutural.
6. Implementa mudanca.
7. Adiciona/atualiza teste automatizado equivalente.
8. Executa validacoes (inclui `make ai-api-graph-gate` quando tocar API) e registra pendencias.

### `/jboot-new-module`

1. Aciona `PO -> PE -> Architect`.
2. Executa `Stack Fit Gate` antes de recomendar stack.
3. Classifica se nova fronteira/relacao exige `ai-graph-architect`.
4. Resolve perguntas abertas.
5. Solicita confirmacao humana.
6. Cria/troca branch dedicada.
7. Cria/atualiza `MODULE_CONTRACT.md`, agents, skills, seeds, runtime e codigo minimo quando aprovado.
8. Valida entitlement, `users:manage` e gestao de usuarios para modulo web.

### `/jboot-security-review`

1. Identifica diff, target e superficie sensivel.
2. Aciona `security-checklist`.
3. Verifica auth, autorizacao, queries, DTOs, logs, storage, dependencias e dados sensiveis.
4. Classifica achados como bloqueantes, riscos aceitos ou pendencias nao bloqueantes.

### `/jboot-runtime-profile`

1. Identifica mudanca de runtime.
2. Aciona `dev-runtime-profile`.
3. Documenta targets, portas, servicos, seeds, workers e healthchecks.
4. Atualiza contrato afetado.
5. Valida subida minima do target quando aplicavel.

## Saida Minima Esperada

Todo comando deve produzir, no minimo:

```text
AI Command:
  command:
  target_project:
  target_module:
  mode:
  status:

Agent Activation:
  using_agent:
  using_skill:
  referenced_only:
  not_using:

Validation:
  checks:
  tests:
  open_risks:
```
