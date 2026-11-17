# Recomendacoes de Stacks

Data de referencia: 2026-05-07.

## Recomendacao base

Para este projeto como hub de implementacoes com uso massivo de IA:

- Web principal para apps, consoles, dashboards e produtos interativos: React 19.2 + Next.js 16 + TypeScript + Tailwind CSS 4.
- Sites estaticos, documentacao, portfolio, landing e marketing tecnico com pouca interatividade: Astro + TypeScript + Tailwind CSS.
- Backend TypeScript: Node.js 24 LTS + NestJS 11 ou Fastify, conforme nivel de estrutura necessario.
- Backend IA/dados: Python 3.13/3.14 + FastAPI + Pydantic + LangGraph quando houver agentes stateful.
- Backend enterprise: Spring Boot 4 com Java 25 ou Kotlin.
- Backend PHP produtivo: Laravel 13, especialmente se o alvo for backoffice, admin, SaaS rapido ou MCP no ecossistema Laravel.
- Mobile JS/TS: Expo SDK 55 + React Native 0.83.
- Mobile/app-first: Flutter 3.41+.
- Mobile nativo compartilhado: Kotlin Multiplatform + Compose Multiplatform 1.10+.
- Desktop: Tauri 2; Electron apenas quando Chromium/Node completo for requisito.
- Dados: PostgreSQL 18 + pgvector como default relacional/vetorial; Qdrant ou similar quando busca vetorial dedicada superar a simplicidade do Postgres.
- Documentos/eventos: MongoDB 8.x/Atlas quando o dominio for naturalmente documental, semi-estruturado, multi-tenant flexivel, event-like, catalogo, historico operacional ou estado de agentes.
- Observabilidade: OpenTelemetry como padrao de traces, metricas e logs.
- Integracao de ferramentas para agentes: MCP como contrato padrao para tools, resources e prompts.

## Regra de inclusao

Mencionar uma tecnologia nao significa adota-la como stack oficial.

Estados possiveis:

- `baseline`: escolha inicial padrao.
- `suportada`: existe agente/criterio para uso quando o caso justificar.
- `condicional`: util, mas exige justificativa explicita do `architect`.
- `candidata`: tecnologia relevante para avaliar depois; nao criar agente ainda.
- `adotada`: escolhida em uma decisao concreta de implementacao.

Toda stack nova deve entrar primeiro como `candidata` ou `condicional`, salvo decisao explicita.

Baseline nao e decisao automatica. Para cada novo projeto, PE e Architect devem comparar stacks candidatas contra o escopo real e registrar por que a recomendada e mais eficiente que alternativas, especialmente quando a escolha seguir a baseline do repositorio.

## Radar atual

Baseline:

- React + Next.js + TypeScript.
- Node.js LTS + NestJS/Fastify.
- Python + FastAPI + LangGraph para IA.
- PostgreSQL + pgvector.
- MCP.
- OpenTelemetry.

Suportadas/condicionais:

- Astro + TypeScript.
- Spring Boot / Java / Kotlin.
- Laravel.
- Go.
- Redis/Valkey.
- RabbitMQ.
- Temporal.
- Kafka/Redpanda/NATS.
- S3/R2/MinIO.
- ClickHouse/DuckDB.
- Qdrant/Weaviate/Milvus.
- Expo / React Native.
- Flutter.
- Kotlin Multiplatform / Compose.
- Tauri.
- MongoDB / Atlas.

Candidatas ainda sem agente dedicado:

- OpenSearch/Elasticsearch/Meilisearch: busca textual dedicada e observabilidade de documentos.
- Neo4j: dominio altamente relacional por grafos.
- .NET: ambientes Microsoft/Azure e workloads corporativos.
- Electron: desktop quando Chromium/Node completo for requisito real.

## Frontend

Escolha padrao para produtos web interativos, dashboards e consoles: React + Next.js.

Motivos:

- ecossistema amplo;
- bom suporte a SSR, streaming, server components e cache refinado;
- excelente aderencia a consoles operacionais e interfaces densas;
- forte compatibilidade com agentes de codigo;
- TypeScript maduro.

Alternativas:

- Astro: conteudo, documentacao, portfolio, landing, marketing tecnico e paginas de alto desempenho com pouca interatividade.
- Angular: quando governanca, padroes estritos e enterprise forem prioridade.
- Nuxt/Vue: quando produtividade e simplicidade forem mais importantes que dominio React.

## Backend

Escolha por contexto:

- TypeScript/NestJS: BFF, APIs internas, realtime e stack web integrada.
- Python/FastAPI: IA, pipelines, RAG, agentes, automacao e data-heavy workloads.
- Spring Boot: workloads corporativos, transacionais, regulados e com alto peso operacional.
- Laravel: backoffice e produtos de alta produtividade, especialmente quando Boost/MCP agregam valor.
- Go: servicos pequenos, alta concorrencia, infraestrutura, CLIs e gateways de baixa latencia.
- .NET 10: ambientes Microsoft, APIs corporativas, Aspire/Blazor e integracao com Azure.

Go deve ser considerado quando a unidade de implementacao for pequena, concorrente, de baixa latencia ou infra-oriented. Nao deve substituir TypeScript/Python por default em produto web/IA, porque o custo de ecossistema e velocidade de iteracao pode ser pior.

## Dados

Escolha padrao inicial: PostgreSQL.

