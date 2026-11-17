# Project Contract: svc-jboot-fiscal

## Status

```yaml
lifecycle_status: scaffolded
production_readiness: blocked
status_evidence: emissao e integracao automatizadas em container; falta evidencia de autorizacao SEFAZ em homologacao e Definition of Done completa
last_status_review: 2026-10-11
```

Decisoes de stack, comunicacao, certificados e escopo confirmadas pelo PO e PE.
O serviço possui implementação e testes locais, mas permanece `scaffolded` e bloqueado
para produção até a homologação externa e todos os itens do gate mínimo serem concluídos.

## Identificacao Do Servico

| Campo            | Valor                        |
|------------------|------------------------------|
| Slug             | `svc-jboot-fiscal`           |
| Tipo             | Servico de dominio interno   |
| Runtime          | PHP 8.x + Laravel 13         |
| Porta local      | `8090`                       |
| Banco proprio    | `jboot_fiscal` (PostgreSQL)  |
| Ambiente dev     | Container `jboot` (PHP CLI + Composer ja incluidos) |

O servico e exclusivamente interno. Nao tem frontend, nao e uma aplicacao do Identity
(sem `application_slug` no hub), nao aparece na tela de selecao pos-login.
Acesso externo somente por BFFs autorizados via JWT de servico.

## Stack

- PHP 8.x
- Laravel 13
- `nfephp-org/sped-nfe` (NFC-e, NF-e) — Sprint 1
- `nfephp-org/sped-nfse` — Sprint 2 (NFS-e, alta complexidade municipal)
- PostgreSQL dedicado (`jboot_fiscal`) — banco proprio do servico, sem compartilhamento com PDV/Platform
- Sem cache distribuido na Sprint 1 (idempotencia resolvida em banco)
- Sem worker/fila asyncrona na Sprint 1 (emissao sincrona com retry no chamador)

Dependencias externas:
- SEFAZ estadual (NFC-e/NF-e) via `sped-nfe`
- Identity Hub (validacao JWT s2s)

## Responsabilidade

Emitir, consultar, cancelar e inutilizar documentos fiscais eletronicos (NFC-e e NF-e)
em nome dos tenants da plataforma JBoot.

O servico:
- recebe solicitacoes de BFFs autorizados;
- valida JWT de servico assinado pelo Identity Hub;
- isola certificados e numeracao por `(client_id, cnpj_emitente)`;
- assina e transmite XML para SEFAZ;
- armazena XML de envio e retorno com auditoria imutavel;
- retorna DANFE/QR Code ao chamador;
- nao calcula impostos, nao autentica usuarios finais, nao tem frontend.

## Agents Locais

- `agents/fiscal-service.md`: dominio fiscal, regras de emissao, idempotencia, contingencia, auditoria.
- `agents/fiscal-integrations.md`: integracao sped-nfe, SEFAZ, certificados A1, retry/backoff, contingencia DPEC.

## Skills Locais

- `skills/fiscal-contracts.md`: estrutura dos endpoints, shapes de request/response, codigos de erro.
- `skills/fiscal-risk-review.md`: checklist de risco antes de qualquer implementacao fiscal (certificado, numeracao, auditoria, idempotencia).

## Ativacao Obrigatoria

Antes de qualquer codigo neste projeto, declarar:

```text
Agent Activation:
  project: implementations/svc-jboot-fiscal
  module: none
  using_agent:
    - implementations/svc-jboot-fiscal/agents/fiscal-service.md
    - implementations/svc-jboot-fiscal/agents/fiscal-integrations.md
  using_skill:
    - implementations/svc-jboot-fiscal/skills/fiscal-contracts.md
    - implementations/svc-jboot-fiscal/skills/fiscal-risk-review.md
  referenced_only:
    - docs/agents/stacks/backend-php-laravel.md: padroes detalhados PHP/Laravel
  not_using: []
```

Se esse bloco nao for mostrado antes da implementacao, a execucao e nao aderente ao
contrato, mesmo que passe em build/testes.

---

## Modelo De Dados

Banco: `jboot_fiscal` (PostgreSQL dedicado ao servico).
Todas as tabelas de dominio incluem `client_id` (UUID) para isolamento de tenant.
IDs primarios: UUID.

### fiscal_certificates

Certificados A1 por tenant/CNPJ. Uma row por `(client_id, cnpj_emitente)`.

