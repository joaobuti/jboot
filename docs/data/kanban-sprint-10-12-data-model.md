# Kanban Sprints 10–12 — Modelo De Dados Proposto

Status: `planned`; confirmado no gate humano de 2026-10-14. Nenhuma migration
foi criada.

## Ownership E Bancos

| Dados | Owner | Banco |
|---|---|---|
| identidade, membership, entitlement e scopes | Identity | `jboot_identity` |
| escritorios, vinculos e comandos de provisionamento Flow | Kanban | banco dedicado do tenant |
| providers, credenciais, agentes e execucoes | AI Gateway | banco proprio do servico |
| contribuicoes do menu Configuracoes | Platform Web | registry tipado em codigo |

Nao existem FKs entre bancos. Toda referencia externa e validada pelo servico
proprietario e acompanhada de `client_id`, IDs imutaveis e reconciliacao.

## Provisionamento De Usuario Flow

```text
kanban_user_provisioning_commands
  id uuid primary key
  client_id uuid not null
  idempotency_key varchar(128) not null
  request_sha256 char(64) not null
  target_identity_id uuid null
  actor_identity_id uuid not null
  actor_mode text not null check (actor_mode in ('tenant_manager','delegated'))
  state text not null check (state in ('pending','completed','compensating','failed'))
  identity_step text not null
  office_step text not null
  error_code varchar(80) null
  created_at timestamptz not null
  updated_at timestamptz not null
  completed_at timestamptz null
  unique (client_id, idempotency_key)

kanban_user_provisioning_offices
  command_id uuid not null
  client_id uuid not null
  office_id uuid not null
  primary key (command_id, office_id)
  foreign key (client_id, office_id) -> kanban_offices(client_id, id)
```

O request guarda hash, nunca senha ou documento pessoal redundante. Dados
necessarios ao Identity trafegam durante a operacao e permanecem somente no
owner. Para ator `delegated`, os escritorios persistidos sao recalculados pelo
backend a partir dos vinculos ativos do ator; `officeIds` recebido e ignorado.

## Catalogo De Provider

```text
ai_provider_catalog
  provider varchar(64) primary key
  display_name varchar(120) not null
  credential_schema_version integer not null
  capabilities jsonb not null
  status text not null check (status in ('planned','active','disabled'))
  adapter_version varchar(80) null
  updated_at timestamptz not null
```

O catalogo e fechado e versionado. `capabilities` descreve modelos, structured
output, streaming e limites, mas nao concede autorizacao.

## Credenciais BYOK

```text
ai_credentials
  id uuid primary key
  client_id uuid not null
  owner_identity_id uuid not null
  provider varchar(64) not null
  api_key_ciphertext bytea not null
  encryption_key_version integer not null
  api_key_last4 varchar(4) not null
  status text not null check (status in ('pending_validation','active','invalid','revoked'))
  validated_at timestamptz null
  created_at timestamptz not null
  updated_at timestamptz not null
  revoked_at timestamptz null
  unique (client_id, owner_identity_id, provider)
```

AES-256-GCM usa AAD composta por `client_id|owner_identity_id|provider|id`.
Chave mestra e versao ficam fora do banco. GET retorna somente ID, provider,
`last4`, status e timestamps.

## Agentes E Versoes

```text
ai_agents
  id uuid primary key
  client_id uuid not null
  owner_identity_id uuid not null
  application_slug varchar(80) not null
  credential_id uuid not null
  provider varchar(64) not null
  name varchar(120) not null
  description varchar(500) null
  model varchar(120) not null
  external_reference varchar(255) null
  active_version integer not null
  status text not null check (status in ('draft','active','inactive','deleted'))
  created_at timestamptz not null
  updated_at timestamptz not null
  unique (client_id, owner_identity_id, application_slug, name)

ai_agent_versions
  id uuid primary key
  agent_id uuid not null
  version integer not null
  system_prompt_ciphertext bytea not null
  encryption_key_version integer not null
  response_mode text not null check (response_mode in ('text','json_schema'))
  output_schema_json jsonb not null
  allowed_tools_json jsonb not null default '[]'
  tool_policy_version integer not null default 1
  content_sha256 char(64) not null
  created_by_identity_id uuid not null
  created_at timestamptz not null
  unique (agent_id, version)
```

