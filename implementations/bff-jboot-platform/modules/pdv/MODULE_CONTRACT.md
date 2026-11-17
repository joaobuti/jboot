# Module Contract: bff-jboot-platform/modules/pdv

Arquivo: `MODULE_CONTRACT.md`

## Status

```yaml
lifecycle_status: functional
production_readiness: not_assessed
status_evidence: modulo NestJS PDV e suites automatizadas versionados na Platform
last_status_review: 2026-08-03
```

Modulo backend PDV migrado para a platform modular.

Origem tecnica:

- `implementations/bff-jboot-pdv` (removido em 2026-07-17; referencia historica em `legacy-reference/bff-jboot-pdv/`)

Destino funcional:

- `implementations/bff-jboot-platform/src/modules/pdv/admin`

## Responsabilidade

Dominio transacional do PDV: operadores, estoque, vendas, itens, pagamentos, caixa, configuracoes, sync offline, integracoes futuras, e feature staff de comanda/autoatendimento (triagem, filas, fechamento). Categorias e produtos vivem em `implementations/bff-jboot-platform/modules/catalog/MODULE_CONTRACT.md` (fonte unica, consumida por leitura direta hoje). Clientes do estabelecimento vivem em `implementations/bff-jboot-platform/modules/establishment-customers/MODULE_CONTRACT.md`, extraidos deste modulo para servir tambem o `comanda`.

## Feature: staff de comanda/autoatendimento

Adicionada nesta entrega (branch `feature/comanda-autoatendimento`), materializada via `PO -> PE -> Architect -> confirmacao humana`. Endpoints ficam em `AdminModule` (`src/modules/pdv/admin`), nao no modulo `comanda` — ver `implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md` para o desenho completo (maquina de estados do item, dependencias, decisao de nao usar geolocalizacao/NFC).

- Escopos novos: `pdv:comanda:cozinha`, `pdv:comanda:bar`, `pdv:comanda:balcao` — adicionados ao seed existente (`docker/postgres/init/007_identity_pdv_dev_seed.sql`) para Operador Senior e Usuario Teste. Nenhum `application_slug` novo.
- Papel **Operador de Balcao** (`pdv:comanda:balcao`) e o unico papel operacional para: triagem `pendente -> em_producao`, liberacao `pronto -> liberado_para_entrega`, cancelamento de excecao (`em_producao`+), atendimento de fechamento normal e de comanda esquecida, confirmacao de pagamento.
- Endpoint de fechamento (`POST /pdv/comanda/:id/fechar`) chama `SalesService` in-process (mesmo modulo, chamada de metodo) — Operador de Balcao nao precisa de `pdv:sales:write`.
- **Extracao de `PdvAuditService` para `PdvAuditModule` compartilhado**: hoje e provider privado de `AdminModule`, consumido diretamente por `operators.service.ts`, `cashier.service.ts`, `inventory.service.ts` e `customers.service.ts` (este ultimo migrando para `establishment-customers`). Com esta feature, `comanda` e `establishment-customers` tambem precisam dele — extracao e requisito, nao trabalho paralelo opcional. Criterio de aceite: apos o refactor, nenhum import remanescente de `shared/pdv-audit.service` fora de `PdvAuditModule`; build/typecheck do `bff-jboot-platform` dentro do container e o gate de verificacao.
- **Sprint 5 — painel de acompanhamento**: sem endpoint novo. O front (`app-jboot-next-platform`, rota `/pdv/comanda/painel`) compõe leitura dos 3 endpoints ja existentes (`itens/pendentes`, `fila?queueType=cozinha|bar`, `itens/prontos`) do `ComandaAdminController`. Decisao (confirmada pelo usuario em 2026-08-20): painel staff-autenticado via sessao Identity/`pdv` ja existente, nao endpoint publico — ver detalhe em `implementations/app-jboot-next-platform/modules/pdv/MODULE_CONTRACT.md`.
- **Sprint 6 — CPF-na-nota**: emissao fiscal continua 100% manual (`POST /pdv/sales/:id/emit-nf`, `EmitNfDto.destinatario` preenchido pelo operador) — esta sprint so pre-preenche, nunca emite automaticamente. Novo endpoint `GET /pdv/sales/:id/comanda-customer` (`pdv:sales:read`) em `SalesController` retorna `{ comandaId, name, documentNumber, phone, address } | null` — `null` quando a venda nao veio do fechamento de uma comanda (caso normal do PDV). `pdv_sales` nao guarda referencia de volta pra `comandas`; decisao registrada: manter so `comandas.closed_sale_id` (aponta pra frente) e buscar pelo caminho inverso (`WHERE closed_sale_id = $saleId`, indexado por `idx_comandas_closed_sale_id`), em vez de adicionar `comanda_id` em `pdv_sales` — unico consumidor hoje, coluna nova seria especulativa. `SalesService` ganhou dependencia de `ComandaAdminRepository` (mesma direcao ja existente `comanda -> sales`, sem ciclo — a nova dependencia usa o repository, nao o `ComandaAdminService`, que e quem depende de `SalesService`) e de `CustomersService` (`establishment-customers`, via `AdminModule` agora importando `EstablishmentCustomersModule`). Frontend (`PdvCashierPage.tsx`) chama o endpoint ao abrir o modal de emissao e pre-preenche `cpfConsumidor`/`destinatario`, deixando o operador editar/confirmar antes de emitir.

