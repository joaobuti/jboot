\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Acoes ja ajuizadas na ficha e advogados por UF no escritorio (ADR 020;
-- docs/product/flow-initial-petitions-sprints.md, S2):
--
-- - `kanban_customer_prior_lawsuits`: acoes ja ajuizadas pelo cliente (banco, numero CNJ). Remocao
--   logica (`removed_at`), para o historico; numero unico por cliente entre as acoes vigentes.
-- - `kanban_customer_prior_lawsuit_declarations`: confirmacao explicita "cliente nao tem acoes
--   anteriores". No maximo uma vigente por cliente; revogada ao incluir acao (`lawsuit_added`) ou
--   desfeita pela pessoa (`withdrawn`).
-- - `kanban_office_lawyers`: advogado que assina, por escritorio, com OAB e UF. No maximo um ativo
--   por escritorio e UF (Q6).
--
-- Migration aditiva e idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS kanban_customer_prior_lawsuits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    bank varchar(200) NOT NULL CHECK (btrim(bank) <> ''),
    process_number varchar(25) NOT NULL
      CHECK (process_number ~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$'),
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    removed_at timestamptz NULL,
    removed_by_identity_id uuid NULL,
    CONSTRAINT kanban_customer_prior_lawsuits_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_customer_prior_lawsuits_removed_check
      CHECK ((removed_at IS NULL) = (removed_by_identity_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_customer_prior_lawsuits_active_number_idx
    ON kanban_customer_prior_lawsuits (client_id, customer_id, process_number)
    WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS kanban_customer_prior_lawsuits_customer_idx
    ON kanban_customer_prior_lawsuits (client_id, customer_id, created_at);

CREATE TABLE IF NOT EXISTS kanban_customer_prior_lawsuit_declarations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    declared_by_identity_id uuid NOT NULL,
    declared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    revoked_at timestamptz NULL,
    revoked_by_identity_id uuid NULL,
    revoked_reason varchar(20) NULL CHECK (revoked_reason IN ('lawsuit_added', 'withdrawn')),
    CONSTRAINT kanban_customer_prior_lawsuit_declarations_revoked_check
      CHECK ((revoked_at IS NULL AND revoked_by_identity_id IS NULL AND revoked_reason IS NULL)
             OR (revoked_at IS NOT NULL AND revoked_by_identity_id IS NOT NULL AND revoked_reason IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_customer_prior_lawsuit_declarations_current_idx
    ON kanban_customer_prior_lawsuit_declarations (client_id, customer_id)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS kanban_office_lawyers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    office_id uuid NOT NULL,
    name varchar(200) NOT NULL CHECK (btrim(name) <> ''),
    oab_number varchar(20) NOT NULL CHECK (oab_number ~ '^[0-9]{1,7}(-?[A-Z])?$'),
    oab_uf char(2) NOT NULL CHECK (oab_uf IN (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
      'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
    active boolean NOT NULL DEFAULT true,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT kanban_office_lawyers_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_office_lawyers_office_fkey
      FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_office_lawyers_active_uf_idx
    ON kanban_office_lawyers (client_id, office_id, oab_uf)
    WHERE active;

COMMIT;
