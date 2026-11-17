# Orchestration Agents

Este grupo governa decisoes, escopo, arquitetura, contratos e qualidade. Ele nao substitui os agentes locais de implementacao.

## Grupos

| Grupo | Local | Responsabilidade |
|---|---|---|
| Orquestracao | `docs/agents/orchestration/*` | PO, PE, Architect, UI/UX, governanca, decisoes assistidas, fluxo e contratos. |
| Referencia de stack | `docs/agents/stacks/*` | Catalogo tecnico reutilizavel por stack. Nao e executor padrao quando ja existe projeto alvo. |
| Implementacao | `implementations/<project>/agents/*` e `implementations/<project>/skills/*` | Execucao no contexto real do projeto, conforme `PROJECT_CONTRACT.md`. |

## Fluxo Padrao

```text
pedido -> product-owner -> product-engineer -> architect? -> ai-graph-architect? -> ui-ux? -> human-confirmation? -> project-contract -> implementation-agent -> validacao -> product-engineer
```

`architect` e `human-confirmation` entram quando houver decisao relevante de stack, arquitetura, custo, risco, governanca ou mudanca de contrato. `ui-ux` entra quando a entrega tiver tela, fluxo de usuario ou componente novo, conforme `docs/agents/orchestration/ui-ux.md`, e precede o agent local `frontend-*` que executa a implementacao.

`ai-graph-architect` entra condicionalmente pelos triggers definidos em
`docs/agents/orchestration/ai-graph-architect.md`: mudanca de schema/taxonomia,
engine/gate/eval estrutural, relacao cross-project ambigua, migracao/backfill,
drift nao mecanico, mudanca do contrato do viewer, cloud sync, graph database ou
arquitetura de IA que altere fronteiras representadas. Atualizacoes rotineiras
continuam com o agent executor e nao acionam o steward.

## Roteamento Do AI Graph Architect

| Agent de origem | Quando aciona | Quando nao aciona |
|---|---|---|
| `product-engineer` | classifica qualquer trigger estrutural e coordena o handoff | node/edge rotineiro coberto pelo modelo atual |
| `architect` | nova fronteira, relacao cross-project, arquitetura de IA ou semantica ambigua | decisao ja representavel sem mudar o modelo |
| `product-owner` | nao aciona diretamente; sinaliza requisito ao PE | escopo funcional comum |
| agents locais | gate persiste, fontes conflitam ou falta representacao semantica | correcao mecanica ou registro em tipos existentes |
| `ui-ux` / `frontend-*` | contrato de interacao do Architecture Graph Viewer muda | CSS, contraste ou ajuste visual isolado |
| stack-reference agents | reportam impacto a PE/Architect; nao acionam diretamente | avaliacao de stack sem impacto no grafo |
| `marketing-brand` | exposicao publica do viewer/grafo, sempre via PE | viewer local read-only |

O steward revisa semantica e gates; nunca assume escrita exclusiva. O executor
que implementa a mudanca permanece responsavel por atualizar as fontes
canonicas no mesmo diff.

Para novo projeto, modulo, produto, landing, app, BFF, worker, servico ou integracao em `implementations/*`, `architect` e `human-confirmation` deixam de ser opcionais; `ui-ux` tambem passa a ser obrigatorio sempre que houver interface web nova:

```text
pedido -> product-owner -> product-engineer -> architect -> ui-ux -> human-confirmation -> git-branch -> project-contract -> agents/skills locais -> implementation-agent(frontend-*)
```

A IA nao pode pular esse fluxo por inferencia propria.

Depois da confirmacao humana e antes de criar contrato, estrutura de diretorios, agents, skills ou codigo, o executor deve criar/trocar automaticamente para uma branch Git dedicada seguindo as convencoes ja existentes no repositorio. A branch nao deve misturar projetos/features sem relacao.

## Stack Fit Gate

Novo projeto, modulo, produto, landing, app, BFF, worker, servico ou integracao em `implementations/*` exige decisao de stack por fit do escopo real.

