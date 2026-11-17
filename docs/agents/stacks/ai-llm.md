# Stack Agent: AI / LLM

## Responsabilidade

Integração com modelos de linguagem, pipelines RAG, prompt engineering, evals e cost tracking.

## Stacks

| Stack | Usar quando |
|---|---|
| Anthropic API | Quando eval versionado demonstrar fit de qualidade, custo, latência e dados |
| OpenAI API | Quando eval versionado demonstrar fit de qualidade, custo, latência e dados |
| Google Vertex AI / Gemini | Multimodal pesado ou integração com ecossistema Google |
| Ollama | Dados que não podem sair da infraestrutura; prototipagem local sem custo de API |
| OpenRouter | Multi-provider routing com fallback automático e comparação de custo |
| LangChain / LangGraph | Orchestration de agentes multi-step com estado e ciclos |
| LlamaIndex | RAG com indexação avançada, query engines e retrievers customizados |

## Padrões Obrigatórios

### Fronteira src/ai (AGENTS.md)

Toda integração com provedor de LLM concentrada em `src/ai/` — sem chamadas diretas espalhadas pela aplicação.

```
src/ai/
  providers/     ← adaptadores por provedor (OpenAI, Anthropic, Vertex)
  prompts/       ← prompts versionados como artefatos
  pipelines/     ← RAG pipelines, chains, agentes
  evals/         ← scripts de avaliação por prompt/modelo
```

Cada módulo de negócio usa a fronteira compartilhada: `pdv/ai/` e `juridico/ai/` importam de `src/ai/`, nunca de provedores diretamente. Prompts são parte do domínio — sem compartilhamento entre módulos sem contrato explícito.

### RAG Pipeline (Lewis et al., 2020)

Etapas com interfaces próprias e responsabilidades separadas:

| Etapa | Responsabilidade |
|---|---|
| Chunking | Segmentação do documento. Estratégia (fixed, semantic, recursive) documentada por caso de uso. |
| Embedding | Modelo, dimensão, métrica de distância e normalização declarados e versionados. |
| Storage | pgvector para volume baixo/médio; Qdrant/Weaviate quando escala exigir (ver `data-vector-search.md`). |
| Retrieval | Top-k com filtro por metadados. Threshold de score mínimo configurável. |
| Reranking | Cross-encoder obrigatório quando recall@k for crítico — similarity score isolado não é suficiente. |

Mudança de modelo de embedding implica reindexação total. Plano de migração definido antes de produção.

### Prompt Engineering e Versioning (DAIR.AI, 2022+; Wei et al., 2022)

- Prompts como artefatos em `src/ai/prompts/` — nunca strings inline no código de aplicação.
- Cada prompt declara: `version`, `description`, `model_target`, `variables`, `examples`.
- System prompt separado de user prompt — nunca concatenar em uma única string.
- Para raciocínio complexo, decompor a tarefa e exigir evidências/saída
  estruturada. Não depender da exposição de raciocínio interno; selecionar a
  estratégia por eval do caso de uso e do modelo alvo.
- Few-shot examples no prompt quando output estruturado for crítico (extração, classificação com schema rígido).
- Mudança de prompt = nova versão — sem edição silenciosa de prompt em produção.

### Evals (Anthropic, OpenAI — 2023+)

- Toda versão de prompt ou modelo tem métricas de eval antes de promover para produção.
- Métricas mínimas por caso de uso:

| Caso de uso | Métricas obrigatórias |
|---|---|
| RAG | faithfulness, answer_relevance, context_recall, latência p50/p99 |
| Classificação | accuracy, precision, recall, F1 por classe |
| Extração | exact_match, field_accuracy, hallucination_rate |
| Geração | human_eval score, custo por output, latência |

- Resultados exportados e versionados para comparação entre versões de modelo/prompt.
- Eval automatizado em CI para prompts críticos — regressão de accuracy bloqueia merge.

### Observabilidade (OpenTelemetry — CNCF, 2021)

Atributos alinhados às OpenTelemetry GenAI Semantic Conventions devem registrar
também a versão e estabilidade da convenção. Campos experimentais não podem ser
tratados como contrato estável sem plano de migração.

