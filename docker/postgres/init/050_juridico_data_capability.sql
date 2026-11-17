-- Internal capability for the official judicial-data service.
\connect jboot_identity

INSERT INTO capability_registry (slug, label, description, service_name)
VALUES (
  'juridico-data',
  'Dados juridicos oficiais',
  'Consulta interna normalizada a fontes judiciais oficiais',
  'svc-jboot-juridico-data'
)
ON CONFLICT (slug)
DO UPDATE SET label = EXCLUDED.label,
              description = EXCLUDED.description,
              service_name = EXCLUDED.service_name,
              active = true;
