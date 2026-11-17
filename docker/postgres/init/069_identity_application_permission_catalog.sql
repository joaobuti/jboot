\set ON_ERROR_STOP on
\connect jboot_identity

CREATE TABLE IF NOT EXISTS application_permission_catalog (
    application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    permission_type text NOT NULL CHECK (permission_type IN ('scope', 'role')),
    permission_key text NOT NULL,
    label text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    PRIMARY KEY (application_id, permission_type, permission_key)
);

INSERT INTO application_permission_catalog (application_id, permission_type, permission_key, label)
SELECT a.id, values.permission_type, values.permission_key, values.label
FROM applications a
JOIN (VALUES
    ('flow', 'scope', 'flow:read', 'Visualizar Flow'),
    ('flow', 'scope', 'flow:write', 'Operar Flow'),
    ('flow', 'scope', 'flow:admin', 'Administrar Flow'),
    ('flow', 'scope', 'flow:customers:read', 'Visualizar clientes'),
    ('flow', 'scope', 'flow:customers:write', 'Administrar clientes'),
    ('flow', 'scope', 'flow:users:manage', 'Administrar usuários do escritório'),
    ('flow', 'role', 'board_admin', 'Administrador de boards'),
    ('flow', 'role', 'board_member', 'Membro de boards'),
    ('flow', 'role', 'board_viewer', 'Visualizador de boards'),
    ('juridico', 'scope', 'juridico:read', 'Visualizar Juridico'),
    ('juridico', 'scope', 'juridico:write', 'Operar Juridico'),
    ('juridico', 'scope', 'juridico:admin', 'Administrar Juridico'),
    ('juridico', 'role', 'juridico_admin', 'Administrador Juridico'),
    ('pdv', 'scope', 'pdv:admin:read', 'Visualizar administracao'),
    ('pdv', 'scope', 'pdv:admin:write', 'Alterar administracao'),
    ('pdv', 'scope', 'pdv:inventory:read', 'Visualizar estoque'),
    ('pdv', 'scope', 'pdv:inventory:write', 'Alterar estoque'),
    ('pdv', 'scope', 'pdv:operators:manage', 'Administrar operadores'),
    ('pdv', 'scope', 'pdv:sales:read', 'Visualizar vendas'),
    ('pdv', 'scope', 'pdv:sales:write', 'Operar vendas'),
    ('pdv', 'scope', 'pdv:cashier:read', 'Visualizar caixa'),
    ('pdv', 'scope', 'pdv:cashier:write', 'Operar caixa'),
    ('pdv', 'scope', 'pdv:comanda:cozinha', 'Operar cozinha'),
    ('pdv', 'scope', 'pdv:comanda:bar', 'Operar bar'),
    ('pdv', 'scope', 'pdv:comanda:balcao', 'Operar balcao'),
    ('pdv', 'role', 'pdv_admin', 'Administrador do PDV')
) AS values(application_slug, permission_type, permission_key, label)
  ON values.application_slug = a.slug
ON CONFLICT (application_id, permission_type, permission_key)
DO UPDATE SET label = EXCLUDED.label, status = 'active';