```sql
fiscal_certificates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  cnpj_emitente    varchar(14) NOT NULL,
  pfx_encrypted    bytea NOT NULL,          -- AES-256-GCM, chave em env
  encryption_iv    bytea NOT NULL,          -- IV do AES-GCM
  encryption_tag   bytea NOT NULL,          -- tag de autenticacao GCM
  password_hint    varchar(255),            -- hint (nao a senha) do PFX; pode ser NULL
  valid_from       timestamptz NOT NULL,
  valid_until      timestamptz NOT NULL,
  serial_number    varchar(128) NOT NULL,
  subject_cn       varchar(512) NOT NULL,
  ambiente         varchar(16) NOT NULL CHECK (ambiente IN ('homologacao','producao')),
  status           varchar(32) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','expired','revoked')),
  alerted_at       timestamptz,             -- ultima vez que alerta 30d foi emitido
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, cnpj_emitente, ambiente)
)
```

### fiscal_tenant_config

Configurações fiscais por tenant/CNPJ. Fonte de verdade para `serie`, `ambiente`, CSC e CFOP padrão.
`serie` **nunca** vem do caller de emissão — é resolvida daqui.

```sql
fiscal_tenant_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  cnpj_emitente    varchar(14) NOT NULL,
  ambiente         varchar(16) NOT NULL CHECK (ambiente IN ('homologacao','producao')),
  serie_nfce       smallint NOT NULL DEFAULT 1,
  serie_nfe        smallint NOT NULL DEFAULT 1,
  csc              text,               -- segredo NFC-e; aceito somente na escrita e mascarado na leitura
  csc_id           text,               -- ID do CSC
  regime_fiscal    text NOT NULL DEFAULT 'simples'
                     CHECK (regime_fiscal IN ('simples','lucro_presumido','lucro_real')),
  cfop_padrao_nfce text,               -- CFOP padrão para NFC-e; fallback se item não traz CFOP
  cfop_padrao_nfe  text,               -- CFOP padrão para NF-e
  icms_cst_padrao  text,
  pis_cst_padrao   text,
  cofins_cst_padrao text,
  razao_social     text NOT NULL,
  nome_fantasia    text,
  inscricao_estadual text NOT NULL,
  telefone         text,
  email            text,
  address_logradouro text NOT NULL,
  address_numero     text NOT NULL,
  address_complemento text,
  address_bairro     text NOT NULL,
  address_municipio  text NOT NULL,
  address_uf         varchar(2) NOT NULL,
  address_cep        varchar(8) NOT NULL,
  address_codigo_municipio varchar(7) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, cnpj_emitente)
)
```

Regras:
- Emissão sem config cadastrada rejeita com `422 fiscal_config_not_found`.
- Troca de `serie_nfce`/`serie_nfe`: nova row em `fiscal_document_sequences` com `ultimo_numero = 0`; sequência antiga preservada.
- `cfop` por item na emissão tem prioridade sobre `cfop_padrao_*`; se nenhum definido → `422 cfop_required`.

### fiscal_document_sequences

Numeracao sequencial atomica por `(cnpj_emitente, tipo_documento, serie)`.
Incremento feito com `SELECT ... FOR UPDATE` ou `UPDATE ... RETURNING` para atomicidade.

```sql
fiscal_document_sequences (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  cnpj_emitente    varchar(14) NOT NULL,
  tipo_documento   varchar(16) NOT NULL CHECK (tipo_documento IN ('nfce','nfe')),
  serie            smallint NOT NULL,
  ultimo_numero    integer NOT NULL DEFAULT 0,
  ambiente         varchar(16) NOT NULL CHECK (ambiente IN ('homologacao','producao')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, cnpj_emitente, tipo_documento, serie, ambiente)
)
```

### fiscal_documents

Registro principal de cada documento fiscal emitido ou em processo.

```sql
fiscal_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  request_id       uuid NOT NULL UNIQUE,    -- UUID do chamador; chave de idempotencia
  cnpj_emitente    varchar(14) NOT NULL,
  tipo_documento   varchar(16) NOT NULL CHECK (tipo_documento IN ('nfce','nfe')),
  serie            smallint NOT NULL,
  numero           integer NOT NULL,
  chave_acesso     varchar(44) UNIQUE,       -- NULL ate aprovacao SEFAZ
  ambiente         varchar(16) NOT NULL CHECK (ambiente IN ('homologacao','producao')),
  status           varchar(32) NOT NULL DEFAULT 'pending'
                     CHECK (status IN (
                       'pending','processing','authorized','rejected',
                       'cancelled','inutilized','contingency'
                     )),
  protocolo        varchar(64),
  data_emissao     timestamptz NOT NULL,
  data_autorizacao timestamptz,
  data_cancelamento timestamptz,
  motivo_cancelamento varchar(255),
  contingencia_tipo varchar(32),            -- 'dpec' | NULL
  contingencia_data timestamptz,
  retry_count      smallint NOT NULL DEFAULT 0,  -- tentativas de reenvio em contingencia
  xml_envio        text NOT NULL,           -- XML assinado enviado ao SEFAZ
  xml_retorno      text,                    -- XML de retorno completo do SEFAZ
  danfe_pdf        bytea,                   -- PDF do DANFE/DANFCE
  qrcode_url       text,                    -- URL do QR Code (NFC-e)
  ip_origem        inet,                    -- IP do BFF chamador
  caller_service   varchar(128),            -- identificador do BFF (ex: bff-platform-pdv)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
)
```

