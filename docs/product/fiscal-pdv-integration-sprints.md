# Sprints de Integração PDV × Fiscal

Sprints específicas para integrar `bff-jboot-platform/modules/pdv` e módulos futuros
(COMANDA, etc.) com `svc-jboot-fiscal`.

Pré-requisito: Sprint 1 do `svc-jboot-fiscal` concluída (gate fechado).

**Status (2026-10-11):** Sprints A, B e C implementadas. Sprint D em andamento;
contratos, XML e integração automatizada estão verificados, mas a autorização real na
SEFAZ de homologação ainda é o gate bloqueante.

---

## Decisões Arquiteturais Registradas

### Série compartilhada entre módulos

`serie_nfe` e `serie_nfce` são propriedades do **cliente** (tenant), não do módulo.

- PDV, COMANDA e qualquer outro módulo do mesmo cliente compartilham a mesma série.
- O caller **não passa `serie` no request** de emissão — o `svc-jboot-fiscal` resolve a série
  a partir da `fiscal_tenant_config` do cliente.
- Se o cliente alterar a série (ex: `serie_nfe: 1 → 2`):
  - Nova row criada em `fiscal_document_sequences` para a série nova, partindo de zero.
  - A sequência antiga (série 1) é preservada — numeração SEFAZ não é reutilizada.
  - A mudança vale imediatamente para todos os módulos do cliente.
- Emissão sem `fiscal_tenant_config` cadastrada rejeita com `422 fiscal_config_not_found`.

### CFOP configurável (não fixo)

- CFOP não é fixo no código; cada cliente configura o CFOP padrão por tipo de documento.
- CFOP é opcional na emissão — se não enviado pelo caller, usa o padrão da config.
- CFOP é herdado do global (não existe config por módulo).
- Para documentos com ambos NFC-e e NF-e, NFC-e usa o CFOP configurado primeiro.
- Config visual na plataforma (frontend), dados armazenados em `fiscal_tenant_config`
  no banco `jboot_fiscal` (gerenciado via `PUT /api/v1/config` do fiscal API).

---

## Sprint A — Fluxo de Venda com Emissão Fiscal (PDV → Fiscal)

**Objetivo:** o PDV registra vendas completas e solicita emissão fiscal para cada venda concluída.

### Projetos afetados

- `bff-jboot-platform/modules/pdv` (backend)
- `svc-jboot-fiscal` (fiscal API — somente integração, sem novas funcionalidades)

### Modelo de dados (BFF PDV)

```sql
-- Registro de uma venda completa
pdv_sales (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  operator_id      uuid NOT NULL,
  cashier_id       uuid,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','completed','cancelled','fiscal_pending','fiscal_error')),
  subtotal         numeric(12,2) NOT NULL DEFAULT 0,
  discount         numeric(12,2) NOT NULL DEFAULT 0,
  total            numeric(12,2) NOT NULL DEFAULT 0,
  fiscal_document_id uuid,            -- preenchido após emissão fiscal bem-sucedida
  fiscal_status    text,              -- 'pending','authorized','contingency','failed'
  fiscal_request_id uuid,             -- idempotency key enviado ao svc-jboot-fiscal
  caller_module    text NOT NULL,     -- 'pdv', 'comanda', etc.
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
)

pdv_sale_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          uuid NOT NULL REFERENCES pdv_sales(id),
  client_id        uuid NOT NULL,
  product_id       uuid NOT NULL,
  quantity         numeric(10,4) NOT NULL,
  unit_price       numeric(12,2) NOT NULL,
  discount         numeric(12,2) NOT NULL DEFAULT 0,
  total            numeric(12,2) NOT NULL,
  -- dados fiscais pre-calculados (conforme regra: fiscal nao calcula impostos)
  cfop             text,
  ncm              text,
  cst_icms         text,
  cst_pis          text,
  cst_cofins       text,
  aliq_icms        numeric(5,2),
  aliq_pis         numeric(5,2),
  aliq_cofins      numeric(5,2),
  created_at       timestamptz NOT NULL DEFAULT now()
)

pdv_sale_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          uuid NOT NULL REFERENCES pdv_sales(id),
  client_id        uuid NOT NULL,
  payment_method   text NOT NULL,    -- 'dinheiro','cartao_credito','cartao_debito','pix','outro'
  amount           numeric(12,2) NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','failed','refunded')),
  external_ref     text,             -- referência do gateway externo (Sprint 4)
  created_at       timestamptz NOT NULL DEFAULT now()
)
```

### Entregáveis

