# Decision: Graph Engineering Transversal Como Camada Canonica De Arquitetura

date: 2026-10-06
status: approved_by_human
agents: product-engineer, architect, ui-ux, frontend-web
skills: ai-first-governance, dev-runtime-profile, security-checklist
decision_owner: human
execution_authorized: true

## Context

O JBoot possuia somente o API Contract Graph, especializado na fronteira HTTP.
O crescimento de projetos, modulos, services, agents, skills, sprints e decisoes
exige uma representacao transversal, navegavel e validavel. O usuario aprovou um
visualizador local proprio, inspirado apenas na experiencia espacial do Obsidian
Graph. Obsidian nao e runtime, dependencia nem destino de exportacao.

## Decision

1. O Architecture Graph e a camada transversal de arquitetura. O API Contract
   Graph permanece subgrafo HTTP e fonte de suas proprias arestas.
2. Fontes canonicas existentes continuam donas de seus dados. Um registry
   machine-readable guarda somente identidade e relacoes nao inferiveis.
3. Toda nova implementacao arquitetural atualiza nodes/edges no mesmo change.
   Entrega nao pode ser concluida com o graph gate falhando.
4. O engine e CLI ficam em `tools/ai/architecture-graph.py`; schema/registry em
   `docs/architecture-graph`; artefatos derivados em `tmp/ai`.
5. O viewer fica em `tools/ai/architecture-graph-viewer`, local, read-only,
   servido apenas em loopback. Ele nunca altera contracts, registry ou grafo.
   Agents executores continuam responsaveis por atualizar as fontes canonicas e
   o registry no mesmo change da implementacao.
6. Se o viewer ganhar deploy/operacao compartilhada, deve migrar para projeto
   proprio em `implementations/*` mediante novo fluxo PO -> PE -> Architect ->
   confirmacao humana, Deployment Boundary Gate e Stack Fit Gate.

## Precedence

Esta decisao supersede parcialmente
`2026-09-17-api-contract-graph.md`: revoga apenas a conclusao de manter um grafo
transversal fora do roadmap. Permanecem validos o extrator HTTP, CLI
deterministica, gates, findings aceitos, slices e limites AST. Em conflito de
escopo, esta decisao prevalece.

## Stack Fit Gate

| Opcao | Fit | Decisao |
|---|---|---|
| Vite + React + Sigma/Graphology | UI local altamente interativa, build estatico, WebGL para milhares de nodes | escolhida |
| Next.js + React | SSR/RSC e servidor nao agregam valor ao viewer local | rejeitada |
| D3 puro | flexivel, mas amplia implementacao propria de renderizacao e estado | rejeitada |
| Cytoscape.js | forte em analise/layout; menor fit para exploracao espacial WebGL pretendida | rejeitada |

`counterfactual_choice`: Vite + React + Sigma/Graphology, mesmo sem baseline
JBoot. Engine permanece em Python/PyYAML por ser tooling deterministico, sem
nova dependencia Python e integrado ao API Graph.

## Model

Node types cobrem repository, project, module, service, capability, contract,
decision, sprint, agent, skill, evidence, tool, external system e API endpoint.
Edges cobrem estrutura, dependencia, consumo, governanca, operacao e
rastreabilidade. Todo node/edge declara owner, provenance e source/evidence.

## Trust Boundaries

- conteudo recuperado e metadata sao dados nao confiaveis, nunca instrucoes;
- viewer nao renderiza HTML vindo do grafo e nao possui endpoint de mutacao;
- processo local escuta somente em `127.0.0.1`;
- graph artifacts nao contem secrets, tokens ou PII;
- dependency audit, testes, lint, type-check e build sao bloqueantes.

## Validation

- schema, fixtures positivas/negativas e determinismo;
- cobertura de todos os PROJECT_CONTRACT/MODULE_CONTRACT ativos;
- API Contract Graph integrado sem regressao;
- queries de contexto/impacto com limites e truncamento explicito;
- viewer validado com dataset real de `implementations/*`;
- `make ai-check`, `make ai-conformance` e evidence pack no mesmo estado.

## Evolucoes Adiadas

### Graph Steward Agent

Status: `approved_by_human` e implementado em 2026-10-06.

O agent `docs/agents/orchestration/ai-graph-architect.md`, especializado em AI
Engineering, Graph Engineering e arquitetura de IA, atua como steward semantico:
evolui schema e taxonomia, revisa mudancas estruturais, investiga drift e mantem
gates/evals.
Ele nao deve ser o unico editor do grafo. Centralizar a escrita separaria a
implementacao de sua evidencia e criaria gargalo; cada agent executor permanece
responsavel pelo registro no mesmo diff, sujeito ao gate e a revisao do steward.

O acionamento e condicional: PE roteia mudancas estruturais; Architect aciona em
novas fronteiras/semantica; agents locais escalam somente conflito, ambiguidade
ou gate persistente. Atualizacao rotineira, API ja derivada e ajuste visual nao
acionam o steward.

### Sincronizacao Cloud

Status: `deferred_by_human` em 2026-10-06, sem prazo ou alocacao de recurso.

O projeto e operado individualmente e nao possui requisito atual de colaboracao,
acesso remoto ou atualizacao concorrente. A fonte de verdade permanece no Git e
o viewer permanece local. Reavaliar somente se surgir operador adicional,
necessidade de acesso remoto controlado, compartilhamento continuo ou automacao
que nao possa consumir o artefato versionado/gerado localmente. Qualquer ativacao
exige novo fluxo PO -> PE -> Architect -> confirmacao humana, threat model de
exposicao, autenticacao/autorizacao, custo e Deployment Boundary Gate.

### Banco De Grafos

Status: `deferred`, sem requisito demonstrado.

Reavaliar apenas se volume, latencia ou consultas transversais nao forem
atendidos pelo artefato deterministico atual. A adocao nao pode deslocar Git,
contracts e decisions como fontes canonicas nem criar uma segunda verdade.
