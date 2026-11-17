\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Flow CRM de leads, Sprint 4 (docs/product/flow-crm-leads-sprints.md;
-- gate docs/product/flow-crm-leads-sprint-4-9-gate.md; ADR 014, Decisao 3):
-- envio completo do lead, fila do gestor, devolucao com motivo e estado do lead.
--
-- - `kanban_boards.lead_intake_enabled` (PE1): "Enviar para analise" so existe
--   em quadro com a captacao ligada pelo administrador; default false, entao
--   quadros de tarefa de outros tenants nao mudam.
-- - `kanban_lead_required_fields` (P16): campos cadastrais obrigatorios para o
--   envio, por tenant. `field_key` vem de whitelist em codigo
--   (`leads/lead-fields.ts`). `kanban_settings.lead_required_fields_configured_at`
--   NULO = tenant nunca configurou = default P16 (nome, data de nascimento e
--   endereco; CPF vem sempre do cliente vinculado).
-- - `kanban_lead_submissions`: um ciclo por envio (autor, data, escritorio do
--   card no envio, snapshot do cadastro e dos documentos usados; devolucao com
--   autor, data e motivo). Snapshot guarda o cadastro no momento do envio para
--   detectar alteracao posterior por outro caminho (cadastro compartilhado,
--   ADR 014 Decisao 6); nunca vai para log, evento ou auditoria.
-- - `kanban_card_leads`: estado da analise do lead em CAMPO PROPRIO,
--   independente da coluna (ADR 014, Decisao 3). Ausencia de linha = `rascunho`.
--   O CHECK ja traz o enum completo do PO; a S4 so usa `rascunho`, `enviado` e
--   `devolvido` (`aguardando_revisao` entra pela S6, PE14; `em_processamento` e
--   `falha_processamento` pela S7; `aprovado` pela S6).
--
-- Migration aditiva e idempotente: so cria objetos/colunas ausentes; nao
-- altera nem remove dado existente.

ALTER TABLE kanban_boards
    ADD COLUMN IF NOT EXISTS lead_intake_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE kanban_settings
    ADD COLUMN IF NOT EXISTS lead_required_fields_configured_at timestamptz NULL;

ALTER TABLE kanban_settings
    ADD COLUMN IF NOT EXISTS lead_required_fields_configured_by uuid NULL;

CREATE TABLE IF NOT EXISTS kanban_lead_required_fields (
    client_id uuid NOT NULL,
    field_key varchar(64) NOT NULL CHECK (field_key ~ '^[A-Za-z]+(\.[A-Za-z]+)?$'),
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, field_key)
);

CREATE TABLE IF NOT EXISTS kanban_lead_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    card_id uuid NOT NULL REFERENCES kanban_cards (id),
    board_id uuid NOT NULL,
    office_id uuid NULL,
    customer_id uuid NOT NULL,
    customer_snapshot jsonb NOT NULL,
    customer_snapshot_sha256 char(64) NOT NULL,
    documents_snapshot jsonb NOT NULL,
    required_fields text[] NOT NULL,
    submitted_by_identity_id uuid NOT NULL,
    submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    returned_by_identity_id uuid NULL,
    returned_at timestamptz NULL,
    return_reason varchar(500) NULL,
    CONSTRAINT kanban_lead_submissions_client_id_id_key UNIQUE (client_id, id),
    CONSTRAINT kanban_lead_submissions_office_fkey
        FOREIGN KEY (client_id, office_id) REFERENCES kanban_offices (client_id, id),
    -- Devolucao: autor, data e motivo juntos (ou nenhum).
    CONSTRAINT kanban_lead_submissions_return_check CHECK (
        (returned_at IS NULL AND returned_by_identity_id IS NULL AND return_reason IS NULL)
        OR (returned_at IS NOT NULL AND returned_by_identity_id IS NOT NULL AND btrim(return_reason) <> '')
    )
);

CREATE INDEX IF NOT EXISTS kanban_lead_submissions_card_idx
    ON kanban_lead_submissions (client_id, card_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS kanban_card_leads (
    card_id uuid PRIMARY KEY REFERENCES kanban_cards (id),
    client_id uuid NOT NULL,
    status varchar(32) NOT NULL CHECK (status IN (
        'rascunho', 'enviado', 'em_processamento', 'aguardando_revisao',
        'aprovado', 'devolvido', 'falha_processamento'
    )),
    current_submission_id uuid NULL,
    status_changed_by_identity_id uuid NOT NULL,
    status_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT kanban_card_leads_submission_fkey
        FOREIGN KEY (client_id, current_submission_id) REFERENCES kanban_lead_submissions (client_id, id)
);

-- Fila do gestor: leads do tenant por estado.
CREATE INDEX IF NOT EXISTS kanban_card_leads_client_status_idx
    ON kanban_card_leads (client_id, status);