Index obrigatorio:
- `(client_id, cnpj_emitente, tipo_documento, serie, numero, ambiente)` UNIQUE
- `(client_id, status)`
- `(request_id)` UNIQUE (ja coberto pelo UNIQUE acima)

### fiscal_document_events

Auditoria imutavel de cada transicao de estado. Nunca atualizar rows.
Retencao: 5 anos (via particao por ano ou job de archival — TBD operacional).

```sql
fiscal_document_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_document_id uuid NOT NULL REFERENCES fiscal_documents(id),
  client_id        uuid NOT NULL,
  event_type       varchar(64) NOT NULL,    -- ex: 'emissao_solicitada', 'enviado_sefaz',
                                            -- 'autorizado', 'rejeitado', 'cancelado',
                                            -- 'inutilizado', 'contingencia_ativada'
  status_anterior  varchar(32),
  status_novo      varchar(32) NOT NULL,
  sefaz_codigo     varchar(16),            -- codigo de retorno SEFAZ
  sefaz_motivo     text,                   -- descricao do retorno SEFAZ
  payload_resumo   jsonb,                  -- dados nao sensiveis do evento
  ip_origem        inet,
  caller_service   varchar(128),
  created_at       timestamptz NOT NULL DEFAULT now()
)
```

### fiscal_cancellations

Detalhes de cancelamento e CC-e (NF-e apenas).

```sql
fiscal_cancellations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_document_id   uuid NOT NULL REFERENCES fiscal_documents(id),
  client_id            uuid NOT NULL,
  tipo                 varchar(16) NOT NULL CHECK (tipo IN ('cancelamento','cce')),
  numero_sequencial    smallint,           -- sequencia da CC-e (1..20)
  justificativa        text NOT NULL,      -- minimo 15 chars (regra SEFAZ)
  xml_evento           text NOT NULL,
  xml_retorno_evento   text,
  protocolo_evento     varchar(64),
  status               varchar(32) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','authorized','rejected')),
  ip_origem            inet,
  caller_service       varchar(128),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
)
```

### fiscal_inutilizations

Registro de faixas de numeracao inutilizadas junto ao SEFAZ.

```sql
fiscal_inutilizations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  cnpj_emitente    varchar(14) NOT NULL,
  tipo_documento   varchar(16) NOT NULL CHECK (tipo_documento IN ('nfce','nfe')),
  serie            smallint NOT NULL,
  numero_ini       integer NOT NULL,
  numero_fim       integer NOT NULL,
  ambiente         varchar(16) NOT NULL CHECK (ambiente IN ('homologacao','producao')),
  justificativa    text NOT NULL,
  xml_envio        text NOT NULL,
  xml_retorno      text,
  protocolo        varchar(64),
  status           varchar(32) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','authorized','rejected')),
  ip_origem        inet,
  caller_service   varchar(128),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, cnpj_emitente, tipo_documento, serie, numero_ini, numero_fim, ambiente)
)
```

---

## Contrato OpenAPI v1

Base URL (local): `http://localhost:8090/api/v1`

Autenticacao: `Authorization: Bearer <jwt_servico>` em todos os endpoints.
O JWT e emitido pelo Identity Hub para o servico chamador (s2s), nao para usuario final.

Os campos de request abaixo representam o shape minimo contratado. Dados fiscais
completos do documento (itens, impostos pre-calculados, emitente, destinatario) transitam
dentro do campo `dados_documento` como objeto estruturado — o shape detalhado desse campo
sera definido na Sprint 1 em `docs/api/fiscal-sprint-1-openapi.yaml` antes do primeiro
endpoint ser implementado.

---

### POST /emissao/nfce

Emissao de NFC-e. Idempotente por `request_id`.

**Request**

```json
{
  "request_id": "uuid-gerado-pelo-chamador",
  "cnpj_emitente": "12345678000195",
  "dados_documento": {
    "data_emissao": "2026-06-23T10:00:00-03:00",
    "consumidor_final": true,
    "presenca": 1,
    "itens": [ "..." ],
    "pagamentos": [ "..." ],
    "totais": { "..." }
  }
}
```

> `serie` e `ambiente` **não são passados pelo caller** — resolvidos de `fiscal_tenant_config`
> pelo serviço. Ver Sprint B em `docs/product/fiscal-pdv-integration-sprints.md`.

**Response 201 — Emitida e autorizada**

