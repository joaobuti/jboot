# PDV Sprint 1 Data Model

## Objetivo

Modelo de dados inicial para a Sprint 1 do PDV: produtos, categorias, clientes do estabelecimento, operadores e estoque basico.

## Regras Globais

- Todas as tabelas de negocio usam `client_id`.
- `client_id` vem do contexto validado do Identity Hub.
- Nenhuma API administrativa da Sprint 1 aceita `client_id` livre no payload comum.
- IDs sao UUID.
- Mutacoes relevantes devem gerar auditoria/evento operacional.
- Exclusividades de negocio devem considerar `client_id`.

## Tabelas

### `pdv_categories`

Categorias de produtos.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `parent_id uuid null`;
- `name varchar(160) not null`;
- `slug varchar(180) not null`;
- `description text null`;
- `status varchar(24) not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, slug)`;
- `parent_id` referencia categoria do mesmo `client_id`;
- `status in ('active', 'inactive')`.

### `pdv_products`

Produtos comercializados no PDV.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `category_id uuid null`;
- `sku varchar(80) null`;
- `barcode varchar(80) null`;
- `name varchar(200) not null`;
- `description text null`;
- `unit varchar(16) not null`;
- `sale_price numeric(14,2) not null`;
- `cost_price numeric(14,2) null`;
- `track_inventory boolean not null default true`;
- `status varchar(24) not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, sku)` quando `sku` nao for nulo;
- `unique (client_id, barcode)` quando `barcode` nao for nulo;
- `sale_price >= 0`;
- `cost_price is null or cost_price >= 0`;
- `status in ('active', 'inactive')`.

### `pdv_establishment_customers`

Clientes do estabelecimento/tenant, nao confundir com `clients` do Identity Hub.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `name varchar(200) not null`;
- `document_number varchar(32) null`;
- `email varchar(180) null`;
- `phone varchar(40) null`;
- `status varchar(24) not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, document_number)` quando `document_number` nao for nulo;
- `status in ('active', 'inactive')`.

### `pdv_operators`

Operadores do PDV vinculados a identidades autenticadas pelo Identity Hub.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `identity_id uuid not null`;
- `display_name varchar(160) not null`;
- `role varchar(40) not null`;
- `status varchar(24) not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, identity_id)`;
- `role in ('master', 'manager', 'cashier')`;
- `status in ('active', 'inactive')`.

Observacao:

- `identity_id` referencia identidade do Identity Hub de forma logica; a integridade entre bancos deve ser validada por contrato/API, nao por FK cross-database.

### `pdv_stock_locations`

Locais de estoque.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `name varchar(160) not null`;
- `type varchar(40) not null`;
- `status varchar(24) not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;

Constraints:

- `unique (client_id, name)`;
- `type in ('store', 'warehouse', 'virtual')`;
- `status in ('active', 'inactive')`.

### `pdv_inventory_balances`

Saldo atual por produto/local.

Campos:

- `client_id uuid not null`;
- `product_id uuid not null`;
- `location_id uuid not null`;
- `quantity numeric(14,3) not null default 0`;
- `reserved_quantity numeric(14,3) not null default 0`;
- `updated_at timestamptz not null`;

Constraints:

- `primary key (client_id, product_id, location_id)`;
- `quantity >= 0`;
- `reserved_quantity >= 0`;
- `reserved_quantity <= quantity`.

### `pdv_inventory_movements`

Movimentos auditaveis de estoque.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `product_id uuid not null`;
- `location_id uuid not null`;
- `type varchar(40) not null`;
- `quantity numeric(14,3) not null`;
- `reason varchar(160) null`;
- `source_type varchar(40) not null`;
- `source_id uuid null`;
- `occurred_at timestamptz not null`;
- `created_by_identity_id uuid not null`;
- `created_at timestamptz not null`;

Constraints:

- `type in ('initial', 'adjustment_in', 'adjustment_out', 'batch_import')` na Sprint 1;
- `quantity > 0`;
- `source_type in ('manual_adjustment', 'batch_import')` na Sprint 1.

### `pdv_inventory_imports`

Importacoes em lote de estoque.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `location_id uuid not null`;
- `status varchar(32) not null`;
- `file_name varchar(240) null`;
- `total_rows integer not null default 0`;
- `processed_rows integer not null default 0`;
- `failed_rows integer not null default 0`;
- `created_by_identity_id uuid not null`;
- `created_at timestamptz not null`;
- `processed_at timestamptz null`;

Constraints:

- `status in ('pending', 'processing', 'processed', 'processed_with_errors', 'failed')`;
- `total_rows >= 0`;
- `processed_rows >= 0`;
- `failed_rows >= 0`.

### `pdv_inventory_import_rows`

Linhas da importacao em lote.

Campos:

- `id uuid primary key`;
- `client_id uuid not null`;
- `import_id uuid not null`;
- `row_number integer not null`;
- `product_id uuid null`;
- `sku varchar(80) null`;
- `barcode varchar(80) null`;
- `quantity numeric(14,3) not null`;
- `status varchar(32) not null`;
- `error_message text null`;
- `movement_id uuid null`;

Constraints:

- `unique (client_id, import_id, row_number)`;
- `quantity > 0`;
- `status in ('pending', 'processed', 'failed')`;
- linha deve resolver produto por `product_id`, `sku` ou `barcode`.

## Relacionamentos

```text
pdv_categories 1 -> N pdv_products
pdv_products 1 -> N pdv_inventory_balances
pdv_stock_locations 1 -> N pdv_inventory_balances
pdv_products 1 -> N pdv_inventory_movements
pdv_stock_locations 1 -> N pdv_inventory_movements
pdv_inventory_imports 1 -> N pdv_inventory_import_rows
pdv_inventory_import_rows 0/1 -> 1 pdv_inventory_movements
```

Todos os relacionamentos devem preservar `client_id`.

## Indices Recomendados

- `pdv_categories(client_id, status, name)`;
- `pdv_products(client_id, status, name)`;
- `pdv_products(client_id, sku)`;
- `pdv_products(client_id, barcode)`;
- `pdv_establishment_customers(client_id, status, name)`;
- `pdv_operators(client_id, status, role)`;
- `pdv_inventory_movements(client_id, product_id, occurred_at desc)`;
- `pdv_inventory_imports(client_id, status, created_at desc)`;
- `pdv_inventory_import_rows(client_id, import_id, status)`;

## Fora De Escopo Do Modelo Sprint 1

- vendas;
- pagamentos;
- caixa;
- fiscal;
- sync offline;
- reservas avancadas;
- precificacao por tabela;
- variacoes de produto;
- lotes/validade.