| Atributo | Descrição |
|---|---|
| `gen_ai.operation.name` | Operação executada conforme a semconv adotada |
| `gen_ai.provider.name` | Provider normalizado conforme a semconv |
| `gen_ai.request.model` | Modelo solicitado |
| `gen_ai.response.model` | Modelo efetivamente usado quando exposto |
| `gen_ai.usage.input_tokens` | Tokens de entrada quando expostos |
| `gen_ai.usage.output_tokens` | Tokens de saída quando expostos |
| `jboot.ai.prompt.version` | Extensão namespaced para versão do prompt |
| `jboot.ai.cost` | Extensão namespaced para custo e moeda |
| `error.type` | Erro normalizado quando a operação falhar |

Sem registro desses atributos = sem deploy em produção. Budget alerts por módulo e por `client_id` configurados antes da primeira carga real.

### Modular Monolith (Grzybek, 2019; Newman, 2019)

Módulos de AI seguem as mesmas fronteiras do Modular Monolith: `pdv/ai/` não importa de `juridico/ai/`. Pipelines e prompts compartilhados vivem em `src/ai/` com contrato explícito de interface.

### Métricas Objetivas (Cognitive Complexity — Campbell & SonarSource, 2018)

- Funções de pipeline com Cognitive Complexity > 15 devem ser decompostas em etapas menores.
- Chains com mais de 5 steps em sequência linear considerar LangGraph para gerenciamento de estado explícito.

### DRY / YAGNI (Hunt & Thomas, Pragmatic Programmer 2019)

- Não abstrair pipeline antes de ter dois casos de uso reais com o mesmo shape.
- Não adicionar reranking, memória de longo prazo ou multi-agent antes de eval mostrar que o modelo base não resolve.

## Segurança Obrigatória

- **Prompt Injection (OWASP LLM Top 10 2025)**: separar instruções de conteúdo não confiável. Sanitização isolada não é controle suficiente; aplicar fronteiras, menor privilégio e validação do efeito.
- **Improper Output Handling (OWASP LLM Top 10 2025)**: outputs de LLM nunca executados diretamente (`eval`, `exec`, SQL raw, comandos de shell). Validar por schema e política antes do uso downstream.
- **Sensitive Information Disclosure (OWASP LLM Top 10 2025)**: PII (CPF, CNPJ, dados médicos, financeiros) não incluído em prompts enviados a provedores externos sem consentimento explícito e base legal LGPD. Pseudonimizar antes de enviar quando necessário.
- **Excessive Agency / Agentic Risks (OWASP 2025/2026)**: tools usam menor privilégio, allowlist e aprovação proporcional ao impacto; ações irreversíveis exigem human-in-the-loop.
- **API keys de provedores**: em variáveis de ambiente — nunca hardcoded, nunca em logs. Rotacionar periodicamente.
- **Rate limiting**: chamadas a LLM com rate limiting e circuit breaker por `client_id` — um cliente não pode exaurir quota dos demais.

## Validação Obrigatória

| Comando / Ação | Quando executar |
|---|---|
| `npx tsc --noEmit` | Sempre |
| `npx eslint src --max-warnings=0` | Sempre |
| Evals de prompt (`src/ai/evals/`) | Solicitar autorização — execução gera custo de API |
| `npm audit` | Antes de merge com nova dependência de AI/ML |
| Revisão de PII em prompts | Sempre que novo campo de entrada for adicionado ao pipeline |

## Quando escolher / Quando evitar

| Escolher | Evitar |
|---|---|
| Extração de dados não estruturados (documentos, notas fiscais, contratos) | Lógica determinística que regex ou if/else resolve |
| Classificação e sumarização com variabilidade de input alta | Quando latência < 100 ms for requisito rígido sem modelo local viável |
| RAG sobre base de conhecimento interna com queries em linguagem natural | Quando dados não podem sair da infraestrutura e Ollama não atende qualidade |
| Agentes com tool use para automação de fluxos multi-step | Decisões financeiras ou médicas sem human-in-the-loop explícito |
| Geração de rascunhos, templates e sugestões com revisão humana | Substituição direta de decisão humana em contexto regulado |
