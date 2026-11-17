\connect jboot_pdv

CREATE TABLE IF NOT EXISTS platform_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    source_module varchar(80) NOT NULL,
    source_entity_type varchar(120) NOT NULL,
    source_entity_id uuid NOT NULL,
    usage varchar(120) NOT NULL,
    file_name varchar(255) NOT NULL,
    content_type varchar(120) NOT NULL,
    size_bytes integer NOT NULL CHECK (size_bytes > 0),
    storage_bucket varchar(120) NOT NULL,
    storage_key varchar(700) NOT NULL,
    uploaded_by_identity_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, storage_bucket, storage_key)
);

CREATE INDEX IF NOT EXISTS platform_files_client_source_idx
    ON platform_files (client_id, source_module, source_entity_type, source_entity_id, usage);

ALTER TABLE catalog_products
    ADD COLUMN IF NOT EXISTS image_file_id uuid;

CREATE INDEX IF NOT EXISTS catalog_products_client_image_file_idx
    ON catalog_products (client_id, image_file_id);
