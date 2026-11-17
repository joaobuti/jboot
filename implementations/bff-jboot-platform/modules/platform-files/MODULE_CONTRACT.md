# Module Contract: bff-jboot-platform/modules/platform-files

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: contrato e sprint artifact criados para modulo horizontal de arquivos
last_status_review: 2026-08-27
```

Destino tecnico:

- `implementations/bff-jboot-platform/src/modules/platform-files`

## Responsabilidade

Servico horizontal de upload, metadata e recuperacao assinada de arquivos usados por modulos da Platform. O modulo gerencia bytes e metadados tecnicos; o dominio consumidor continua responsavel por validar entidade de origem e decidir o significado do arquivo.

## Contratos Obrigatorios

- `implementations/bff-jboot-platform/modules/platform-files/MODULE_CONTRACT.md`
- `docs/product/platform-files-sprints.md`
- `docs/agents/stacks/platform-object-storage.md`

## Modelo De Dados

Tabela `platform_files`:

- `id`;
- `client_id`;
- `source_module`;
- `source_entity_type`;
- `source_entity_id`;
- `usage`;
- `file_name`;
- `content_type`;
- `size_bytes`;
- `storage_bucket`;
- `storage_key`;
- `uploaded_by_identity_id`;
- `created_at`.

`storage_key` e sempre gerada no backend no formato:

`{client_id}/{source_module}/{source_entity_type}/{source_entity_id}/{usage}/{file_id}-{safe_file_name}`

## Regras

- Nunca aceitar `client_id`, `storage_bucket` ou `storage_key` do frontend.
- Validar MIME e tamanho por `usage`.
- Todas as queries de metadata filtram por `client_id`.
- Downloads usam URL assinada com TTL curto; sem URL publica permanente.
- Services de dominio devem validar a entidade de origem antes de chamar `PlatformFilesService`.

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:pdv`
  - purpose: cadastro de produto com upload de imagem e cardapio publico da comanda.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `jboot-fiscal`, `minio`.
    - optional: `rabbitmq`.
    - forbidden_by_default: `mongodb`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`, `9000`.
  - healthchecks: `GET /health` em Identity e Platform; `GET /minio/health/live`.
  - seed_dependencies: schema PDV e migracao `049_platform_files.sql`.
  - expected_resource_profile: medio; adiciona object storage local para upload.

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/bff-jboot-platform`.

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/platform-files
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - docs/skills/security-checklist/SKILL.md
```
