\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Fecho da peticao montado pelo Flow e versao corrigida (ADR 020, emenda de 2026-10-29;
-- docs/product/flow-initial-petitions-sprints.md, S7 e S8).
--
-- - `kanban_user_lawyer_profiles` e `kanban_user_oabs`: nome para assinatura e OABs (uma por UF) do
--   usuario do Flow. Quem assina e um responsavel do card com OAB na UF da acao.
-- - `kanban_offices.city`/`uf`: local do fecho.
-- - `kanban_card_petition_runs.closing_gaps`: pendencias do fecho (local, advogado) da execucao.
-- - `kanban_card_initial_petitions.protocol_number`/`protocoled_at`: preenchidos pela futura automacao
--   de protocolo; com protocolo, a versao corrigida e recusada.
-- - Gatilho do Drive: versao nova de uma peticao herda o arquivo remoto da versao anterior ja
--   sincronizada, e o Drive atualiza o mesmo arquivo.
-- - `kanban_office_lawyers` (migration 102) fica como historico, sem leitura nem escrita.
--
-- Migration aditiva e idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS kanban_user_lawyer_profiles (
    client_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    signature_name varchar(200) NOT NULL CHECK (btrim(signature_name) <> ''),
    updated_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (client_id, identity_id)
);

CREATE TABLE IF NOT EXISTS kanban_user_oabs (
    client_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    oab_uf char(2) NOT NULL CHECK (oab_uf IN (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
      'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
    oab_number varchar(20) NOT NULL CHECK (oab_number ~ '^[0-9]{1,7}(-?[A-Z])?$'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (client_id, identity_id, oab_uf),
    CONSTRAINT kanban_user_oabs_profile_fkey
      FOREIGN KEY (client_id, identity_id) REFERENCES kanban_user_lawyer_profiles (client_id, identity_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS kanban_user_oabs_uf_idx ON kanban_user_oabs (client_id, oab_uf);

ALTER TABLE kanban_offices ADD COLUMN IF NOT EXISTS city varchar(120) NULL;
ALTER TABLE kanban_offices ADD COLUMN IF NOT EXISTS uf char(2) NULL;
ALTER TABLE kanban_offices DROP CONSTRAINT IF EXISTS kanban_offices_uf_check;
ALTER TABLE kanban_offices
  ADD CONSTRAINT kanban_offices_uf_check CHECK (uf IS NULL OR uf IN (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
    'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'));
ALTER TABLE kanban_offices DROP CONSTRAINT IF EXISTS kanban_offices_city_check;
ALTER TABLE kanban_offices
  ADD CONSTRAINT kanban_offices_city_check CHECK ((city IS NULL) = (uf IS NULL) AND (city IS NULL OR btrim(city) <> ''));

ALTER TABLE kanban_card_petition_runs ADD COLUMN IF NOT EXISTS closing_gaps varchar(40)[] NOT NULL DEFAULT '{}';

ALTER TABLE kanban_card_initial_petitions ADD COLUMN IF NOT EXISTS protocol_number varchar(40) NULL;
ALTER TABLE kanban_card_initial_petitions ADD COLUMN IF NOT EXISTS protocoled_at timestamptz NULL;

CREATE OR REPLACE FUNCTION kanban_enqueue_drive_sync() RETURNS trigger AS $$
DECLARE
  previous_remote varchar(255);
BEGIN
  IF NEW.status = 'aprovado' AND (OLD.status IS DISTINCT FROM NEW.status) AND EXISTS (
    SELECT 1 FROM kanban_drive_configurations d WHERE d.client_id = NEW.client_id AND d.status = 'active'
  ) THEN
    IF NEW.petition_id IS NOT NULL THEN
      SELECT s.remote_file_id INTO previous_remote
      FROM kanban_document_syncs s
      JOIN kanban_card_generated_documents d ON d.client_id = s.client_id AND d.id = s.document_id
      WHERE d.client_id = NEW.client_id AND d.petition_id = NEW.petition_id AND d.id <> NEW.id
        AND s.state = 'synced' AND s.remote_file_id IS NOT NULL
      ORDER BY d.version DESC, s.updated_at DESC
      LIMIT 1;
    END IF;
    INSERT INTO kanban_document_syncs (client_id,document_id,document_version,checksum,state,next_attempt_at,remote_file_id)
    VALUES (NEW.client_id,NEW.id,NEW.version,NEW.sha256,'pending',clock_timestamp(),previous_remote)
    ON CONFLICT (client_id,document_id,document_version,checksum,provider) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
