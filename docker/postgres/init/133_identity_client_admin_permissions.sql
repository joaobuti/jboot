\set ON_ERROR_STOP on
\connect jboot_identity

-- Pacote de admin do cliente por modulo (docs/product/tenant-isolation-sprints.md, Sprint 0.1).
-- Regra do usuario (2026-11-11): todo modulo contratado, no cadastro ou depois, da ao admin do
-- cliente todas as permissoes de admin daquele modulo. O catalogo passa a ser a fonte: o cadastro
-- gravava `app:read/app:write/app:admin`, que nenhum modulo reconhece.
--
-- `client_admin_default` marca o que entra no pacote. Entram todos os scopes do modulo e os papeis
-- de administrador; papeis menores (membro, visualizador) ficam fora. Completa o catalogo com as
-- permissoes que o codigo exige e faltavam. Os scopes `flow:connector:*` sao do conector Claude
-- (OAuth), nao de usuario, e ficam fora.
--
-- Idempotente. So roda sozinho em volume novo; em base existente aplicar a mao.
BEGIN;

ALTER TABLE application_permission_catalog
  ADD COLUMN IF NOT EXISTS client_admin_default boolean NOT NULL DEFAULT false;

INSERT INTO application_permission_catalog (application_id, permission_type, permission_key, label)
SELECT a.id, v.permission_type, v.permission_key, v.label
FROM applications a
JOIN (VALUES
  ('flow', 'scope', 'users:manage', 'Cadastrar usuários do módulo'),
  ('flow', 'scope', 'flow:users:manage', 'Administrar usuários do escritório'),
  ('flow', 'scope', 'ai:agents:manage', 'Administrar agentes de IA'),
  ('flow', 'scope', 'ai:credentials:manage', 'Administrar credenciais de IA'),
  ('flow', 'role', 'client_admin', 'Administrador do cliente'),
  ('juridico', 'scope', 'users:manage', 'Cadastrar usuários do módulo'),
  ('juridico', 'role', 'client_admin', 'Administrador do cliente'),
  ('pdv', 'scope', 'users:manage', 'Cadastrar usuários do módulo'),
  ('pdv', 'role', 'client_admin', 'Administrador do cliente')
) AS v(slug, permission_type, permission_key, label) ON v.slug = a.slug
ON CONFLICT (application_id, permission_type, permission_key) DO UPDATE SET status = 'active';

UPDATE application_permission_catalog
   SET client_admin_default = (
     permission_type = 'scope'
     OR permission_key IN ('client_admin', 'board_admin', 'pdv_admin', 'juridico_admin')
   );

COMMIT;
