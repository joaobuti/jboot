\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE jboot_pdv'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'jboot_pdv'
)\gexec

\connect jboot_pdv

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION unaccent_safe(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT translate(
        input,
        'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
    );
$$;

CREATE OR REPLACE FUNCTION slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT trim(both '-' from regexp_replace(lower(unaccent_safe(input)), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE TABLE IF NOT EXISTS pdv_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    parent_id uuid,
    name varchar(160) NOT NULL,
    slug varchar(180) NOT NULL,
    description text,
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, slug)
);

CREATE TABLE IF NOT EXISTS pdv_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    category_id uuid,
    sku varchar(80),
    barcode varchar(80),
    name varchar(200) NOT NULL,
    description text,
    unit varchar(16) NOT NULL,
    sale_price numeric(14,2) NOT NULL CHECK (sale_price >= 0),
    cost_price numeric(14,2) CHECK (cost_price IS NULL OR cost_price >= 0),
    track_inventory boolean NOT NULL DEFAULT true,
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pdv_products_client_sku_unique
    ON pdv_products(client_id, sku)
    WHERE sku IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pdv_products_client_barcode_unique
    ON pdv_products(client_id, barcode)
    WHERE barcode IS NOT NULL;

CREATE TABLE IF NOT EXISTS pdv_establishment_customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    name varchar(200) NOT NULL,
    document_number varchar(32),
    email varchar(180),
    phone varchar(40),
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pdv_establishment_customers_document_unique
    ON pdv_establishment_customers(client_id, document_number)
    WHERE document_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS pdv_operators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    display_name varchar(160) NOT NULL,
    role varchar(40) NOT NULL CHECK (role IN ('master', 'manager', 'cashier')),
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, identity_id)
);

CREATE TABLE IF NOT EXISTS pdv_stock_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    name varchar(160) NOT NULL,
    type varchar(40) NOT NULL CHECK (type IN ('store', 'warehouse', 'virtual')),
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, name)
);

CREATE TABLE IF NOT EXISTS pdv_inventory_balances (
    client_id uuid NOT NULL,
    product_id uuid NOT NULL,
    location_id uuid NOT NULL,
    quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, product_id, location_id),
    CHECK (reserved_quantity <= quantity)
);

CREATE TABLE IF NOT EXISTS pdv_inventory_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    product_id uuid NOT NULL,
    location_id uuid NOT NULL,
    type varchar(40) NOT NULL CHECK (type IN ('initial', 'adjustment_in', 'adjustment_out', 'batch_import')),
    quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
    reason varchar(160),
    source_type varchar(40) NOT NULL CHECK (source_type IN ('manual_adjustment', 'batch_import')),
    source_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdv_inventory_imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    location_id uuid NOT NULL,
    status varchar(32) NOT NULL CHECK (status IN ('pending', 'processing', 'processed', 'processed_with_errors', 'failed')),
    file_name varchar(240),
    total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    processed_rows integer NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
    failed_rows integer NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS pdv_inventory_import_rows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    import_id uuid NOT NULL,
    row_number integer NOT NULL,
    product_id uuid,
    sku varchar(80),
    barcode varchar(80),
    quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
    status varchar(32) NOT NULL CHECK (status IN ('pending', 'processed', 'failed')),
    error_message text,
    movement_id uuid,
    UNIQUE (client_id, import_id, row_number)
);

CREATE TABLE IF NOT EXISTS pdv_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}',
    ip text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdv_categories_client_status_name_idx ON pdv_categories(client_id, status, name);
CREATE INDEX IF NOT EXISTS pdv_products_client_status_name_idx ON pdv_products(client_id, status, name);
CREATE INDEX IF NOT EXISTS pdv_customers_client_status_name_idx ON pdv_establishment_customers(client_id, status, name);
CREATE INDEX IF NOT EXISTS pdv_operators_client_status_role_idx ON pdv_operators(client_id, status, role);
CREATE INDEX IF NOT EXISTS pdv_inventory_movements_client_product_time_idx ON pdv_inventory_movements(client_id, product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS pdv_inventory_imports_client_status_created_idx ON pdv_inventory_imports(client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pdv_inventory_import_rows_client_import_status_idx ON pdv_inventory_import_rows(client_id, import_id, status);
