\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Conector Claude do Flow (docs/product/kanban-claude-connector-sprints.md).
-- Desligado por default. Ligar exige o aceite do gestor sobre o envio do
-- conteudo dos cards para a conta Claude pessoal de cada usuario conectado.
CREATE TABLE IF NOT EXISTS kanban_claude_connector_settings (
    client_id uuid PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT false,
    mask_personal_data boolean NOT NULL DEFAULT true,
    policy_accepted_at timestamptz NULL,
    policy_accepted_by_identity_id uuid NULL,
    updated_by_identity_id uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT enabled OR policy_accepted_at IS NOT NULL),
    CHECK ((policy_accepted_at IS NULL) = (policy_accepted_by_identity_id IS NULL))
);
