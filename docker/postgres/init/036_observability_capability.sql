-- =============================================================
-- 036_observability_capability.sql
-- Banco: jboot_identity
-- Registra a plataforma interna de observabilidade. Não é
-- application Identity e não aparece no seletor pós-login.
-- =============================================================

\connect jboot_identity

INSERT INTO capability_registry (slug, label, description, service_name)
VALUES (
  'observability',
  'Observabilidade',
  'Coleta e análise interna de métricas, traces e logs da plataforma',
  'ops-jboot-observability'
)
ON CONFLICT (slug)
DO UPDATE SET label = EXCLUDED.label,
              description = EXCLUDED.description,
              service_name = EXCLUDED.service_name,
              active = true;