```json
{
  "fiscal_document_id": "uuid",
  "request_id": "uuid-gerado-pelo-chamador",
  "chave_acesso": "44 digitos",
  "protocolo": "string",
  "status": "authorized",
  "data_autorizacao": "2026-06-23T10:00:05-03:00",
  "danfe_pdf_base64": "base64",
  "qrcode_url": "https://..."
}
```

**Response 200 — Idempotencia (request_id ja processado)**

Mesmo shape do 201 com o resultado original.

**Response 202 — Contingencia ativada**

```json
{
  "fiscal_document_id": "uuid",
  "request_id": "uuid",
  "status": "contingency",
  "contingencia_tipo": "dpec",
  "mensagem": "SEFAZ indisponivel. Documento em contingencia DPEC."
}
```

**Response 422 — Rejeicao SEFAZ ou validacao**

```json
{
  "error": "fiscal_rejection",
  "sefaz_codigo": "999",
  "sefaz_motivo": "Descricao do rejeite",
  "fiscal_document_id": "uuid"
}
```

**Response 409 — Certificado expirado**

```json
{
  "error": "certificate_expired",
  "cnpj_emitente": "12345678000195",
  "valid_until": "2025-01-01T00:00:00Z"
}
```

---

### POST /emissao/nfe

Emissao de NF-e. Mesmo padrao de idempotencia e contingencia.

**Request**

```json
{
  "request_id": "uuid-gerado-pelo-chamador",
  "cnpj_emitente": "12345678000195",
  "dados_documento": {
    "data_emissao": "2026-06-23T10:00:00-03:00",
    "natureza_operacao": "Venda de mercadoria",
    "finalidade": 1,
    "consumidor_final": false,
    "presenca": 9,
    "destinatario": { "..." },
    "itens": [ "..." ],
    "pagamentos": [ "..." ],
    "totais": { "..." },
    "transporte": { "..." }
  }
}
```

> `serie` e `ambiente` **não são passados pelo caller** — resolvidos de `fiscal_tenant_config`.

**Response 201 — Autorizada**

```json
{
  "fiscal_document_id": "uuid",
  "request_id": "uuid",
  "chave_acesso": "44 digitos",
  "protocolo": "string",
  "status": "authorized",
  "data_autorizacao": "2026-06-23T10:00:05-03:00",
  "danfe_pdf_base64": "base64"
}
```

Responses 200, 202, 422, 409: mesmo padrao do `/emissao/nfce`.

---

### GET /documentos/{fiscal_document_id}/status

Consulta status de documento por ID interno.
Tambem aceita `?chave_acesso=44digitos` como alternativa ao path param.

**Response 200**

```json
{
  "fiscal_document_id": "uuid",
  "request_id": "uuid",
  "chave_acesso": "44 digitos",
  "tipo_documento": "nfce",
  "serie": 1,
  "numero": 42,
  "status": "authorized",
  "protocolo": "string",
  "data_emissao": "2026-06-23T10:00:00-03:00",
  "data_autorizacao": "2026-06-23T10:00:05-03:00",
  "ambiente": "homologacao",
  "cancelamento": null
}
```

**Response 404**

```json
{ "error": "document_not_found" }
```

---

### POST /documentos/{fiscal_document_id}/cancelamento

Cancelamento de NFC-e ou NF-e. Valida prazo legal por tipo e UF.

**Request**

```json
{
  "request_id": "uuid-gerado-pelo-chamador",
  "justificativa": "Minimo 15 caracteres obrigatorio"
}
```

**Response 200 — Cancelado**

```json
{
  "fiscal_document_id": "uuid",
  "status": "cancelled",
  "protocolo_cancelamento": "string",
  "data_cancelamento": "2026-06-23T11:00:00-03:00"
}
```

**Response 422 — Fora do prazo ou rejeicao SEFAZ**

```json
{
  "error": "cancellation_deadline_exceeded",
  "tipo_documento": "nfce",
  "prazo_maximo_horas": 24,
  "data_emissao": "2026-06-23T10:00:00-03:00"
}
```

```json
{
  "error": "fiscal_rejection",
  "sefaz_codigo": "999",
  "sefaz_motivo": "Descricao"
}
```

---

### POST /numeracao/inutilizacao

Inutilizacao de faixa de numeracao junto ao SEFAZ.

**Request**

```json
{
  "request_id": "uuid-gerado-pelo-chamador",
  "client_id": "uuid",
  "cnpj_emitente": "12345678000195",
  "tipo_documento": "nfe",
  "serie": 1,
  "numero_ini": 10,
  "numero_fim": 15,
  "ambiente": "homologacao",
  "justificativa": "Numeros nao utilizados por falha operacional"
}
```

**Response 201 — Inutilizado**

```json
{
  "inutilization_id": "uuid",
  "request_id": "uuid",
  "protocolo": "string",
  "status": "authorized",
  "data_inutilizacao": "2026-06-23T12:00:00-03:00"
}
```

