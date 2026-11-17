\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Flow CRM de leads, Sprint 3.5 (docs/product/flow-crm-leads-sprints.md;
-- ADR 014, Decisao 6): escritorios e visibilidade por escritorio.
--
-- - `kanban_offices`: escritorio do tenant, cadastrado pelo administrador
--   (`flow:admin`). Nunca e apagado, so inativado. Nome unico entre os
--   ATIVOS do tenant (sem caixa e sem espacos nas pontas).
-- - `kanban_user_offices`: vinculo N:N usuario -> escritorio (um usuario pode
--   ter varios escritorios). Remover o vinculo apaga a linha (com auditoria
--   no servico).
-- - `kanban_cards.office_id`: escritorio do card. NULO ate o administrador
--   atribuir; nenhum backfill automatico.
-- - `kanban_settings`: chave por tenant `office_visibility_enabled`, default
--   false. Com a chave desligada o comportamento atual do Flow nao muda.
--
-- Chaves compostas `(client_id, id)` amarram vinculo e card ao escritorio do
-- MESMO tenant (defesa em profundidade alem do filtro do servico).
--
-- Migration aditiva e idempotente: so cria objetos/colunas ausentes; nao
-- altera nem remove dado existente.

CREATE TABLE IF NOT EXISTS kanban_offices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    name varchar(160) NOT NULL CHECK (btrim(name) <> ''),
    active boolean NOT NULL DEFAULT true,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kanban_offices_client_id_id_key UNIQUE (client_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_offices_active_name_idx
    ON kanban_offices (client_id, lower(btrim(name)))
    WHERE active;

CREATE TABLE IF NOT EXISTS kanban_user_offices (
    client_id uuid NOT NULL,
    identity_id uuid NOT NULL,
    office_id uuid NOT NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, identity_id, office_id),
    CONSTRAINT kanban_user_offices_office_fkey
        FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id)
);

CREATE INDEX IF NOT EXISTS kanban_user_offices_office_idx
    ON kanban_user_offices (client_id, office_id);

ALTER TABLE kanban_cards
    ADD COLUMN IF NOT EXISTS office_id uuid NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'kanban_cards_office_fkey'
          AND conrelid = 'kanban_cards'::regclass
    ) THEN
        -- MATCH SIMPLE (default): office_id NULO nao e verificado.
        ALTER TABLE kanban_cards
            ADD CONSTRAINT kanban_cards_office_fkey
            FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS kanban_cards_client_board_office_idx
    ON kanban_cards (client_id, board_id, office_id);

CREATE TABLE IF NOT EXISTS kanban_settings (
    client_id uuid PRIMARY KEY,
    office_visibility_enabled boolean NOT NULL DEFAULT false,
    enabled_by_identity_id uuid NULL,
    enabled_at timestamptz NULL,
    updated_by_identity_id uuid NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
