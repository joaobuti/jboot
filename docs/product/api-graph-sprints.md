# API Contract Graph Sprints

## Objetivo

Mapear, por analise estatica, cada rota HTTP exposta pelos servicos do monorepo e cada chamada que a consome, para detectar drift de contrato na fronteira HTTP e fornecer blast radius cross-layer a humanos e agents.

Origem: avaliacao do projeto externo `code-review-graph` (grafo AST generico via MCP). A avaliacao concluiu que ele nao liga controller NestJS ao cliente do Next, porque o front redeclara DTOs a mao e nao ha import cross-package. Este tooling cobre exatamente essa aresta. Decisao registrada em `docs/ai-governance/records/decisions/2026-09-17-api-contract-graph.md`.

## Escopo

| Item | Valor |
|---|---|
| `target_project` | `repository-root` (tooling de governanca, fora de `implementations/*`) |
| Entregavel | `tools/ai/api-graph.py`, `tools/ai/api-graph.yaml`, `make ai-api-graph` |
| Artefato | `tmp/ai/api-graph.json` (gerado, ignorado pelo git, deterministico) |
| Dependencias novas | nenhuma (somente PyYAML, ja usado pelo harness) |
| Controles relacionados | `AIF-CTX-001`, `AIF-EVAL-001`, `AIF-SEC-002` |

Nao ha `MODULE_CONTRACT.md` aplicavel: o tooling nao pertence a projeto ou modulo de `implementations/*`. Este documento e o decision record sao as fontes de contrato.

## Modelo

- No canonico: endpoint normalizado `METODO /segmento/:param`.
- Provedores: NestJS (`@Controller` + decorators de metodo), Laravel (`routes/*.php` com `apiPrefix` e grupos), FastAPI (`APIRouter`/`FastAPI` + `include_router`), Next.js (`app/**/route.ts`, `pages/api/**`) e Go 1.22 `net/http` (`ServeMux`).
- Contratos OpenAPI podem ser vinculados ao provider; rota implementada e rota
  documentada precisam coincidir, e schemas de request/response alimentam
  contexto e impacto.
- Consumidores: TypeScript (`fetch` e wrappers descobertos automaticamente), Python (`httpx`/`requests`), PHP (`Http::`) e Go (`net/http`, URL ligada por env var).
- Binding: toda base de URL resolve para uma env var, e cada env var pertence a um servico em `tools/ai/api-graph.yaml`. Chamada relativa (`fetch("/api/...")`) liga ao app Next da propria origem.
- Status de chamada: `resolved`, `orphan`, `method_mismatch`, `wrong_service`, `unresolved`, `external`, `same_origin`, `path_in_environment`.

## Sprint 1: Extrator e drift report

Estado: **concluida** — relatorio revisado e aceito pelo usuario em 2026-09-17.

Criterios de aceite:

- [x] Extrair rotas dos 5 servicos com backend e das route handlers dos 2 apps Next.
- [x] Extrair chamadas dos 9 consumidores configurados.
- [x] Reportar rota orfa, divergencia de metodo, servico errado e chamada nao resolvida.
- [x] Saida JSON deterministica mais relatorio humano; `make ai-api-graph`.
- [x] Teste unitario com fixture positiva e negativa em `tools/ai/tests/test_api_graph.py`.
- [x] Detector validado por mutacao: remover rotas reais gera `orphan_call`/`method_mismatch` na linha exata do consumidor.
- [x] Relatorio revisado por humano antes de virar bloqueante.

Desvio registrado no gate: o gate proposto previa "extrator rodando dentro do container". Isso aplicava a regra de `implementations/*` ao tooling de raiz por engano. Por convencao do repositorio, o harness `tools/ai/*` roda com `python3` no host (`Makefile`, GitHub Actions e GitLab CI), e o extrator segue a mesma convencao.

### Resultado da primeira execucao (2026-09-17)

| Metrica | Valor |
|---|---|
| Rotas extraidas | 285 (platform 197, identity 56, fiscal 12, juridico-data 6, worker 14, apps Next 0) |
| Chamadas | 283 |
| `resolved` | 247 |
| `orphan` | 16 |
| `method_mismatch` / `wrong_service` | 0 / 0 |
| `unresolved` | 0 |
| `external` | 19 (Meta Graph, DataJud, DJEN) |
| Rotas sem consumidor modelado | 48 (info) |
| Tempo de execucao | ~1 s |