- [x] Migrations `pdv_sales`, `pdv_sale_items`, `pdv_sale_payments` (`docker/postgres/init/026_pdv_sales.sql`)
- [x] `POST /pdv/sales` — abre venda (`bff-jboot-platform/src/modules/pdv/admin/sales/sales.controller.ts`)
- [x] `POST /pdv/sales/:id/items` — adiciona item
- [x] `POST /pdv/sales/:id/payments` — registra pagamento
- [x] `POST /pdv/sales/:id/complete` — fecha venda e dispara emissão fiscal
  - BFF chama `svc-jboot-fiscal` `POST /api/v1/emissao/nfce` ou `/nfe`
  - `fiscal_request_id` gerado pelo BFF (UUID v4), armazenado para idempotência
  - Em sucesso: `fiscal_document_id` e `fiscal_status='authorized'` gravados na venda
  - Em contingência (202): `fiscal_status='contingency'`, BFF aguarda webhook ou polling
  - Em erro permanente: `fiscal_status='failed'`, venda não é revertida (decisão de negócio)
- [x] `GET /pdv/sales/:id` — status da venda com status fiscal

### Critérios de aceite

- Venda concluída sem emissão fiscal não deve ficar com status `completed` indefinidamente
- `fiscal_request_id` reutilizado em retry não gera NF duplicada (idempotência garantida pelo fiscal)
- `caller_module` registrado em cada venda para rastreabilidade futura

### Fora de escopo desta sprint

- Configuração fiscal (Sprint B)
- CFOP configurável (Sprint C)
- Cancelamento de NF por cancelamento de venda
- TEF/gateway de pagamento (Sprint PDV 4)

---

## Sprint B — Configuração Fiscal do Cliente

**Objetivo:** criar `fiscal_tenant_config` como fonte de verdade das configurações fiscais por
cliente. Remover `serie` e `ambiente` do request de emissão — ambos passam a vir da config.

### Projetos afetados

- `svc-jboot-fiscal` (nova tabela, novos endpoints, mudança nos DTOs de emissão)
- `bff-jboot-platform/modules/pdv` (tela de configuração fiscal)
- `app-jboot-next-platform/modules/pdv` (UI de configuração)

### Modelo de dados (svc-jboot-fiscal)

```sql
fiscal_tenant_config (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL,
  cnpj_emitente    text NOT NULL,
  ambiente         text NOT NULL CHECK (ambiente IN ('homologacao','producao')),
  -- Série
  serie_nfce       smallint NOT NULL DEFAULT 1,
  serie_nfe        smallint NOT NULL DEFAULT 1,
  -- CSC (Código de Segurança do Contribuinte) — obrigatório para NFC-e
  csc              text,
  csc_id           text,
  -- Regime tributário
  regime_fiscal    text NOT NULL DEFAULT 'simples'
                     CHECK (regime_fiscal IN ('simples','lucro_presumido','lucro_real')),
  -- CFOP padrão por tipo (pode ser sobrescrito por item na emissão)
  cfop_padrao_nfce text,              -- ex: '5102'
  cfop_padrao_nfe  text,              -- ex: '5102'
  -- Defaults de impostos (usados quando o item não traz os valores)
  icms_cst_padrao  text,
  pis_cst_padrao   text,
  cofins_cst_padrao text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, cnpj_emitente)
)
```

### Regra de série

- `EmissaoService` faz lookup de `fiscal_tenant_config` antes de reservar número.
- Se não existe config: rejeita com `422 fiscal_config_not_found`.
- `serie` e `ambiente` são removidos do request body de emissão — vêm da config.
- Quando `serie_nfce` ou `serie_nfe` mudam via `PUT /api/v1/config`:
  - Nova row inserida em `fiscal_document_sequences` com `ultimo_numero = 0`.
  - Antiga sequência mantida (não se reutiliza numeração SEFAZ).

### Endpoints (svc-jboot-fiscal)

```
GET  /api/v1/config                — retorna fiscal_tenant_config do client_id do JWT
PUT  /api/v1/config                — cria ou atualiza config (upsert por client_id + cnpj_emitente)
```

### Mudanças no contrato de emissão

```diff
POST /api/v1/emissao/nfce
{
  "request_id": "uuid",
  "cnpj_emitente": "12345678000195",
- "serie": 1,
- "ambiente": "homologacao",
  "dados_documento": { ... }
}
```

`serie` e `ambiente` são lidos de `fiscal_tenant_config`. O caller não os passa.

### Entregáveis

- [x] Migration `fiscal_tenant_config`
- [x] `FiscalTenantConfigRepository` (find, upsert)
- [x] `GET /api/v1/config` e `PUT /api/v1/config`
- [x] `EmissaoService` resolve config antes de reservar número
- [x] Remover `serie` e `ambiente` de `EmissaoNfceDto` e `EmissaoNfeDto`
- [x] Remover `serie` e `ambiente` dos controllers de emissão
- [x] Lógica de troca de série cria nova sequence row
- [x] Tela de configuração fiscal no PDV web (série, CSC/CSCId, regime, CFOP padrão) — `app-jboot-next-platform/src/components/Common/ModuleFiscalConfig`
- [x] Seed de dev com config padrão para tenant demo

