# Decision: API Contract Graph Proprio Em Vez De Adotar code-review-graph

date: 2026-09-17
status: approved_by_human
agents: product-engineer, architect
skills: ai-first-governance
decision_owner: human
execution_authorized: true

## Current Status And Precedence

Esta decisao permanece valida para o **subgrafo de contratos HTTP**. A decisao
mais recente `2026-10-06-architecture-graph-engineering.md` supersede somente a
limitacao que mantinha um grafo arquitetural transversal fora do roadmap. O
extrator HTTP, seus gates e seus recortes sob demanda passam a alimentar o
Architecture Graph sem perder ownership ou semantica proprios. Em conflito de
escopo, a decisao de 2026-10-06 prevalece.

## Context

O usuario avaliou o projeto externo `tirth8205/code-review-graph` (Python, Tree-sitter, SQLite, 30 tools MCP; repositorio criado em 2026-02-26). A analise do monorepo mostrou:

- O front redeclara DTOs a mao (`BoardDto`, `CardDto`, etc.) e nao importa tipos do BFF. Um grafo AST nao tem aresta para atravessar a fronteira HTTP.
- O BFF expoe OpenAPI (`SwaggerModule.setup('docs')`), mas nenhum controller declara `@ApiResponse`. Codegen do cliente nao cobriria os shapes de resposta, que e onde vive o risco de drift.
- Os dois lados da fronteira sao sintaticamente extraiveis: rota e DTO nos decorators NestJS, path e tipo de resposta em `request<T>(path, init)`, e toda base de URL termina em env var.

## Decision

1. Nao adotar nem reimplementar o `code-review-graph` **como solucao do
   subgrafo HTTP**. Construir para esse subgrafo somente a aresta que ele nao
   cobre: o join rota x consumidor na fronteira HTTP. Esta delimitacao nao
   proibe o Architecture Graph transversal aprovado em 2026-10-06.
2. Enquadrar o entregavel como controle de conformidade (drift detectavel, testavel) antes de otimizacao de contexto.
3. Detectar drift primeiro (A). Eliminar drift anotando respostas e gerando cliente do OpenAPI (B) fica para depois, por modulo, priorizado pelo relatorio.
4. CLI com artefato JSON deterministico, nao servidor MCP.
5. Python em `tools/ai/`, sem dependencia nova.
6. Schema orientado a transporte: o no canonico e o endpoint normalizado; linguagens e frameworks entram por adapter.
7. Sprint 1 somente reporta; bloqueio fica para a Sprint 2 (decisao humana).
8. Cobrir todos os servicos e consumidores do monorepo desde a Sprint 1 (decisao humana), porque todos tinham call sites reais para validar.

## Rationale

- Gate precisa rodar headless no CI; servidor MCP nao roda.
- `AIF-CTX-001` pede contexto deterministico e com freshness; arquivo gerado atende, daemon nao.
- CLI e classificado como T1 em `docs/ai-governance/security/tool-approval-matrix.yaml` (rodar validacao e gerar artefato derivado); 30 tools MCP exigiriam revisao da matriz (`AIF-SEC-002`).
- MCP continua possivel depois como wrapper aditivo sobre o mesmo JSON; a decisao e reversivel.
- `ts-morph` daria resolucao semantica de TypeScript, mas o join necessario e sintatico e precisa atravessar PHP e Python.

## Tradeoffs

- Analise estatica por arquivo: wrappers importados de outro arquivo e URLs montadas dinamicamente ficam `unresolved`, com motivo explicito, em vez de presumidos.
- Nao detecta divergencia campo a campo de DTO; so existencia de rota, metodo e servico.
- Nao sabe se o codigo e alcancavel: chamada morta para endpoint inexistente aparece como erro.

## Validation

- `python3 -m unittest tools/ai/tests/test_api_graph.py` (26 testes, fixture positiva e negativa).
- Mutacao sobre o repositorio real: remover `POST /kanban/boards/:id/cards` gerou `method_mismatch` em `kanban-api.ts:374`; remover o controller de acompanhamentos DataJud gerou 5 `orphan_call`; remover o servico fiscal gerou 7.
- `make ai-api-graph`: 285 rotas, 283 chamadas, 247 resolvidas, 16 orfas, 0 nao resolvidas.