**Response 422**

```json
{
  "error": "fiscal_rejection",
  "sefaz_codigo": "999",
  "sefaz_motivo": "Descricao"
}
```

---

### POST /documentos/{fiscal_document_id}/cce

Carta de Correcao Eletronica (CC-e). Apenas NF-e. Maximo 20 eventos por documento.

**Request**

```json
{
  "request_id": "uuid-gerado-pelo-chamador",
  "correcao": "Texto da correcao com minimo 15 caracteres"
}
```

**Response 201 — Autorizado**

```json
{
  "cancellation_id": "uuid",
  "fiscal_document_id": "uuid",
  "numero_sequencial": 1,
  "protocolo": "string",
  "status": "authorized",
  "data_evento": "2026-06-23T13:00:00-03:00"
}
```

**Response 422 — NFC-e ou limite excedido**

```json
{
  "error": "cce_not_allowed",
  "motivo": "CC-e nao e permitida para NFC-e"
}
```

```json
{
  "error": "cce_limit_exceeded",
  "numero_sequencial_atual": 20
}
```

---

### GET /config

Retorna a configuração fiscal do tenant (`fiscal_tenant_config`).

**Response 200**

```json
{
  "cnpj_emitente": "12345678000195",
  "ambiente": "homologacao",
  "serie_nfce": 1,
  "serie_nfe": 1,
  "csc": "...",
  "csc_id": "...",
  "regime_fiscal": "simples",
  "cfop_padrao_nfce": "5102",
  "cfop_padrao_nfe": "5102"
}
```

**Response 404** — config não cadastrada ainda.

---

### PUT /config

Cria ou atualiza a configuração fiscal (upsert por `client_id` + `cnpj_emitente`).
Troca de série cria nova `fiscal_document_sequences` automaticamente.

**Request**

```json
{
  "cnpj_emitente": "12345678000195",
  "ambiente": "homologacao",
  "serie_nfce": 1,
  "serie_nfe": 1,
  "csc": "...",
  "csc_id": "...",
  "regime_fiscal": "simples",
  "cfop_padrao_nfce": "5102",
  "cfop_padrao_nfe": "5102"
}
```

**Response 200** — config salva.

---

### Health Check

**GET /health**

```json
{ "status": "ok", "timestamp": "2026-06-23T10:00:00Z" }
```

---

## Variaveis De Ambiente Obrigatorias

```env
# Banco de dados proprio do servico
DB_HOST=
DB_PORT=5432
DB_DATABASE=jboot_fiscal
DB_USERNAME=
DB_PASSWORD=

# Chave mestra AES-256-GCM do servico para criptografia de certificados A1 (hex 64 chars = 32 bytes).
# Esta e UMA chave unica do servico — nao e por cliente.
# Cada cliente tem seu proprio .pfx armazenado criptografado no banco com esta chave mestra + IV unico.
# Em producao: injetar via secret manager (Vault ou equivalente), nunca commitar em .env real.
FISCAL_CERT_ENCRYPTION_KEY=

# Identity Hub — URL para validacao do JWT de servico
IDENTITY_HUB_JWKS_URL=http://localhost:8000/.well-known/jwks.json

# Identificador deste servico (registrado no aud/claims do JWT s2s)
FISCAL_SERVICE_AUDIENCE=svc:fiscal

# Ambiente padrao SEFAZ (pode ser sobrescrito por request)
SEFAZ_AMBIENTE_PADRAO=homologacao

# Timeout e retry para chamadas SEFAZ
SEFAZ_TIMEOUT_MS=30000
SEFAZ_RETRY_MAX=3
SEFAZ_RETRY_BACKOFF_BASE_MS=1000

# Alerta de certificado prestes a expirar (dias antes)
CERT_ALERT_DAYS_BEFORE=30

# Porta da API
APP_PORT=8090

# Logging
LOG_LEVEL=info
APP_ENV=local
```

---

## Dependencias

| Dependencia       | Tipo            | Protocolo         | Notas                                      |
|-------------------|-----------------|-------------------|--------------------------------------------|
| Identity Hub      | Runtime         | HTTP JWKS         | Validacao do JWT s2s; URL em env           |
| PostgreSQL        | Runtime         | TCP 5432          | Banco `jboot_fiscal` dedicado              |
| SEFAZ (SPED)      | Runtime externo | HTTPS/SOAP        | Via `nfephp-org/sped-nfe`                 |
| Container `jboot` | Dev             | PHP CLI/Composer  | Ja incluso na infra Docker                 |

O servico nao depende de Redis, RabbitMQ, Temporal ou qualquer outro broker na Sprint 1.

