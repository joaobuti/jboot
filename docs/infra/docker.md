# Docker Infra

## Objetivo

Preparar uma infra local para o hub JBoot com as stacks atuais, excluindo desktop/Tauri e Java/Kotlin enterprise.

## Container principal

`jboot` contem:

- Node.js 24;
- TypeScript tooling;
- NestJS CLI;
- Expo/EAS CLI;
- Python 3 + uv + FastAPI + LangGraph + LlamaIndex;
- PHP CLI + Composer + extensoes para Laravel;
- Go 1.25;
- Flutter SDK via canal `stable` para app-first multiplataforma;
- MCP Inspector.

Nao contem:

- Java/Kotlin/Spring Boot enterprise;
- Tauri/Rust/desktop.

## Servicos

- `jboot-postgres`: PostgreSQL + pgvector.
- `jboot-mongodb`: MongoDB.
- `jboot-valkey`: Redis-compatible cache/streams.
- `jboot-rabbitmq`: RabbitMQ + management UI.
- `jboot-temporal`: Temporal.
- `jboot-temporal-ui`: Temporal UI.
- `jboot-redpanda`: Kafka-compatible event streaming.
- `jboot-minio`: S3-compatible object storage.
- `jboot-clickhouse`: analytics.
- `jboot-qdrant`: vector search dedicado.

## Uso

```bash
cp .env.example .env
docker compose build jboot
docker compose up -d
docker compose exec jboot bash
```

Atalhos:

```bash
make infra-build
make infra-up
make shell
```

Subir ambiente funcional com Identity obrigatorio:

```bash
make dev-up                 # Identity API + Identity Admin
make dev-up TARGET=platform # Identity + platform backend/web
make dev-up TARGET=pdv-legacy
```

## Portas

- Identity Admin Next.js: `3000`
- Platform/PDV Next.js: `3001`
- Vite: `5173`
- FastAPI: `8000`
- Laravel: `8080`
- PostgreSQL: `5432`
- MongoDB: `27017`
- Valkey: `6379`
- RabbitMQ: `5672`
- RabbitMQ UI: `15672`
- Temporal: `7233`
- Temporal UI: `8088`
- Redpanda external Kafka: `19092`
- MinIO API: `9000`
- MinIO Console: `9001`
- ClickHouse HTTP: `8123`
- Qdrant HTTP: `6333`

## Decisoes

- `jboot` e o unico container de desenvolvimento com runtimes de aplicacao.
- Bancos, brokers e plataformas ficam em containers separados por isolamento operacional.
- PostgreSQL inicia com `jboot_identity` para login global e registry de clientes/aplicacoes/bancos.
- Imagens com tag `latest` ficam centralizadas em `.env.example` para permitir pinagem posterior sem alterar compose.
- Java/Kotlin enterprise e desktop foram excluidos por decisao de escopo atual.

## Identity DB

Bootstrap: `docker/postgres/init/002_identity.sql`.
Seed local: `docker/postgres/init/003_identity_dev_seed.sql`.

Em ambiente ja inicializado, aplique manualmente:

```bash
docker compose exec -T postgres psql -U jboot -d postgres -f /docker-entrypoint-initdb.d/002_identity.sql
docker compose exec -T postgres psql -U jboot -d postgres -f /docker-entrypoint-initdb.d/003_identity_dev_seed.sql
```