### Critérios de aceite

- Emissão sem config retorna `422` com `error: fiscal_config_not_found`
- Série compartilhada: PDV e COMANDA emitem na mesma série automaticamente
- Troca de série: documentos antigos mantêm série anterior; novos usam série nova

---

## Sprint C — CFOP Configurável por Cliente

**Objetivo:** CFOP não é fixo no código; cada cliente configura padrão. Caller pode sobrescrever
por item na emissão.

### Projetos afetados

- `svc-jboot-fiscal` (validação/fallback de CFOP)
- `bff-jboot-platform/modules/pdv` (envio de CFOP por item)
- `app-jboot-next-platform/modules/pdv` (seletor de CFOP padrão)

### Regras de CFOP

| Prioridade | Fonte |
|---|---|
| 1 | CFOP do item enviado pelo caller (opcional) |
| 2 | `cfop_padrao_nfce` / `cfop_padrao_nfe` da `fiscal_tenant_config` |
| 3 | Rejeita emissão com `422 cfop_required` se nenhum definido |

- CFOP não bloqueia emissão se a config tiver padrão — apenas o caso "sem item e sem config" rejeita.
- Herança: config é global por cliente, não por módulo.
- Para documentos com NFC-e e NF-e: NFC-e usa `cfop_padrao_nfce` primeiro.

### Entregáveis

- [x] `svc-jboot-fiscal`: resolver CFOP por prioridade (item > config > erro)
- [x] `pdv_sale_items`: campo `cfop` já previsto no schema da Sprint A
- [x] BFF: enviar `cfop` por item quando disponível (opcional)
- [x] UI: seletor de CFOP padrão na tela de configuração fiscal (Sprint B) — implementado como campo texto (maxLength 4), não dropdown; atende ao requisito funcional mas vale revisar se um seletor guiado é necessário

### Critérios de aceite

- Item sem CFOP usa padrão da config
- Item com CFOP explicito sobrescreve o padrão
- Config sem CFOP padrão e item sem CFOP → 422 estruturado

---

## Ordem de Execução

```
Sprint A  →  Sprint B  →  Sprint C
```

Sprint B pode começar em paralelo com Sprint A se os times forem distintos,
mas o `EmissaoService` só pode remover `serie`/`ambiente` após Sprint B estar completa.
Sprint C depende da `fiscal_tenant_config` criada na Sprint B.

---

## Sprint D — Homologação Funcional NFC-e no PDV

**Objetivo:** concluir uma venda PIX no PDV e obter uma NFC-e modelo 65 autorizada
pela SEFAZ de homologação, com XML processado e DANFCE utilizável.

### Entregáveis

- [x] Cadastro fiscal do produto: NCM, CFOP, CEST e GTIN.
- [x] Snapshot imutável dos dados fiscais nos itens da venda.
- [x] Configuração única do emitente consumida pelo PDV e pelo serviço fiscal.
- [x] CSC mascarado nas respostas; senha do PFX nunca persistida.
- [x] PFX normalizado, cifrado e carregável sem persistir a senha original.
- [x] CPF opcional do consumidor e PIX (`tPag=17`) no XML NFC-e.
- [x] `Idempotency-Key` obrigatório e igual ao `request_id`.
- [x] Resposta fiscal rejeitada não pode ser tratada como autorização.
- [x] Timeout/5xx classificado como `uncertain`, preservando o mesmo request id no retry.
- [x] XML autorizado processado armazenado para geração do DANFCE.
- [x] Testes de serviço fiscal, BFF, type-check e builds em container.
- [ ] Migrações aplicadas no runtime integrado e healthchecks aprovados.
- [ ] Produto sintético de homologação cadastrado pelo fluxo administrativo.
- [ ] Venda PIX de R$ 1,00 concluída pelo fluxo do caixa.
- [ ] NFC-e autorizada pela SEFAZ de homologação, com chave, protocolo, XML e DANFCE verificados.

### Fora de escopo

- NF-e modelo 55 autorizada (será validada depois da NFC-e).
- Produção, dados fiscais reais de produto e qualquer obrigação contábil.
- Boleto.

### Sprint gate

- `blocking_status: blocked_by_external_homologation_evidence`
- `open_questions: []`
- Architecture Graph: registrar migração desta feature quando o registry/gate previsto
  na Sprint 4 de `docs/product/api-graph-sprints.md` estiver disponível. O Architecture
  Graph não é declarado sincronizado neste estágio.