---

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:fiscal`
  - purpose: preparar o ambiente local minimo do servico fiscal.
  - containers:
    - required: `postgres`, `jboot`, `jboot-fiscal`.
    - optional: nenhum por padrao.
    - forbidden_by_default: `mongodb`, `valkey`, `rabbitmq`, `temporal`, `redpanda`, `minio`, `clickhouse`, `qdrant`, `otel-collector`, `temporal-ui`.
  - app_processes:
    - required: `fiscal-service` em `http://localhost:8090`.
    - forbidden_by_default: Identity, Platform, workers nao relacionados.
  - ports: `5432`, `8090`.
  - healthchecks: `GET http://localhost:8090/api/health`.
  - seed_dependencies: `docker/postgres/init/024_fiscal.sql`; migrations Laravel aplicadas antes do smoke integrado.
  - expected_resource_profile: baixo a moderado; dependências de desenvolvimento do Composer são incluídas somente na imagem local de testes via `INSTALL_DEV_DEPENDENCIES=true`.

Comando:

```bash
make code-up TARGET=fiscal
```

O target inicia o serviço em `http://localhost:8090`; o build não incorpora segredos de
runtime. Testes, Pint e Composer executam na imagem local com dependências de desenvolvimento.

### Architecture Graph

Esta entrega altera serviço, BFF, frontend, banco e arestas HTTP. A obrigação de migração
para o Architecture Graph fica registrada até a disponibilização do registry/gate prevista
na Sprint 4 de `docs/product/api-graph-sprints.md`; não se afirma sincronização do grafo.

---

## Gate Minimo de Sprint 1

A Sprint 1 esta concluida quando TODOS os criterios abaixo forem atendidos:

### Infraestrutura e Configuracao

- [ ] Projeto Laravel criado em `implementations/svc-jboot-fiscal/`
- [ ] Migrations Laravel para todas as tabelas do modelo de dados acima
- [ ] `make code-up TARGET=fiscal` sobe o servico e retorna 200 em `GET /health`
- [ ] Variaveis de ambiente documentadas em `.env.example` local do projeto
- [ ] Seed `024_fiscal.sql` aplicado sem erros (certificado de homologacao + sequencia inicial)

### Autenticacao s2s

- [ ] Middleware valida JWT de servico emitido pelo Identity Hub (JWKS)
- [ ] Requisicao sem JWT ou com JWT invalido retorna 401
- [ ] `client_id` extraido do JWT e aplicado em todas as queries

### Certificados

- [ ] `POST /api/v1/certificados` (interno) salva PFX criptografado com AES-256-GCM
- [ ] Leitura do certificado decripta corretamente antes de assinar XML
- [ ] Certificado expirado bloqueia emissao com response 409

### Emissao NFC-e

- [ ] `POST /emissao/nfce` emite NFC-e em ambiente de homologacao SEFAZ
- [ ] XML assinado e armazenado em `fiscal_documents.xml_envio`
- [ ] XML de retorno armazenado em `fiscal_documents.xml_retorno`
- [ ] DANFE/QR Code retornado ao chamador
- [ ] Segundo request com mesmo `request_id` retorna 200 com resultado original (idempotencia)

### Emissao NF-e

- [ ] `POST /emissao/nfe` emite NF-e em ambiente de homologacao SEFAZ
- [ ] Mesmos criterios de armazenamento, DANFE e idempotencia da NFC-e

### Consulta de Status

- [ ] `GET /documentos/{id}/status` retorna documento correto por ID interno
- [ ] `GET /documentos?chave_acesso=44digitos` retorna documento por chave

### Cancelamento

- [ ] `POST /documentos/{id}/cancelamento` cancela NFC-e dentro do prazo (24h)
- [ ] `POST /documentos/{id}/cancelamento` cancela NF-e dentro do prazo (168h / 7 dias)
- [ ] Cancelamento fora do prazo retorna 422 com `cancellation_deadline_exceeded`

### Inutilizacao

- [ ] `POST /numeracao/inutilizacao` inutiliza faixa junto ao SEFAZ
- [ ] Registro gravado em `fiscal_inutilizations`

### CC-e (NF-e apenas)

- [ ] `POST /documentos/{id}/cce` envia CC-e autorizada
- [ ] Tentativa de CC-e em NFC-e retorna 422

### Contingencia

- [ ] SEFAZ indisponivel ativa contingencia DPEC automaticamente (sem intervencao do chamador)
- [ ] Documento salvo com `status = 'contingency'` e `contingencia_tipo = 'dpec'`
- [ ] Response 202 retornado ao chamador

### Auditoria

- [ ] Toda transicao de status grava row em `fiscal_document_events`
- [ ] `ip_origem` e `caller_service` registrados em cada evento
- [ ] Rows de auditoria nunca sao atualizadas (apenas INSERT)

### Testes