Achados:

1. **16 chamadas orfas** em thunks do template Velzon (`slices/auth/authSlice.ts`, `slices/users/usersSlice.ts`, `slices/settings/settingsSlice.ts`), 8 em `app-jboot-next-platform` e 8 em `app-jboot-identity-admin`. Chamam `/api/auth/*`, `/api/users*` e `/api/users/:id/settings`, e nenhum dos apps tem route handler nem `rewrites`. Os reducers estao registrados em `slices/index.ts`, mas os thunks que fazem `fetch` nunca sao importados: o unico import nomeado de `authSlice` e `logout`. Sao chamadas inalcancaveis para endpoints inexistentes.
2. **Nenhum drift** entre BFFs e front nas 247 chamadas resolvidas.
3. **Rotas sem consumidor** (sinal para revisao, nao erro): `marketing/posts` (11), identity `admin/clients/*/entitlements|memberships`, `admin/database-refs` e `admin/audit-events` (13), `pdv/admin` operators e inventory-imports (6), fiscal `documentos` status/cce/inutilizacao e listagem (4), probes `health`/`ready` (5) e a pagina de boas-vindas do scaffold Laravel (1). Classificacao final na Sprint 2.
4. **Cobertura nao modelada**: axios em `helpers/api_helper.ts` e `helpers/*fakeBackend*` dos dois apps (template; nao importados pelo codigo de produto).

Precisao do extrator, verificada na execucao:

- A diferenca entre 199 decorators encontrados por `grep` e 197 rotas extraidas no platform vem de dois `@Get(':id')` dentro de JSDoc. O extrator ignora comentarios corretamente.
- Uma primeira versao casou `GET /admin/:param` com `/admin/applications` porque o sufixo de query era um ternario com template aninhado. Foi corrigido; o finding `ambiguous_match` passou a registrar qualquer match em que um segmento dinamico casa com literal (0 ocorrencias).

## Sprint 2: Gate bloqueante e blast radius

Estado: **concluida** — 2026-09-17.

Justificativa aprovada: o platform ainda vai crescer muito; o gate previne drift futuro mesmo com 0 drift atual.

Decisoes humanas:

- Achados que representam trabalho planejado nao sao removidos; entram em lista versionada de aceitos.
- Classificacao: thunks do template Velzon como `template`; rotas sem consumidor como `planned`.

Criterios de aceite:

- [x] `make ai-api-graph-gate` (`--fail-on error`) incluido em `make ai-check`; GitHub Actions e GitLab CI ja executam `make ai-check`.
- [x] Lista `tools/ai/api-graph-accepted.yaml` com `kind`, `category`, dono (`file` ou `service`), `method`, `path`, `reason` e `reference` opcional. Achado aceito continua visivel no relatorio e nao conta para o gate.
- [x] Entrada que deixa de corresponder a achado real gera `stale_accepted_finding` (erro, com linha da entrada). A lista nao vira deposito permanente.
- [x] Entrada malformada (categoria/kind invalido, sem motivo, sem dono, duplicada) e erro de configuracao (exit 2), nunca ignorada.
- [x] Blast radius: `--impact` aceita rota (`POST /kanban/boards/:boardId/cards`), arquivo ou nome de tipo; `make ai-api-impact [BASE=...]` usa o diff. Arquivo de DTO do provedor resolve as rotas que usam aqueles tipos no mesmo servico; arquivo consumidor lista so as proprias chamadas.
- [x] Contratos de IA revisados, fonte canonica primeiro: `AGENTS.md`, `docs/ai-commands/jboot-implement-feature.md`, `docs/AI-COMMANDS.md`, `docs/agents/orchestration/product-engineer.md`, e a regra espelhada nos quatro adapters (`.claude/CLAUDE.md`, `.codex.d/AGENTS.md`, `.cursor/rules/jboot-ai-architecture.mdc`, `.github/copilot-instructions.md`).
- [x] Evals em `docs/ai-governance/evals/scenarios.yaml`: `AIF-EVAL-API-001` (negativo, orfao nao aceito reprova), `API-002` (positivo, achado declarado passa), `API-003` (negativo, entrada obsoleta reprova), `API-004` (regra coberta na fonte canonica, nos adapters e no `ai-check`). Cada eval foi verificado reprovando contra gate quebrado ou adapter sem a regra.
- [x] `make ai-check` aprovado em worktree limpo (HEAD mais as mudancas desta branch), isolado do trabalho nao commitado de outras features.

