\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Flow CRM de leads, Sprint 2 (docs/product/flow-crm-leads-sprints.md):
-- checklist de documentos por quadro e revisao pela central.
--
-- - `kanban_board_document_types`: checklist configuravel por quadro. Tipo nunca
--   e apagado, so desativado (`active = false`), para preservar o historico dos
--   documentos ja enviados. Nome unico entre os tipos ATIVOS do quadro
--   (comparacao sem caixa e sem espacos nas pontas).
-- - `kanban_card_documents`: cada envio cria uma linha nova (historico
--   preservado). O estado do item (card, tipo) e o da linha mais recente.
--   O arquivo e um `kanban_card_attachments` vinculado ao `system_event`
--   `card.document_uploaded` (anexo so contra activity existente; mesmo bucket).
--   `created_at` usa clock_timestamp() para ordenar envios feitos na mesma
--   transacao (now() repetiria o instante).
-- - `kanban_member_profiles.can_review_documents`: perfil revisor (central).
--   `board_admin` revisa sempre, sem depender desta flag.
-- - `kanban_board_columns.requires_complete_checklist`: card so entra na
--   coluna com todos os tipos obrigatorios ativos aceitos. Sem efeito
--   retroativo sobre cards que ja estao na coluna.
--
-- Migration aditiva e idempotente: so cria objetos/colunas ausentes; nao
-- altera nem remove dado existente.

ALTER TABLE kanban_member_profiles
    ADD COLUMN IF NOT EXISTS can_review_documents boolean NOT NULL DEFAULT false;

ALTER TABLE kanban_board_columns
    ADD COLUMN IF NOT EXISTS requires_complete_checklist boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS kanban_board_document_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    name varchar(160) NOT NULL CHECK (btrim(name) <> ''),
    required boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kanban_board_document_types_active_name_idx
    ON kanban_board_document_types (client_id, board_id, lower(btrim(name)))
    WHERE active;

CREATE INDEX IF NOT EXISTS kanban_board_document_types_board_order_idx
    ON kanban_board_document_types (client_id, board_id, sort_order);

CREATE TABLE IF NOT EXISTS kanban_card_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards(id),
    document_type_id uuid NOT NULL REFERENCES kanban_board_document_types(id),
    attachment_id uuid NOT NULL UNIQUE REFERENCES kanban_card_attachments(id),
    status varchar(16) NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'aceito', 'rejeitado')),
    rejection_reason text NULL,
    reviewed_by_identity_id uuid NULL,
    reviewed_at timestamptz NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK (status <> 'rejeitado' OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')),
    CHECK (status = 'rejeitado' OR rejection_reason IS NULL),
    CHECK ((status = 'enviado') = (reviewed_at IS NULL)),
    CHECK ((reviewed_at IS NULL) = (reviewed_by_identity_id IS NULL))
);

-- Linha mais recente por (card, tipo) e agregacao de completude por quadro.
CREATE INDEX IF NOT EXISTS kanban_card_documents_card_type_created_idx
    ON kanban_card_documents (client_id, card_id, document_type_id, created_at DESC);