Motivo: para um hub de implementacoes, PostgreSQL entrega contratos relacionais fortes, transacoes, joins, constraints, auditoria madura e pgvector suficiente para muitos casos de RAG sem adicionar outro operador.

MongoDB fica como stack `condicional`. Deve entrar quando o shape dos dados justificar:

- documentos ricos com estrutura variavel;
- estado de agentes, traces operacionais e snapshots de execucao;
- catalogos, configuracoes, metadados e payloads semi-estruturados;
- ingestao de eventos/documentos em alto volume;
- change streams para reacao em tempo real;
- time series quando o modelo de metadados por serie for adequado;
- RAG/hybrid search quando os documentos ja vivem no MongoDB/Atlas.

Evite MongoDB como default para dominios altamente relacionais, invariantes fortes entre agregados, relatorios SQL intensivos ou quando joins/constraints forem parte central da corretude.

## Plataforma e infraestrutura recorrente

- Redis/Valkey: grande uso para cache, rate limit, locks e estado efemero. Pode servir como mensageria leve via Streams, mas Pub/Sub nao deve ser usado quando perda de mensagem for inaceitavel.
- RabbitMQ: grande uso para work queues, comandos assincronos, roteamento por exchange/routing key, DLX/retry e consumidores concorrentes. Nao substitui Kafka quando o requisito central for log duravel com replay amplo, nem Temporal quando o requisito for workflow duravel com historico de execucao.
- Temporal: grande uso quando a tarefa tem workflow longo, retry, compensacao, aprovacao humana ou agente que precisa sobreviver a falhas.
- Kafka/Redpanda/NATS: grande uso quando eventos sao produto, integracao central ou trilha duravel de fatos. Evite quando uma fila simples resolve.
- S3/R2/MinIO: praticamente inevitavel para artefatos de IA, anexos, datasets, exports, imagens, audios, PDFs e snapshots grandes.
- ClickHouse/DuckDB: forte para avaliacao de agentes, telemetria, analytics e exploracao local; nao substitui banco transacional.
- Qdrant/Weaviate/Milvus: considerar quando pgvector/MongoDB Vector Search nao entregarem escala, filtros, latencia ou operacao exigida.

## Apps

- React Native/Expo: melhor quando o time quer reaproveitar TypeScript e parte do pensamento web.
- Flutter: melhor quando o produto e app-first e a consistencia visual entre plataformas e prioridade.
- Kotlin Multiplatform/Compose: melhor quando qualidade nativa e compartilhamento de core Kotlin importam.
- SwiftUI + Kotlin/Compose nativo: melhor para apps premium com exigencia maxima por plataforma.

## IA e agentes

- LangGraph para workflows longos, agentes stateful, human-in-the-loop e execucao duravel.
- MCP para integrar ferramentas, recursos e prompts de forma padronizada.
- Evals automatizados para prompts e agentes antes de ampliar uso em producao.
- Telemetria obrigatoria: prompt version, modelo, custo, latencia, fontes, tool calls e erro.
- Contratos estruturados para qualquer saida de IA consumida por codigo.

## Referencias oficiais consultadas

- React 19.2: https://react.dev/blog/2025/10/01/react-19-2
- Next.js Cache Components: https://nextjs.org/docs/app/getting-started/cache-components
- Angular releases: https://angular.dev/reference/releases
- Nuxt 4: https://nuxt.com/blog/v4
- Tailwind CSS 4: https://tailwindcss.com/blog/tailwindcss-v4
- Node.js releases: https://github.com/nodejs/Release
- FastAPI release notes: https://fastapi.tiangolo.com/release-notes/
- NestJS migration guide: https://docs.nestjs.com/migration-guide
- Spring Boot 4: https://spring.io/blog/2025/11/20/spring-boot-4-0-0-available-now
- .NET 10: https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-10/overview
- Laravel 13 Boost: https://laravel.com/docs/13.x/boost
- Laravel 13 MCP: https://laravel.com/docs/13.x/mcp
- Expo SDK 55: https://docs.expo.dev/versions/latest/
- React Native 0.82 New Architecture: https://reactnative.dev/blog/2025/10/08/react-native-0.82
- Flutter 3.41 docs: https://docs.flutter.dev/release/whats-new
- Compose Multiplatform 1.10: https://blog.jetbrains.com/kotlin/2026/01/compose-multiplatform-1-10-0/
- Tauri 2: https://v2.tauri.app/
- MCP architecture: https://modelcontextprotocol.io/docs/learn/architecture
- LangGraph overview: https://docs.langchain.com/oss/python/langgraph/overview
- PostgreSQL 18: https://www.postgresql.org/about/news/postgresql-18-released-3142/
- pgvector: https://github.com/pgvector/pgvector
- MongoDB 8.0 release notes: https://www.mongodb.com/docs/manual/release-notes/8.0/
- MongoDB documents: https://www.mongodb.com/docs/current/core/document/
- MongoDB change streams: https://www.mongodb.com/docs/manual/changestreams/
- MongoDB Vector Search: https://www.mongodb.com/docs/vector-search/
- RabbitMQ docs: https://www.rabbitmq.com/docs
- RabbitMQ quorum queues: https://www.rabbitmq.com/docs/quorum-queues
- RabbitMQ exchanges: https://www.rabbitmq.com/docs/exchanges
- RabbitMQ streams: https://www.rabbitmq.com/docs/streams
- OpenTelemetry: https://opentelemetry.io/docs/
