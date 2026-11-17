-- =============================================================
-- 025_client_capabilities.sql — capability_registry e client_capabilities
-- Banco: jboot_identity
-- Registra capacidades contratuais s2s por cliente.
-- Serviços internos (fiscal, boleto, etc.) são capabilities,
-- não applications Identity — não aparecem no seletor pós-login.
-- Ver ADR 006: docs/architecture/decisions/006-client-capabilities.md
-- =============================================================

\connect jboot_identity

-- capability_registry: catálogo global de capacidades disponíveis na plataforma
CREATE TABLE IF NOT EXISTS capability_registry (
  slug          TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  service_name  TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- client_capabilities: capacidades habilitadas por cliente
CREATE TABLE IF NOT EXISTS client_capabilities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id),
  capability    TEXT NOT NULL REFERENCES capability_registry(slug),
  enabled       BOOLEAN NOT NULL DEFAULT false,
  enabled_by    UUID REFERENCES identities(id),
  enabled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, capability)
);

-- seed inicial: capacidade fiscal
INSERT INTO capability_registry (slug, label, description, service_name)
VALUES ('fiscal', 'Emissão de Nota Fiscal', 'Habilita emissão de NFC-e e NF-e via svc-jboot-fiscal', 'svc-jboot-fiscal')
ON CONFLICT (slug)
DO UPDATE SET label = EXCLUDED.label,
              description = EXCLUDED.description,
              service_name = EXCLUDED.service_name,
              active = true;

-- Habilita a capability fiscal para o client canonico do Operador Senior/JBOOT LTDA.
-- Replicar padrão dos seeds PDV/Jurídico: operador senior tem acesso a tudo em dev
INSERT INTO client_capabilities (client_id, capability, enabled, enabled_by, enabled_at)
SELECT c.id, 'fiscal', true, i.id, NOW()
FROM clients c
JOIN memberships m ON m.client_id = c.id AND m.status = 'active'
JOIN identities i ON i.id = m.identity_id
WHERE i.document_type = 'cpf'
  AND i.document_number = '00000000191'
  AND c.document_type = 'cnpj'
  AND c.document_number = '63784101000110'
ON CONFLICT (client_id, capability)
DO UPDATE SET enabled = true,
              enabled_by = EXCLUDED.enabled_by,
              enabled_at = EXCLUDED.enabled_at;
