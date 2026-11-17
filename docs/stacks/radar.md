# Radar de Stacks

## Regra

Tecnologia mencionada nao vira stack oficial automaticamente.

Estados:

- `baseline`: escolha inicial padrao.
- `suportada`: ha agente/criterio para uso.
- `condicional`: exige justificativa explicita do `architect`.
- `candidata`: avaliar depois; sem agente por enquanto.
- `adotada`: escolhida em decisao concreta.

## Atual

| Stack | Estado | Observacao |
| --- | --- | --- |
| React + Next.js + TypeScript | baseline | Web principal |
| Node.js + NestJS/Fastify | baseline | Backend TS/BFF |
| Python + FastAPI + LangGraph | baseline | IA, RAG, agentes |
| PostgreSQL + pgvector | baseline | Dados relacionais/vetoriais default |
| MCP | baseline | Tools/resources/prompts |
| OpenTelemetry | baseline | Observabilidade |
| MongoDB / Atlas | condicional | Documentos, estado de agentes, change streams, vector search |
| Redis/Valkey | suportada | Cache, rate limit, locks, estado efemero, streams leves |
| RabbitMQ | suportada | Work queues, AMQP routing, DLX, quorum queues, async commands |
| Temporal | condicional | Workflows duraveis, long-running agents, retries, compensacao |
| Kafka/Redpanda/NATS | condicional | Event streaming/event bus quando eventos forem centrais |
| S3/R2/MinIO | suportada | Artefatos, anexos, datasets, exports e outputs de IA |
| Go | suportada | Gateways, CLIs, workers e servicos pequenos de alta concorrencia |
| ClickHouse/DuckDB | condicional | Analytics, evals, telemetria e exploracao local |
| Qdrant/Weaviate/Milvus | condicional | Vector search dedicado quando pgvector/MongoDB nao bastarem |
| Spring Boot / Java / Kotlin | suportada | Enterprise/JVM |
| Laravel | suportada | Backoffice/produtividade |
| Astro + TypeScript | suportada | Sites estaticos, documentacao, portfolio, landing e marketing tecnico com pouca interatividade |
| Expo / React Native | suportada | Mobile TS |
| Flutter | suportada | App-first multiplataforma |
| Kotlin Multiplatform / Compose | suportada | Mobile nativo compartilhado |
| Tauri | suportada | Desktop leve |

## Candidatas sem agente

- OpenSearch/Elasticsearch/Meilisearch.
- Neo4j.
- .NET.
- Electron.

## Criterio para criar agente

Crie agente quando a tecnologia tiver pelo menos um destes sinais:

- responsabilidade propria de desenho e implementacao;
- impacto direto em corretude, custo, resiliencia ou performance;
- padroes de falha especificos que exigem operador SENIOR;
- uso recorrente em varias stacks;
- contratos ou operacao propria.

Nao crie agente apenas porque a tecnologia e popular.