- O PE classifica o tipo de entrega e requisitos dominantes.
- O Architect compara stacks candidatas do catalogo, inclusive alternativas mais especificas que a baseline.
- A recomendacao deve explicar por que a stack escolhida e mais eficiente para escopo, SEO/interatividade quando aplicavel, runtime, deploy, manutencao, testes e evolucao.
- Baseline do repositorio e fallback justificado, nao escolha automatica.
- Quando a entrega for site estatico, documentacao, portfolio, landing ou marketing tecnico com pouca interatividade, Astro deve ser comparado antes de Next.js.

## Perguntas Abertas

Toda `open_question` levantada por PO, PE ou Architect deve receber decisao operacional antes de criar contrato, agent, skill ou codigo:

- respondida pelo usuario;
- marcada pelo usuario como pendencia nao bloqueante;
- assumida temporariamente com risco registrado e aprovado pelo usuario.

Se a pergunta afetar escopo, produto, marca, arquitetura, seguranca, dados, custo, deploy ou operacao, o agente deve perguntar ao usuario se quer decidir agora ou registrar para depois.

## Marca E Divulgacao

Projetos que envolvem marca, landing page, site institucional, SEO publico, campanhas, copy comercial ou posicionamento publico exigem agent especializado de marketing/brand antes de implementacao visual ou textual. Se esse agent ainda nao existir, propor sua criacao antes de implementar.

O agent oficial e:

```text
docs/agents/orchestration/marketing-brand.md
```

Assets oficiais iniciais de marca ficam em:

```text
docs/mkt/
```

O default visual de marca e `jb-cyan`, referenciado por:

```text
docs/mkt/jb-cyan.jpg
```

## UI/UX

Entregas com tela, fluxo de usuario ou componente novo em `implementations/*` exigem agent especializado de UI/UX antes da implementacao visual, precedendo o agent local `frontend-*`. O agent prioriza sempre reuso do template/preset e das skills de UI ja existentes sobre criar padrao novo.

O agent oficial e:

```text
docs/agents/orchestration/ui-ux.md
```

Template/preset de referencia:

```text
implementations/templates/original/Next-TS
implementations/app-jboot-identity-admin
implementations/app-jboot-next-platform/skills/platform-crud-ui.md
```

`ui-ux` cobre produto/operacao interna (admin, platform, consoles autenticados). `marketing-brand` cobre marca/publico. Quando a entrega tiver as duas naturezas, os dois agents sao acionados, cada um no seu dominio.

## Regra Critica

Antes de implementar em `implementations/*`, o `product-engineer` deve identificar o `target_project`.

- Se o projeto for claro, carregar somente o `PROJECT_CONTRACT.md` e os agents/skills locais necessarios.
- Se o projeto for ambiguo, pedir confirmacao ou inferir pelo caminho citado e declarar a inferencia.
- Se a tarefa cruzar projetos, carregar cada contrato afetado e declarar limites entre frontend, backend, dados e infra.
- Agentes globais de stack servem como referencia para criar ou atualizar agentes locais, nao como executor principal de um projeto existente.

## Rastreabilidade Obrigatoria

Nenhuma execucao em `implementations/*` deve ser considerada aderente ao fluxo se nao houver declaracao explicita de ativacao.

Formato minimo antes de codigo:

```text
Agent Activation:
  using_agent:
    - <path-do-agent>: <responsabilidade nesta tarefa>
  using_skill:
    - <path-da-skill>: <responsabilidade nesta tarefa>
  not_using:
    - <agent/skill>: <motivo>
```

Regras:

- `using_agent` e `using_skill` nao sao decorativos; eles sao o registro de auditoria da execucao.
- Se um agent/skill for apenas lido como referencia, declarar `referenced_only`, nao `using`.
- Se nao houver declaracao explicita, registrar a execucao como feita sem agents/skills.
- A falta desse bloco antes de codigo e falha de qualidade, mesmo que o codigo compile.
- Em tarefas cross-project, repetir o bloco por projeto.