- [ ] Testes unitarios (Pest) para: geracao de numeracao atomica, validacao de prazo de cancelamento, deteccao de certificado expirado
- [ ] Testes de integracao (Pest + SEFAZ homologacao) para: emissao NFC-e, emissao NF-e, cancelamento, inutilizacao
- [ ] `php artisan test` passa sem falhas
- [ ] `./vendor/bin/pint --test` passa sem falhas

### Documentacao

- [ ] `docs/api/fiscal-sprint-1-openapi.yaml` criado e atualizado com shape completo de `dados_documento`
- [ ] `README.md` do projeto documenta como rodar, testar e aplicar seed local

---

## Capability Registration

O serviço fiscal não é uma application Identity. Ele é registrado como **capability** no catálogo
global `capability_registry` do banco `jboot_identity`.

| Campo | Valor |
|---|---|
| slug | `fiscal` |
| label | `Emissão de Nota Fiscal` |
| service_name | `svc-jboot-fiscal` |

O seed `docker/postgres/init/025_client_capabilities.sql` cria as tabelas `capability_registry` e
`client_capabilities` e insere a entrada `fiscal` no bootstrap do banco Identity.

**Regras:**
- Não criar `application_slug` no Identity Hub para este serviço.
- Não criar entitlements de usuário para o slug `fiscal`.
- Não listar este serviço no seletor pós-login.
- BFFs que consomem este serviço devem verificar `client_capabilities.enabled = true` para o slug
  `fiscal` antes de emitir o JWT s2s — o serviço fiscal em si não valida a capability.

Ver ADR 006: `docs/architecture/decisions/006-client-capabilities.md`.

---

## Seed De Desenvolvimento

Arquivo: `docker/postgres/init/024_fiscal.sql`

O servico `svc-jboot-fiscal` nao e uma aplicacao do Identity Hub (sem `application_slug`,
sem `client_applications`, sem `entitlements`). O seed fiscal opera em `jboot_fiscal`
e consulta `jboot_identity` via `dblink` somente para resolver o UUID canonico do
cliente JBOOT LTDA vinculado ao `Operador Senior`.

### Dados de seed

**Banco**: `jboot_fiscal`

**Certificado de homologacao**:

O campo `pfx_encrypted` em desenvolvimento armazena um certificado A1 de **homologacao
SEFAZ** (emitido pela AC-Homologacao da ICP-Brasil; aceito pelos WebServices de
homologacao SEFAZ estaduais). O certificado nao e um certificado de producao real.

```sql
-- Criar banco se nao existir (psql \gexec; reaplicavel)
SELECT 'CREATE DATABASE jboot_fiscal'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jboot_fiscal')\gexec

\connect jboot_fiscal

-- Extensoes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS dblink;

-- Certificado de homologacao para JBOOT LTDA (Operador Senior: 63784101000110)
-- pfx_encrypted: placeholder de desenvolvimento.
-- Em ambiente real: substituir pelo PFX real criptografado com FISCAL_CERT_ENCRYPTION_KEY.
-- Em ambiente de CI/homologacao: usar o script tools/encrypt-pfx.php para gerar o valor.
INSERT INTO fiscal_certificates (
  client_id,
  cnpj_emitente,
  pfx_encrypted,
  encryption_iv,
  encryption_tag,
  password_hint,
  valid_from,
  valid_until,
  serial_number,
  subject_cn,
  ambiente,
  status
)
VALUES (
  -- client_id resolvido do Identity para o CNPJ 63784101000110.
  '<uuid-do-client-jboot-ltda>'::uuid,
  '63784101000110',
  '\x'::bytea,   -- TBD: PFX criptografado real de homologacao
  '\x'::bytea,   -- TBD: IV real
  '\x'::bytea,   -- TBD: tag real
  NULL,          -- password_hint: NULL em dev (sem hint real)
  now(),
  now() + interval '2 years',
  'CERT-HOMOLOGACAO-DEV-001',
  'AC HOMOLOGACAO JBOOT DEV',
  'homologacao',
  'active'
)
ON CONFLICT (client_id, cnpj_emitente, ambiente) DO NOTHING;

-- Sequencia inicial NFC-e serie 1 (homologacao)
INSERT INTO fiscal_document_sequences (
  client_id, cnpj_emitente, tipo_documento, serie, ultimo_numero, ambiente
)
VALUES (
  '<uuid-do-client-jboot-ltda>'::uuid,
  '63784101000110',
  'nfce',
  1,
  0,
  'homologacao'
)
ON CONFLICT (client_id, cnpj_emitente, tipo_documento, serie, ambiente) DO NOTHING;

-- Sequencia inicial NF-e serie 1 (homologacao)
INSERT INTO fiscal_document_sequences (
  client_id, cnpj_emitente, tipo_documento, serie, ultimo_numero, ambiente
)
VALUES (
  '<uuid-do-client-jboot-ltda>'::uuid,
  '63784101000110',
  'nfe',
  1,
  0,
  'homologacao'
)
ON CONFLICT (client_id, cnpj_emitente, tipo_documento, serie, ambiente) DO NOTHING;
```