Resultado:

| Categoria | Entradas | Conteudo |
|---|---|---|
| `template` | 17 | 16 thunks do Velzon nos dois apps Next; rota de boas-vindas do scaffold Laravel |
| `planned` | 41 | rotas sem consumidor; 23 com `reference` verificada (OpenAPI do PDV e fiscal, contrato do identity, contrato do juridico) |
| `infra` | 5 | probes `health`/`ready` |

Desvios registrados:

- Categoria `infra` adicionada alem de `template`/`planned`: probes de liveness/readiness nao sao trabalho planejado, e classifica-los como `planned` seria falso.
- `GET /juridico/portais` ficou fora da lista, visivel como `unconsumed_route` (info): `implementations/app-jboot-next-platform/modules/juridico/MODULE_CONTRACT.md` declara `/juridico/portais` como rota legada que redireciona "sem chamar API", o que contradiz a classificacao `planned`. Decisao humana pendente.
- Na Sprint 1 os adapters foram descritos como "regenerados"; apenas o bloco de controles e gerado por `sync-runtime-adapters.py`. Regras sao espelhadas manualmente e cobertas por eval.
- A validacao em worktree limpo revelou que `implementations/wrk-jboot-marketing` ainda nao esta versionado. O consumidor foi marcado `optional: true` em `tools/ai/api-graph.yaml`: a ausencia vira info e a cobertura entra quando o projeto for commitado. Nesse estado limpo o grafo resolve 239 chamadas (8 externas a menos) e as 63 entradas aceitas continuam validas.

Expectativa registrada: a Sprint 2 previne drift e da blast radius sob demanda; reducao sistematica de tokens depende da Sprint 3.

## Sprint 3: Consumo por agent

Estado: **concluida** — 2026-09-17.

Decisao de forma (dentro da decisao ja registrada de CLI deterministico, nao MCP): recorte **gerado sob demanda no stdout**, nao artefato versionado.

- Versionado exigiria regenerar e commitar a cada mudanca de rota, com conflito entre branches paralelas no arquivo gerado — o mesmo atrito observado nos `AI_CONTEXT.md` do kanban.
- Gerado no momento do uso a partir da arvore atual, o recorte nao pode ficar obsoleto, o que atende `AIF-CTX-001` sem custo de workflow.
- O gerador de `AI_CONTEXT.md` nao foi alterado: incluir a secao de API regeneraria o contexto de todos os modulos e acoplaria contexto derivado de contrato a codigo-fonte.

Criterios de aceite:

- [x] `make ai-api-context MODULE=<modulo|servico>` (`--slice`, com `--format json`) emite: rotas providas com handler, DTO de entrada/tipo de resposta e consumidores (`arquivo:linha`); arquivos consumidores; chamadas que exigem atencao; arestas entre modulos nos dois sentidos; achados ativos e contagem de aceitos.
- [x] Sem duplicacao: chamada interna ao modulo aparece uma vez, como consumidor da rota.
- [x] Caminhos relativos a `implementations/` e referencias por sufixo unico (`kanban-api.ts:374`; `items/lib/api.ts` quando o nome colide).
- [x] Estimativa de tamanho no cabecalho, rotulada como `chars/4` e limite inferior; nao e medicao de tokens.
- [x] Nome inexistente ou vazio sai com exit 2 e lista os nomes disponiveis.
- [x] Contratos: regra em `AGENTS.md` e nos quatro adapters, preflight do `/jboot-implement-feature`, `/jboot-plan-feature`, `docs/AI-COMMANDS.md` e preflight do PE.
- [x] Evals `AIF-EVAL-API-005` (positivo: recorte restrito ao modulo com aresta de saida) e `API-006` (negativo: nome desconhecido rejeitado); `API-004` passou a exigir `make ai-api-context` na fonte canonica e nos adapters. Os tres reprovam por mutacao.
- [x] `make ai-check` aprovado em worktree limpo.

Tamanho do recorte versus arquivos citados (estimativa `chars/4`, arvore de trabalho em 2026-09-17):