`external_reference` e somente rastreabilidade. O comportamento vem do prompt,
mas a autoridade executavel vem de `allowed_tools_json`, resolvido contra um
registry fechado de schemas e policies. Alteracao de prompt, modo, schema ou
tool manifest cria versao; nunca sobrescreve historico. Tool call e solicitacao
nao confiavel: o owner do dominio reautoriza recurso, tenant e transicao.

## Conexoes ChatGPT Plan

```text
ai_plan_connections
  id uuid primary key
  client_id uuid not null
  owner_identity_id uuid not null
  provider varchar(64) not null check (provider = 'openai')
  provider_subject_hash char(64) not null
  encrypted_token_set bytea not null
  encryption_key_version integer not null
  granted_scopes text[] not null
  automation_authorized_at timestamptz null
  status text not null check (status in ('pending','active','revoked','ineligible'))
  created_at timestamptz not null
  updated_at timestamptz not null
  unique (client_id, owner_identity_id, provider)
```

Em desenvolvimento, o operador do projeto designa sua identidade/conexao. Em
producao, cada tenant designa uma identidade responsavel e autoriza o uso em
background. Tokens nunca ficam em `ai_credentials`, browser, regra ou fila;
revogacao/ineligibilidade pausa automacoes sem fallback para API key.

## Execucoes

`POST /v1/interactions` reutiliza o ledger abaixo, mas o texto/JSON retornado
ao navegador existe apenas na resposta HTTP original. Input, prompt e output
integrais nao sao persistidos; replay preserva idempotencia e devolve
`outputAvailable=false`, evitando reexecutar uma inferencia paga.

```text
ai_executions
  id uuid primary key
  client_id uuid not null
  requester_identity_id uuid not null
  agent_id uuid not null
  agent_version integer not null
  application_slug varchar(80) not null
  source_type varchar(80) not null
  source_id uuid not null
  idempotency_key varchar(160) not null
  provider varchar(64) not null
  model varchar(120) not null
  status text not null check (status in ('pending','running','succeeded','failed','cancelled'))
  input_sha256 char(64) not null
  output_sha256 char(64) null
  input_tokens integer null
  output_tokens integer null
  estimated_cost numeric(18,8) null
  latency_ms integer null
  error_code varchar(80) null
  attempt_count integer not null default 0
  lease_until timestamptz null
  next_attempt_at timestamptz null
  created_at timestamptz not null
  started_at timestamptz null
  finished_at timestamptz null
  unique (client_id, application_slug, idempotency_key)
```

Input/output integrais nao entram no ledger. Tool calls validadas sao a excecao
minima: ficam cifradas com AAD vinculada a execucao, tenant e aplicacao para que
um replay idempotente recupere a mesma solicitacao sem repetir inferencia paga.
Se outro efeito exigir conteudo, o owner do dominio guarda snapshot
cifrado/canonico sob sua politica e fornece referencia temporaria autorizada;
o gateway conserva somente hashes, metricas e o envelope cifrado das tool calls.

## Automacao Kanban

`kanban_column_automation_rules.action_type` ganha
`execute_ai_agent`. `action_config` validado armazena somente:

```json
{
  "agentId": "uuid",
  "inputPolicyVersion": 1,
  "toolPolicyVersion": 1,
  "connectionId": "uuid"
}
```

O prompt pode resultar em zero ou mais tool calls presentes no manifest da
versao do agente. Cada chamada recebe idempotency key propria, schema estrito e
reautorizacao no Kanban; tool output pode alimentar uma continuacao limitada.

Uma outbox duravel liga `source_activity_id` ou `dispatch_date` a
`ai_execution_id`. A constraint existente de exatamente uma origem permanece;
o replay usa idempotency key derivada da regra + card + origem.

## Indices E Retencao

- indices por `(client_id, owner_identity_id, provider/status)` e
  `(client_id, application_slug, status, created_at)`;
- credencial revogada e prompt inativo nao sao fisicamente apagados enquanto
  houver evidencia de execucao sob retencao;
- expurgo separa ciphertext operacional de ledger de auditoria;
- prazos definitivos dependem da politica do provider e do contrato do cliente.