**Nota sobre o client_id no seed**: o `client_id` deve ser o UUID real do cliente
registrado no Identity para o CNPJ `63784101000110` (`JBOOT LTDA`). O seed
`docker/postgres/init/024_fiscal.sql` resolve esse UUID via `dblink` contra
`jboot_identity` e falha explicitamente se o client canonico nao existir. Nao usar
UUID artificial em seeds fiscais.

---

## Entrypoints

```
src/
  app/
    Http/
      Controllers/
        EmissaoController.php      -- NFC-e e NF-e
        DocumentoController.php    -- status, cancelamento, CC-e
        NumeracaoController.php    -- inutilizacao
        HealthController.php
      Middleware/
        ValidateServiceJwt.php     -- valida JWT s2s do Identity Hub
        InjectClientContext.php    -- extrai client_id do JWT para o contexto
  Domain/
    Fiscal/
      Services/
        EmissaoService.php
        CancelamentoService.php
        InutilizacaoService.php
        CceService.php
      Repositories/
        FiscalDocumentRepository.php
        FiscalCertificateRepository.php
        FiscalSequenceRepository.php
  Infrastructure/
    Sefaz/
      SefazGateway.php             -- abstrai sped-nfe
      ContingenciaManager.php      -- detecta indisponibilidade e ativa DPEC
    Crypto/
      CertificateCrypto.php        -- AES-256-GCM encrypt/decrypt
routes/
  api.php
database/
  migrations/
  seeders/
config/
  fiscal.php                       -- env bindings fiscais
```

---

## Validacoes De Codigo

```bash
php artisan test
./vendor/bin/pint --test
php artisan route:list
```

---

## Restricoes

- Nao autenticar usuarios finais — apenas JWT de servico s2s.
- Nao calcular impostos — recebi-los pre-calculados no `dados_documento`.
  Nota futura: se a complexidade tributaria (ICMS por regime, PIS/COFINS, substituicao tributaria)
  justificar centralizacao, um `svc-jboot-tributacao` dedicado podera ser introduzido para
  calcular e repassar os valores ao fiscal. Nao implementar agora.
- Nao armazenar PFX em plaintext — sempre AES-256-GCM com chave em env.
- Nao expor chave de criptografia, senha do PFX ou conteudo decriptado em logs.
- Nao compartilhar banco com PDV, Platform ou Identity — `jboot_fiscal` e dedicado.
- Nao acessar dados de outro `client_id` — toda query filtra pelo `client_id` do JWT.
- Nao remover ou atualizar rows de `fiscal_document_events` — auditoria imutavel.
- Numeracao sequencial exclusivamente via lock atomico em banco — sem sequencia em memoria.
- CC-e somente para NF-e; bloquear tentativa em NFC-e com 422.
- Prazo de cancelamento NFC-e: 24h. NF-e: 168h (7 dias). Validar por tipo e UF (TBD por UF).
- Contingencia DPEC ativa automaticamente sem intervencao do chamador.
- Certificado expirado bloqueia emissao e retorna 409 — sem tentativa de emissao.
- Rejeicao SEFAZ retorna 422 com codigo e motivo estruturado — nunca 500 por rejeite.

---

## Riscos Conhecidos

| Risco | Severidade | Mitigacao |
|---|---|---|
| Regras fiscais variam por UF (prazo de cancelamento, regras de CC-e, contingencia) | Alta | Mapear UF por CNPJ emitente; validacao por UF TBD na Sprint 1 |
| Indisponibilidade SEFAZ em horario de pico | Alta | Contingencia DPEC automatica; retry 3x com backoff |
| Vazamento de PFX ou chave de criptografia | Critica | Chave somente em env; PFX nunca em log; rotacao de chave TBD |
| Dupla emissao por race condition na numeracao | Alta | Lock atomico em banco (`SELECT FOR UPDATE`) |
| Certificado expirar em producao sem aviso | Alta | Alerta 30 dias antes; campo `alerted_at` rastreia envio |
| Retencao de XML por 5 anos | Media | Estrategia de archival TBD (particao por ano vs tabela de arquivo) |
| Validacao de `dados_documento` — shape detalhado nao definido | Media | Definir shape completo em `fiscal-sprint-1-openapi.yaml` antes do primeiro endpoint |
| `client_id` no seed fiscal nao sincronizado com Identity | Baixa/Dev | UUID fixo de dev; resolver antes de iniciar testes de integracao |
| NFS-e — alta variabilidade municipal | Alta | Fora do escopo da Sprint 1; Sprint 2 exige decisao de abordagem por municipio |
