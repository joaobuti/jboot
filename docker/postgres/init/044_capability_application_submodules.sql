\set ON_ERROR_STOP on
\connect jboot_identity

-- Unifica os "sub-modulos" contratados por cliente em capability_registry +
-- client_capabilities, que ate aqui atendiam apenas servicos s2s (ADR 006).
--
-- Problema resolvido: existiam tres mecanismos paralelos para "cliente tem X
-- habilitado" -- linha em client_applications (modulo contratado),
-- client_applications.config jsonb (flag ad-hoc, caso `autoatendimento_comanda`)
-- e capability_registry (caso `fiscal`). Os dois sub-modulos reais do PDV
-- viviam em tabelas diferentes e nenhum tinha tela.
--
-- Emenda a ADR 006: capability deixa de significar "servico s2s sem UI" e passa
-- a significar "capacidade contratavel que nao e application" -- cobrindo tanto
-- servico s2s (fiscal) quanto sub-feature com UI porem sem sessao Identity
-- propria (comanda, ja isenta de application_slug pela mesma razao). Ver
-- docs/architecture/decisions/008-capability-application-submodules.md.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, ON CONFLICT DO UPDATE e filtros por
-- presenca da chave jsonb. Este arquivo so roda automaticamente em volume
-- Postgres novo; em bases existentes (dev com dados e producao) precisa ser
-- aplicado a mao.

-- 1) Agrupamento por application pai. Nullable: capability puramente s2s que
--    nao pertence a nenhuma application continua valida (application_slug NULL).
ALTER TABLE capability_registry
  ADD COLUMN IF NOT EXISTS application_slug TEXT REFERENCES applications (slug);

-- 2) service_name deixa de ser obrigatorio: sub-modulo sem servico s2s dedicado
--    (comanda roda dentro do bff-jboot-platform) nao tem container proprio.
ALTER TABLE capability_registry
  ALTER COLUMN service_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capability_registry_application
  ON capability_registry (application_slug)
  WHERE application_slug IS NOT NULL;

-- 3) fiscal ja existia como capability s2s; passa a ser exibida como
--    sub-modulo do PDV, que e quem a consome.
UPDATE capability_registry
SET application_slug = 'pdv'
WHERE slug = 'fiscal'
  AND application_slug IS DISTINCT FROM 'pdv';

-- 4) comanda entra no catalogo como sub-modulo do PDV, sem servico s2s.
INSERT INTO capability_registry (slug, label, description, service_name, application_slug, active)
VALUES (
  'comanda',
  'Comanda por QR de mesa',
  'Autoatendimento anonimo por QR de mesa: cardapio publico, pedidos do cliente e fechamento.',
  NULL,
  'pdv',
  true
)
ON CONFLICT (slug) DO UPDATE
SET label            = EXCLUDED.label,
    description      = EXCLUDED.description,
    application_slug = EXCLUDED.application_slug,
    active           = EXCLUDED.active;

-- 5) Migra o estado por cliente do jsonb para client_capabilities.
INSERT INTO client_capabilities (client_id, capability, enabled, enabled_at)
SELECT ca.client_id,
       'comanda',
       COALESCE((ca.config ->> 'autoatendimento_comanda')::boolean, false),
       now()
FROM client_applications ca
JOIN applications a ON a.id = ca.application_id
WHERE a.slug = 'pdv'
  AND ca.config ? 'autoatendimento_comanda'
ON CONFLICT (client_id, capability) DO UPDATE
SET enabled = EXCLUDED.enabled;

-- 6) Remove a chave do jsonb: fonte unica passa a ser client_capabilities.
UPDATE client_applications ca
SET config     = ca.config - 'autoatendimento_comanda',
    updated_at = now()
FROM applications a
WHERE a.id = ca.application_id
  AND a.slug = 'pdv'
  AND ca.config ? 'autoatendimento_comanda';
