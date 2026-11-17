# Arquitetura de IA

## Objetivo

Centralizar o uso de IA para que prompts, modelos, ferramentas, custos, observabilidade e seguranca possam evoluir sem acoplamento ao restante da aplicacao.

## Estado Atual

O JBoot e `AI-first` em dois eixos que devem ser avaliados separadamente:

- `AI-first engineering`: conformant. O claim e sustentado pelo profile
  executavel em `docs/ai-governance/conformance/ai-first.yaml` e somente e
  valido para revisionamentos onde `make ai-conformance` esteja aprovado.
- `AI product runtime`: planejado. A fronteira `src/ai` esta reservada, mas nao
  ha ainda provider, prompt registry, agent runtime ou telemetria de chamadas
  implementados no hub raiz.

Nenhum documento pode usar a governanca de engenharia como evidencia de que um
produto ja executa modelos em runtime. A ativacao do segundo eixo exige decisao
arquitetural, contratos estruturados, testes/evals e observabilidade.

## AI-first Engineering Harness

O `AI-first Engineering Harness` e a camada canonica de execucao, validacao,
evidencia e controle para qualquer agente de IA que atue no repositorio JBoot.
Ele materializa a governanca de engenharia em checks executaveis, preflights,
evals, attestations, contexto deterministico e adapters de runtime.

Esta camada e fonte canonica operacional para agentes. Documentos, adapters,
MCPs, plugins, prompts ou configuracoes de IDE podem expor ou consumir partes
do harness, mas nao substituem seus contratos executaveis.

Responsabilidades do harness:

- resolver alvo de execucao antes de escrita: projeto, modulo, agents, skills,
  contratos e gates aplicaveis;
- validar pre-condicoes de governanca, lifecycle, contexto, adapters,
  permissao de tools e perguntas abertas;
- executar evals deterministicos, positivos, negativos e adversariais;
- gerar e verificar contexto de IA com digest e freshness;
- registrar evidencia, metricas disponiveis, attestations e proveniencia;
- falhar fechado quando controle bloqueante nao passar;
- preservar a separacao entre `AI-first engineering` e `AI product runtime`.

Componentes canonicos atuais do harness:

- `docs/ai-governance/conformance/ai-first.yaml`;
- `docs/ai-governance/conformance/AI_FIRST_CONFORMANCE.md`;
- `docs/ai-governance/security/agentic-threat-model.md`;
- `docs/ai-governance/security/tool-approval-matrix.yaml`;
- `docs/ai-governance/evals/scenarios.yaml`;
- `tools/ai/*`;
- `make ai-context`, `make ai-adapters`, `make ai-evals`,
  `make ai-conformance` e `make ai-evidence`.

## Graph Engineering

O Architecture Graph transversal agrega contracts, governance, registry e o
API Contract Graph em nodes/edges tipados com owner e provenance. O engine e
gate canonicos vivem em `tools/ai/architecture-graph.py`; o viewer local proprio
em `tools/ai/architecture-graph-viewer` consome somente o artefato derivado em
modo read-only e escuta em loopback. Obsidian e apenas referencia de experiencia
visual, nao runtime ou dependencia.

Toda nova implementacao arquitetural atualiza o grafo no mesmo change e executa
`make ai-architecture-graph-gate`. A decisao normativa e
`docs/ai-governance/records/decisions/2026-10-06-architecture-graph-engineering.md`.
O `ai-graph-architect` e steward condicional de schema, semantica, engine e
drift; o PE roteia seus triggers e o agent executor preserva a responsabilidade
de escrita nas fontes canonicas.

MCP pode ser usado futuramente como adapter de borda para expor tools,
resources ou prompts do harness a hosts externos. Essa decisao nao promove MCP
a fonte de verdade, nao substitui `src/ai` no runtime de produto e nao autoriza
acesso a escrita, banco, deploy ou dados sensiveis sem controles do harness.

## Premissa operacional

O operador padrao do sistema e de nivel SENIOR. A arquitetura deve permitir inspecao, override controlado, auditoria, avaliacao de qualidade, rastreabilidade de decisoes e diagnostico tecnico profundo.

Simplicidade e desejavel quando reduz erro operacional, mas nao quando remove contexto necessario para decisao tecnica qualificada.

## Camadas

```text
app -> core -> ai -> integrations
```

- `app`: interfaces, rotas, controllers, jobs e comandos.
- `core`: regras de negocio e contratos estaveis.
- `ai`: clientes, agentes, prompts, memoria, avaliadores e guardrails.
- `integrations`: provedores externos, armazenamento, filas, busca vetorial e APIs de terceiros.

## Componentes recomendados

- `docs/agents/orchestration`: definicao operacional dos agentes de decisao.
- `docs/agents/stacks`: catalogo de referencia por stack.
- `implementations/<project>/agents`: agentes executores locais por projeto.
- `implementations/<project>/skills`: skills locais por projeto.
- `src/ai/providers`: planejado; adaptadores para modelos e provedores.
- `src/ai/prompts`: planejado; prompts versionados.
- `src/ai/agents`: planejado; agentes com objetivos e ferramentas claras.
- `src/ai/tools`: planejado; ferramentas que agentes podem chamar.
- `src/ai/evals`: planejado; testes de qualidade, regressao e seguranca do runtime.
- `src/ai/telemetry`: planejado; custos, latencia, traces e eventos de chamadas.

## Agentes iniciais