## Sprint 2 Addendum

Decisoes humanas em 2026-09-17:

1. Relatorio da Sprint 1 aceito.
2. Achados que representam trabalho planejado nao sao removidos: lista versionada de aceitos (`tools/ai/api-graph-accepted.yaml`), com categoria e motivo por entrada.
3. Sprint 2 aprovada: o crescimento previsto do platform justifica o gate mesmo com 0 drift atual.

Decisoes de implementacao:

- Achado aceito continua no relatorio; so deixa de contar para o gate. Entrada sem achado correspondente reprova (`stale_accepted_finding`), para que a lista acompanhe o codigo.
- Chave de aceite sem numero de linha (dono + metodo + path), para nao quebrar a cada edicao do arquivo.
- Categoria `infra` alem de `template`/`planned`, para probes operacionais.
- Tipos declarados em arquivo consumidor nao se expandem na consulta de impacto: nomes locais homonimos (`PageResult`, `PageMeta`) geravam falso impacto entre modulos. Tipos de arquivo provedor ficam restritos ao proprio servico.
- A regra entra na fonte canonica e e espelhada manualmente nos quatro adapters, com eval de cobertura (`AIF-EVAL-API-004`), seguindo o padrao de `AIF-EVAL-NC-003`/`NC-004`.

## Sprint 3 Addendum

Decisao: o consumo por agent e um recorte por modulo ou servico **gerado sob demanda** (`make ai-api-context MODULE=...`), nao um artefato versionado nem uma secao do `AI_CONTEXT.md`.

Rationale:

- Artefato versionado derivado de codigo fica obsoleto a cada mudanca de rota e obriga regeneracao e commit, com conflito entre branches paralelas. O caso dos `AI_CONTEXT.md` do kanban mostrou esse atrito na pratica.
- Gerar no uso garante frescor por construcao, o que atende `AIF-CTX-001` sem freshness check nem custo de workflow.
- `AI_CONTEXT.md` e derivado de contratos; acoplá-lo a codigo-fonte regeneraria o contexto de todos os modulos a cada mudanca de API.
- MCP continua possivel como adapter sobre `--slice --format json`, sem mudar a fonte.

Tradeoffs:

- Nao ha registro versionado do recorte usado numa execucao; a rastreabilidade vem da attestation e do diff.
- O ganho e limitado a mapeamento de superficie de API; nao reduz leitura de logica de negocio. O tamanho e estimado por `chars/4`, nao medido.

## Follow Up

- Integrar o API Contract Graph como subgrafo/provedor do Architecture Graph na
  Sprint 4, preservando CLI, gate e recortes existentes.
- Decidir `GET /juridico/portais`: o contrato do modulo juridico declara a rota de tela como legada e sem chamada de API, o que contradiz a classificacao `planned`.
- Eliminacao de drift (anotar `@ApiResponse` e gerar cliente), por modulo, quando priorizado.
- Medir consumo real de tokens quando o runtime expuser a metrica, para validar a estimativa do recorte.

## Sprint 4 Addendum: Go E OpenAPI

Em 2026-10-04, a inclusao do servico independente Payments em Go tornou
obrigatorio ampliar o grafo antes do merge. A decisao preserva o modelo
orientado a transporte:

- `go-net-http` extrai patterns literais do `http.ServeMux` Go 1.22;
- consumidores Go usam o adapter `net/http`, com base resolvida por env var;
- `openapi` no cadastro do servico e contrato executavel: diferenca entre
  operacoes implementadas e documentadas gera `provider_contract_drift` com
  severidade `error`;
- schemas OpenAPI alimentam `request_type` e `response_type` das rotas Go;
- selecionar o arquivo OpenAPI no impacto retorna toda a superficie do servico.

O parser nao tenta adivinhar routers ou wrappers Go arbitrarios. Padrao nao
modelado deve produzir cobertura explicita nova e teste, nunca match presumido.
