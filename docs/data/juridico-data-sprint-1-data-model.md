# Juridico Data Sprint 1 Data Model

## Decisao De Persistencia

`svc-jboot-juridico-data` e stateless na Sprint 1. A resposta DataJud existe
somente durante a requisicao e nao e gravada pelo servico.

O BFF registra auditoria minima no banco juridico dedicado do tenant. O
conteudo integral do processo, nomes de partes e movimentacoes nao sao
persistidos nesta sprint.

## Tabela Planejada: `juridico_data_query_audit`

```sql
juridico_data_query_audit (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null,
  identity_id           uuid not null,
  request_id            uuid not null,
  provider              varchar(32) not null check (provider in ('datajud')),
  tribunal              varchar(32) null,
  process_number_hmac   char(64) not null,
  hmac_key_version      smallint not null,
  result_status         varchar(32) not null check (
                          result_status in (
                            'success', 'not_found', 'restricted', 'invalid',
                            'rate_limited', 'timeout', 'provider_unavailable',
                            'internal_error'
                          )
                        ),
  provider_latency_ms   integer null check (provider_latency_ms >= 0),
  provider_updated_at   timestamptz null,
  created_at            timestamptz not null default now(),
  unique (client_id, request_id)
)
```

Indices:

- `(client_id, created_at desc)`;
- `(client_id, process_number_hmac, created_at desc)`.

## Regras

- conexao resolvida exclusivamente pelo `database_ref` autenticado;
- toda insert/query inclui `client_id` do contexto, nunca do body;
- `process_number_hmac` usa HMAC-SHA-256 com chave versionada e separada das
  chaves de criptografia de credenciais;
- numero CNJ bruto, nome de parte, API key e payload DataJud nao entram na
  tabela, logs ou traces;
- `result_status` e allowlist; mensagens livres de provider nao sao persistidas;
- `request_id` e UUID gerado no BFF e propagado como correlation id;
- politica de retencao da auditoria deve ser definida antes de producao;
- snapshots completos exigem novo modelo e decisao LGPD na Sprint 2.

## Ausencia Intencional De Banco No Servico

Nao criar migration, ORM ou repository em `svc-jboot-juridico-data` na Sprint 1.
Isso impede duplicacao de isolamento multi-tenant e mantem o BFF como owner dos
dados de produto.