- `product-owner`: agente de detalhamento funcional e criterios de aceite.
- `product-engineer`: agente de arquitetura operacional de IA. Identifica modo de execucao, projeto alvo, contratos, agents/skills locais, validadores e evals.
- `architect`: agente principal de arquitetura tecnica. Compara alternativas, recomenda stack/arquitetura, limites, contratos, riscos e agents locais necessarios.
- `ai-graph-architect`: steward de Graph Engineering e arquitetura de IA,
  acionado apenas para mudancas estruturais, relacoes ambiguas, drift nao
  mecanico ou evolucao do proprio Architecture Graph.
- `marketing-brand`: agente especializado em posicionamento publico, marca, copy, landing pages, SEO publico, campanhas e comunicacao comercial. Deve ser acionado antes de implementacao visual/textual quando a entrega afetar divulgacao da marca ou percepcao publica. Usa `docs/mkt` como fonte inicial de assets, `jb-cyan` como padrao visual de marca e `jb-cyan-white` como variacao clean/clara, salvo decisao humana em contrario.
- `ui-ux`: agente especializado em fluxo de interacao, hierarquia de informacao, reuso de template/preset e padroes de tela. Deve ser acionado antes de agent local `frontend-*` quando a entrega em `implementations/*` incluir tela, fluxo de usuario ou componente novo de interface web.
- `human-confirmation`: aprovacao explicita do usuario quando stack, arquitetura, custo ou risco relevante forem afetados.
- `implementation-agents`: agentes executores locais em `implementations/<project>/agents/*`, acionados via `PROJECT_CONTRACT.md`.

O fluxo padrao sera: pedido -> `product-owner` detalha escopo -> `product-engineer` define modo, `target_project`, contratos e artefatos reutilizaveis -> `architect` recomenda stack/desenho tecnico com tabela de pros/contras quando aplicavel -> `marketing-brand` e/ou `ui-ux` entram quando a natureza da entrega exigir -> usuario confirma quando necessario -> agente local do projeto implementa -> avaliacao tecnica e de IA valida resultado -> `product-engineer` revisa retrabalho, qualidade e memoria operacional.

Quando o alvo estiver em `implementations/*`, o `PROJECT_CONTRACT.md` do projeto e a fonte de verdade. Agentes globais de stack em `docs/agents/stacks/*` sao subagents de referencia para decisao, Stack Fit Gate ou atualizacao de agentes locais, nao executores padrao.

## Stack Fit Gate

Para qualquer novo projeto, modulo, produto, landing, app, BFF, worker, servico ou integracao em `implementations/*`, a decisao de stack deve ser feita por fit do escopo real, nao por baseline do hub.

Antes de recomendar stack, o PE e o Architect devem:

- classificar a entrega: conteudo estatico, marketing tecnico, app interativo, dashboard operacional, BFF/API, worker, servico interno, integracao, mobile, desktop, dados ou IA;
- listar stacks candidatas a partir de `docs/agents/stacks/*` e `docs/stacks/*`;
- comparar eficiencia para escopo, SEO, interatividade, runtime, deploy, custo operacional, manutencao, testes, observabilidade e evolucao;
- rejeitar explicitamente stacks menos aderentes, incluindo baselines do repositorio quando elas forem excesso de framework ou pior fit;
- manter `decision_status: pending_human_confirmation` ate aprovacao humana quando a decisao afetar stack, arquitetura, custo, runtime ou manutencao.

Baseline e ponto de partida para comparacao, nao decisao automatica.

## Governanca De Novo Projeto

Qualquer novo projeto, modulo, produto, landing, app, BFF, worker, servico ou integracao em `implementations/*` exige o fluxo:

```text
PO -> PE -> Architect -> confirmacao humana -> PROJECT_CONTRACT/MODULE_CONTRACT -> agents/skills locais -> implementacao
```

A IA nao pode pular esse fluxo por inferencia propria. Contexto suficiente pode reduzir perguntas, mas nao elimina a ativacao dos agentes nem a confirmacao humana antes de materializar contrato ou codigo.

Perguntas abertas devem ter decisao operacional antes de prosseguir:

- respondida pelo usuario;
- marcada pelo usuario como pendencia nao bloqueante;
- assumida temporariamente com risco registrado e aprovado pelo usuario.

Quando a entrega envolver marca, landing, divulgacao, SEO publico, campanha ou copy comercial, o fluxo deve incluir `docs/agents/orchestration/marketing-brand.md` antes da implementacao visual/textual.

## Contrato minimo de uma chamada de IA

Toda chamada deve registrar:

- caso de uso;
- versao do prompt;
- provedor e modelo;
- parametros relevantes;
- entrada sanitizada ou referencia segura;
- saida;
- custo estimado;
- latencia;
- status e erro, se houver.

## Guardrails

- Validar schema de respostas estruturadas.
- Bloquear ou revisar acoes de alto impacto.
- Reduzir dados sensiveis antes de enviar a provedores externos.
- Separar contexto recuperado, instrucao de sistema e entrada do usuario.
- Usar avaliacao automatizada para prompts essenciais.
- Expor evidencias, fontes, parametros e limites conhecidos quando a IA influenciar decisao operacional.

## Decisoes em aberto

As decisoes abaixo pertencem exclusivamente a ativacao futura do runtime de
produto. Elas nao reduzem a conformidade AI-first engineering.

- Stack principal:
- Provedor inicial:
- Banco relacional:
- Busca vetorial:
- Fila/background jobs:
- Observabilidade:
- Politica de retencao de dados:
