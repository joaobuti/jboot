\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

CREATE TABLE IF NOT EXISTS kanban_drive_configurations (
  client_id uuid PRIMARY KEY,
  provider varchar(32) NOT NULL DEFAULT 'google_drive' CHECK (provider = 'google_drive'),
  credential_mode varchar(24) NOT NULL CHECK (credential_mode = 'oauth'),
  secret_ref text NOT NULL CHECK (secret_ref ~ '^env:[A-Z][A-Z0-9_]{2,127}$'),
  root_folder_id varchar(255) NOT NULL,
  status varchar(16) NOT NULL CHECK (status IN ('inactive','active','paused','invalid')),
  retention_policy jsonb NOT NULL DEFAULT '{"mirrorCanonicalDeletion":true,"legalHoldBlocksDeletion":true}'::jsonb,
  last_tested_at timestamptz NULL,
  last_success_at timestamptz NULL,
  last_error_code varchar(80) NULL,
  updated_by_identity_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kanban_document_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL, document_id uuid NOT NULL,
  document_version integer NOT NULL CHECK (document_version > 0), checksum char(64) NOT NULL,
  provider varchar(32) NOT NULL DEFAULT 'google_drive' CHECK (provider = 'google_drive'),
  remote_file_id varchar(255) NULL, remote_version varchar(255) NULL,
  state varchar(16) NOT NULL CHECK (state IN ('pending','syncing','synced','failed','paused','deleted')),
  attempt_count integer NOT NULL DEFAULT 0, lease_until timestamptz NULL, next_attempt_at timestamptz NULL,
  last_error_code varchar(80) NULL, last_reconciled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, document_id, document_version, checksum, provider)
);
ALTER TABLE kanban_document_syncs ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS kanban_document_syncs_claim_idx ON kanban_document_syncs (state, next_attempt_at, lease_until);

CREATE OR REPLACE FUNCTION kanban_enqueue_drive_sync() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'aprovado' AND (OLD.status IS DISTINCT FROM NEW.status) AND EXISTS (
    SELECT 1 FROM kanban_drive_configurations d WHERE d.client_id = NEW.client_id AND d.status = 'active'
  ) THEN
    INSERT INTO kanban_document_syncs (client_id,document_id,document_version,checksum,state,next_attempt_at)
    VALUES (NEW.client_id,NEW.id,NEW.version,NEW.sha256,'pending',clock_timestamp())
    ON CONFLICT (client_id,document_id,document_version,checksum,provider) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kanban_enqueue_drive_sync_trg ON kanban_card_generated_documents;
CREATE TRIGGER kanban_enqueue_drive_sync_trg AFTER UPDATE OF status ON kanban_card_generated_documents
FOR EACH ROW EXECUTE FUNCTION kanban_enqueue_drive_sync();
