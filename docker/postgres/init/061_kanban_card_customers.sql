\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Flow CRM de leads, Sprint 1 (docs/product/flow-crm-leads-sprints.md):
-- o card (lead) referencia um cliente final titular do nucleo
-- `establishment-customers` (ADR 013).
--
-- - Um titular por card: `card_id` e a chave primaria.
-- - `customer_id` aponta para `pdv_establishment_customers` em OUTRO banco
--   (`jboot_pdv`); por isso nao ha FK. A existencia e validada pelo servico
--   exportado do modulo `establishment-customers` antes do vinculo.
-- - Troca de cliente substitui a linha (DELETE + INSERT na mesma transacao),
--   preservando `created_at` imutavel; o historico fica em
--   `kanban_card_activities` (`card.customer_linked`/`card.customer_changed`).
-- - O indice (client_id, customer_id) sustenta a checagem de visibilidade:
--   "o usuario e membro ativo de algum quadro com card nao excluido vinculado
--   a este cliente?".
--
-- Migration aditiva e idempotente: so cria objetos ausentes.

CREATE TABLE IF NOT EXISTS kanban_card_customers (
    card_id uuid PRIMARY KEY REFERENCES kanban_cards(id),
    client_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    created_by_identity_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kanban_card_customers_client_customer_idx
    ON kanban_card_customers (client_id, customer_id);