- **Sprint 7 — cadastro de mesas e QR**: `ComandaMesasController` sob o prefixo `pdv/comanda-mesas` (e nao `pdv/comanda/mesas`, porque `ComandaAdminController` ja registra `@Get(':id')` sob `pdv/comanda` e capturaria a rota irma). Leitura com `pdv:comanda:balcao` OU `pdv:admin:read`; escrita com `pdv:admin:write`. `AdminModule` importa `ComandaModule` apenas pelo provider exportado `ComandaJwtService` (emissao do QR assinado) — o acoplamento proibido entre `pdv/admin` e `comanda` e o de repositories/acesso a dado, nao o do contrato do token. Numero da mesa e imutavel apos a criacao (esta no QR impresso) e mesa com comanda aberta nao pode ser inativada. Migracao `041_comanda_tables_admin.sql` cria a FK composta `comandas(client_id, table_number) -> comanda_tables`, materializando mesas orfas como `inactive`.
- **Sprint 8 — mapa do salao**: `ComandaSalaoController` sob `pdv/comanda-salao` (mesmo motivo de prefixo), com uma unica query agregada; mesa livre aparece por `LEFT JOIN` a partir de `comanda_tables`. Estados da mesa sao todos derivados na leitura, sem coluna de estado nem marcacao manual.
- **Sprint 9 — pagamento dividido (venda-pai e vendas derivadas)**: `pdv_sales` ganha `parent_sale_id` e `sale_role` (`standalone` | `comanda_parent` | `comanda_payment`); `comandas` ganha `parent_sale_id` (migracao `042_comanda_pagamento_dividido.sql`). Divisao de papeis: a venda-pai carrega os itens (documento de consumo, origem da NF) e **nenhum pagamento**; cada recebimento e uma venda filha com pagamento e **nenhum item**. O dinheiro vive somente nas filhas — duplicar no pai faria a conferencia de caixa contar duas vezes. Consequencias implementadas, todas obrigatorias: `SalesService` ganhou `createComandaParent`/`registerComandaPayment`/`completeComandaParent`, que contornam `assertSaleReadyToComplete` de forma explicita e restrita (filha sem item; pai validado contra a soma das filhas); `CashierRepository.getSummary` exclui `sale_role = 'comanda_parent'` do `salesCount`; baixa de estoque acontece uma unica vez, na venda-pai; `POST /pdv/comanda/:id/fechar` recusa comanda com pagamento parcial, apontando para `POST /pdv/comanda/:id/pagamentos`. A venda-pai nasce vazia e so recebe os itens na quitacao, porque a comanda continua aceitando pedidos apos um pagamento parcial (decisao de produto: divisao e sempre por valor fixo, nunca percentual). Cenario real coberto (confirmado pelo usuario em 2026-08-22): mesa de grupo com **uma** comanda, aberta e operada pelo celular de uma pessoa; quem vai embora paga sua parte no balcao, o saldo cai, pedidos novos sobem o saldo, e a comanda fecha quando zera. Comanda multi-celular (cada pessoa pedindo do proprio aparelho na mesma comanda) e **escopo excluido de proposito**, nao backlog.

