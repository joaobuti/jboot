# Flow Juridico Foundation — Modelo De Dados Proposto

Status: `accepted`; human gate da ADR 015 aprovado em 2026-10-13.

## Ownership

- `establishment-customers`: `pdv_establishment_customers` e
  `customer_juridico`.
- `kanban`: escritorios, visibilidade, cards, documentos, sync e auditoria.
- Toda tabela possui `client_id`; FKs compostas impedem referencia cross-tenant.

## Clientes E Escritorios

```text
kanban_customer_offices
  client_id uuid not null
  customer_id uuid not null
  office_id uuid not null
  source text not null check (source in ('flow_customer','card','admin','migration'))
  linked_at timestamptz not null
  linked_by_identity_id uuid null
  unlinked_at timestamptz null
  unlinked_by_identity_id uuid null
  unlink_reason text null
  primary key (client_id, customer_id, office_id, linked_at)
  foreign key (client_id, office_id) -> kanban_offices(client_id, id)
```

O historico e append-only: transferencia de card nao apaga vinculos. Um indice
parcial unico em `(client_id, customer_id, office_id) where unlinked_at is null`
impede vinculo ativo duplicado. A existencia do cliente e validada pelo service
proprietario antes da gravacao; nao se cria FK cross-database para o cadastro.

Clientes legados sem vinculo ativo ficam visiveis somente a `flow:admin` ate
classificacao explicita. A ativacao desse comportamento depende de confirmacao
humana registrada na ADR 015.

## Idempotencia Do Comando Cliente Para Card

```text
kanban_customer_card_commands
  id uuid primary key
  client_id uuid not null
  idempotency_key varchar(128) not null
  customer_id uuid not null
  board_id uuid not null
  column_id uuid not null
  office_id uuid not null
  card_id uuid null
  request_hash char(64) not null
  status text not null check (status in ('processing','completed','failed'))
  error_code text null
  created_by_identity_id uuid not null
  created_at timestamptz not null
  completed_at timestamptz null
  unique (client_id, idempotency_key)
```

Replay com o mesmo hash devolve o mesmo `card_id`; mesma chave com payload
diferente retorna `409 idempotency_conflict`. Falha antes do commit nao deixa
card parcial. Falha externa posterior e reconciliada por outbox.

## Configuracao Drive

```text
kanban_drive_configurations
  client_id uuid primary key
  provider text not null default 'google_drive'
  credential_mode text not null check (credential_mode in ('oauth','service_account'))
  secret_ref text not null
  root_folder_id text not null
  status text not null check (status in ('inactive','active','paused','invalid'))
  retention_policy jsonb not null
  last_tested_at timestamptz null
  last_success_at timestamptz null
  last_error_code text null
  updated_by_identity_id uuid not null
  updated_at timestamptz not null
```

`secret_ref` aponta para secret store; token, private key e refresh token nunca
entram no PostgreSQL, GET, log, evento, metrica ou fila.

## Replica E Outbox

```text
kanban_document_syncs
  id uuid primary key
  client_id uuid not null
  document_id uuid not null
  document_version integer not null
  checksum char(64) not null
  provider text not null
  remote_file_id text null
  remote_version text null
  state text not null check (state in ('pending','syncing','synced','failed','paused','deleted'))
  attempt_count integer not null default 0
  lease_until timestamptz null
  next_attempt_at timestamptz null
  last_error_code text null
  created_at timestamptz not null
  updated_at timestamptz not null
  unique (client_id, document_id, document_version, checksum, provider)
```

A propria linha `pending` e a outbox transacional criada somente depois da
persistencia da versao canonica. Claim por lease torna reentrega idempotente.
DLQ e estado derivam da linha persistida, nao do payload efemero do BullMQ.

## Configuracao E Execucao De IA

Somente modelo reservado; adapter permanece bloqueado:

```text
kanban_ai_configurations
  client_id, provider, model, secret_ref, enabled, monthly_limit,
  accepted_by_identity_id, accepted_at, kill_switch, updated_at

kanban_ai_runs
  id, client_id, input_hash, pipeline_version, provider, model,
  prompt_version, schema_version, status, tokens_in, tokens_out,
  estimated_cost, latency_ms, error_code, created_at, completed_at
```

Prompts, respostas e documentos nao entram nessas tabelas de telemetria. Inputs
documentais usam snapshots imutaveis e storage canonico com referencias por ID.

## Retencao, Legal Hold, RPO E RTO

- RPO zero para metadados commitados e versoes canonicas confirmadas.
- RTO inicial de 4 horas.
- `legal_hold` impede expurgo canonico e da replica.
- Fora de legal hold, exclusao remota acompanha somente exclusao canonica
  aprovada e auditada; desconectar/pausar nao apaga objetos.
