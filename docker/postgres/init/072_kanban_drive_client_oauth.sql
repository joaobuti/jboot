\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Drive por cliente: o proprio cliente autoriza a conta Google dele pela tela
-- do Flow. O refresh token fica cifrado (AES-256-GCM); `secret_ref` por
-- variavel de ambiente deixa de ser usado.
ALTER TABLE kanban_drive_configurations
  ADD COLUMN IF NOT EXISTS google_account_email varchar(320) NULL,
  ADD COLUMN IF NOT EXISTS refresh_token_enc bytea NULL,
  ADD COLUMN IF NOT EXISTS root_folder_name varchar(255) NULL,
  ALTER COLUMN secret_ref DROP NOT NULL,
  ALTER COLUMN root_folder_id DROP NOT NULL;

UPDATE kanban_drive_configurations
   SET status = 'inactive', secret_ref = NULL
 WHERE refresh_token_enc IS NULL AND status <> 'inactive';

ALTER TABLE kanban_drive_configurations
  DROP CONSTRAINT IF EXISTS kanban_drive_configurations_active_requires_connection;
ALTER TABLE kanban_drive_configurations
  ADD CONSTRAINT kanban_drive_configurations_active_requires_connection
  CHECK (status <> 'active' OR (refresh_token_enc IS NOT NULL AND root_folder_id IS NOT NULL));