## Agents Do Modulo

- `agents/pdv-domain.md`
- `agents/pdv-inventory.md`
- `agents/pdv-sync.md`

## Skills Do Modulo

- `skills/pdv-crud.md`
- `skills/pdv-stock-rules.md`
- `skills/pdv-offline-contract.md`

## Ativacao Obrigatoria

Usar junto com os agents/skills globais de `implementations/bff-jboot-platform`.

```text
Agent Activation:
  project: implementations/bff-jboot-platform
  module: modules/pdv
  using_agent:
    - implementations/bff-jboot-platform/agents/backend-node-typescript.md
    - implementations/bff-jboot-platform/agents/platform-auth-context.md
    - implementations/bff-jboot-platform/agents/platform-postgres.md
    - implementations/bff-jboot-platform/modules/pdv/agents/pdv-domain.md
  using_skill:
    - implementations/bff-jboot-platform/skills/nest-module-pattern.md
    - implementations/bff-jboot-platform/skills/tenant-context.md
    - implementations/bff-jboot-platform/skills/api-contract.md
    - implementations/bff-jboot-platform/modules/pdv/skills/pdv-crud.md
```

Adicionar `pdv-inventory`/`pdv-stock-rules` para estoque. Adicionar `pdv-sync`/`pdv-offline-contract` para sync/offline/idempotencia.

## Contratos Obrigatorios

- `docs/product/pdv-sprints.md`
- `docs/product/pdv-sprint-1-gate.md`
- `docs/data/pdv-sprint-1-data-model.md`
- `docs/api/pdv-sprint-1-openapi.yaml`
- `docs/product/comanda-sprints.md` (feature staff de comanda: triagem, filas, fechamento, painel, mesas/QR e mapa do salao)

## Dev Runtime Profile

### Target Runtime Matrix

- target: `code-up:pdv`
  - purpose: desenvolvimento do backend Platform para admin online do PDV.
  - containers:
    - required: `postgres`, `valkey`, `jboot`, `minio` quando cadastro de produto usar upload de imagem.
    - optional: `rabbitmq` quando sync/offline/eventos exigirem.
    - forbidden_by_default: `mongodb`, `temporal`, `redpanda`, `clickhouse`, `qdrant`, `otel-collector`.
  - app_processes:
    - required: `identity-api`, `identity-admin`, `platform-api`, `platform-web`.
    - optional: PDV legacy BFF somente para migracao/comparacao.
    - forbidden_by_default: app mobile, workers nao relacionados.
  - ports: `3000`, `3002`, `8000`, `8010`, `5432`.
  - healthchecks: `GET /health` em Identity e Platform.
  - seed_dependencies: seeds Identity/PDV e `006_pdv.sql`.
  - expected_resource_profile: medio, sem app mobile/offline sync.

### Rules

- `make code-restart TARGET=pdv` reinicia somente os processos Identity/Platform exigidos pelo modulo.
- Sync offline e eventos entram apenas em target/profile explicito quando a sprint exigir.

## Restricoes

- Nao criar autenticacao propria.
- Nao aceitar `client_id` vindo do payload.
- Nao acessar banco de outro modulo diretamente.
- Fiscal permanece fora do modulo.
- `src/modules/pdv/admin/customers/*` esta sendo extraido para `modules/establishment-customers` — nao adicionar codigo novo ali; features novas de cliente final entram no modulo extraido.
- Nao criar validacao de geolocalizacao/NFC para a feature de comanda sem reabrir a decisao ja registrada em `implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md`.