| Recorte | Rotas | Chamadas | Recorte | Arquivos citados | Reducao |
|---|---|---|---|---|---|
| `kanban` | 56 | 60 | ~2.218 | ~14.956 | 6,7x |
| `juridico` | 45 | 61 | ~2.275 | ~18.680 | 8,2x |
| `pdv` | 51 | 61 | ~2.071 | ~12.809 | 6,2x |
| `bff-jboot-identity` | 56 | 0 | ~2.900 | ~15.437 | 5,3x |
| `domain-integrations` | 6 | 0 | ~516 | ~8.481 | 16,4x |
| `wrk-jboot-juridico` | 14 | 3 | ~691 | ~20.469 | 29,6x |
| `comanda` | 6 | 7 | ~289 | ~1.911 | 6,6x |

Limites do ganho:

- A reducao vale para mapear superficie de API, consumidores e dependencias entre modulos (preflight, planejamento, review de impacto). Implementar ainda exige ler servico, componente ou tela que muda.
- A coluna "arquivos citados" e limite inferior: nao inclui o custo de descobrir esses arquivos entre centenas de arquivos do app, inclusive o template Velzon.
- Consumo real de tokens nao e medido: o runtime nao expoe a metrica (`measurements.status: not_exposed`). A tabela nao deve ser citada como economia medida.

## Fora De Escopo

- Grafo AST generico de funcoes e classes (coberto por ferramentas externas; nao reimplementar).
- Comparacao campo a campo de DTOs: o OpenAPI do BFF nao declara schemas de resposta (0 `@ApiResponse` nos controllers).
- WebSocket (`socket.io`) e clientes axios.

## Sprint 4: Go E OpenAPI

Estado: **concluida** — 2026-10-04.

Objetivo: incluir unidades independentes em Go sem criar uma zona cega no gate
HTTP e usar OpenAPI como contrato verificavel, nao apenas documentacao.

Criterios de aceite:

- [x] extrair patterns literais do `http.ServeMux` Go 1.22;
- [x] extrair chamadas Go `net/http` construidas com base ligada a env var;
- [x] importar operacoes e schemas request/response do OpenAPI;
- [x] reprovar rota presente somente no codigo ou somente no OpenAPI;
- [x] fazer impacto do arquivo OpenAPI alcançar todas as rotas do servico;
- [x] incluir `svc-jboot-payments` como provider e consumer;
- [x] eval positivo e negativo (`AIF-EVAL-API-007`/`008`) e testes unitarios;
- [x] `make ai-api-context MODULE=svc-jboot-payments` listar as quatro rotas,
  handlers e DTOs;
- [x] `make ai-api-graph-gate` passar sem aceitar drift novo.

Resultado: 4 rotas Payments extraidas do Go e reconciliadas com
`docs/api/payments-sprint-1-openapi.yaml`; zero erro de contrato.

## Limitacoes Conhecidas

- Wrappers sao descobertos por arquivo; wrapper importado de outro arquivo nao e seguido.
- Catch-all do Next (`[...slug]`) e tratado como um segmento.
- `RouterModule`, versionamento de URI do NestJS e `basePath`/`rewrites` do Next geram warning, nao sao modelados.
- Chamada que monta a URL fora de `const`, parametro com chamada literal ou getter aparece como `unresolved`, nunca como match presumido.
- O adapter Go cobre `net/http` e composicoes literais/`fmt.Sprintf` ligadas a
  `os.Getenv`; wrappers HTTP proprios devem ganhar adapter/teste antes de serem
  considerados cobertos.

## Evolucao De Escopo: Architecture Graph

A decisao de 2026-10-06 amplia Graph Engineering para toda a arquitetura JBoot.
O API Contract Graph permanece operacional como subgrafo HTTP. Esta secao
prevalece quando houver conflito com o escopo historico das Sprints 1 a 3.

## Sprint 4: Architecture Graph Foundation E Enforcement

Estado: **concluida** — autorizada e validada em 2026-10-06.

### Objetivo

Criar o grafo transversal tipado e deterministico, migrar o baseline completo
de `implementations/*`, integrar o subgrafo HTTP, entregar viewer local proprio
e tornar obrigatoria a manutencao de nodes/edges por agents executores.

### PE Decision

| Campo | Decisao |
|---|---|
| `execution_mode` | `architectural` + `implementation` |
| `target_project` | `repository-root` |
| `delivery_type` | engine/CLI de governanca + viewer local interativo |
| `deployment_boundary_gate` | engine no harness; viewer `independent_unit` local, sem deploy |
| `stack_fit_gate` | Vite + React + Sigma/Graphology; Next, D3 puro e Cytoscape rejeitados por fit |
| `counterfactual_choice` | Vite + React + Sigma/Graphology |
| `human_confirmation` | confirmada em 2026-10-06 |
| `open_questions` | nenhuma bloqueante |
| `blocking_status` | implementacao autorizada |

### Arquitetura

```text
contracts + registry + governance + API Contract Graph
                         |
                         v
             architecture-graph.py
                /               \
       context/impact/gate     graph.json
                                  |
                                  v
                    viewer local read-only
```

Fronteiras:

```text
docs/architecture-graph/                 schema, registry e runbook
tools/ai/architecture-graph.py           engine, queries e gate
tools/ai/architecture-graph-viewer/      viewer local proprio
tmp/ai/architecture-graph/graph.json     artefato derivado
```

### Regra Operacional

- planejamento cria/referencia nodes `planned` e edges esperadas;
- agent executor atualiza graph metadata no mesmo diff;
- PE consulta contexto/impacto antes e executa gate depois;
- Architect revisa novas fronteiras e dependencias materiais;
- entrega nao pode ser `concluida` com graph gate falhando.

### Criterios De Aceite

- [x] Schema versionado para nodes, edges, provenance e findings.
- [x] Registry explicito com IDs estaveis e fontes verificaveis.
- [x] Extracao de projetos, modulos, agents, skills, decisions, sprints e evidence.
- [x] API Contract Graph integrado como subgrafo sem substituicao.
- [x] Ordenacao e IDs deterministicos.
- [x] Gate detecta tipo/lifecycle invalido, duplicata, dangling edge, source/evidence ausente e implementation sem contrato.
- [x] Queries de contexto/impacto aceitam profundidade e limite.
- [x] Baseline real sem findings bloqueantes.
- [x] Viewer local read-only com zoom/pan, busca, filtros, selecao, detalhes e vizinhanca.
- [x] Viewer escuta somente em loopback e nao possui endpoint de mutacao.
- [x] Testes Python e TypeScript, type-check, lint, build e dependency audit aprovados.
- [x] Regras cobertas por AGENTS, PE, Architect, comandos e quatro adapters.
- [x] `make ai-check` e `make ai-conformance` aprovados.
- [x] Attestation/evidence pack gerados do mesmo estado.

### Resultado

- baseline: 497 nodes, 684 edges e 0 findings;
- API Contract Graph preservado como subgrafo: 279 endpoints e 235 edges `calls`;
- viewer: bundle JS de 398,22 kB (112,30 kB gzip) e CSS de 6,46 kB
  (2,01 kB gzip);
- validacao: 58 testes Python, 27 evals comportamentais, 3 testes TypeScript,
  type-check, lint, build e dependency audit sem vulnerabilidades;
- seguranca: review aprovado, bind `127.0.0.1`, superficie HTTP somente estatica e
  nenhuma credencial no artefato;
- evidence: attestation `20261006-tooling-architecture-graph-sprint-4` e evidence
  pack regenerado no fechamento.

### Metricas

- nodes/edges/findings por tipo/source: medidos pelo artefato;
- cobertura de contracts ativos: medida pelo gate;
- build time e tamanho do bundle: medidos na validacao;
- reducao real de tokens: `not_exposed` ate haver medicao do runtime.

### Riscos E Mitigacoes

| Risco | Mitigacao |
|---|---|
| grafo manual stale | derivacao automatica, gate e ownership no mesmo diff |
| duplicacao de contratos | registry guarda somente relacao nao inferivel |
| ruido AST | granularidade arquitetural; API Graph especializado |
| viewer vira fonte de verdade | modo read-only e artefato derivado |
| dataset degrada UI | WebGL, filtros, vizinhanca e benchmark real |
| exposicao local | bind exclusivo em loopback |
| graph poisoning | schema fechado e texto tratado somente como dado |

### Fora De Escopo

- banco de grafos ou servico de producao;
- sincronizacao cloud/multiusuario;
- indexar toda funcao/classe;
- editar nodes/edges pela UI;
- substituir Git, contracts, decisions, API Graph ou evidence pack.
