-- svc-jboot-payments: database and internal capability.

\connect postgres

SELECT 'CREATE DATABASE jboot_payments'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'jboot_payments')\gexec

\connect jboot_payments
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\connect jboot_identity

INSERT INTO capability_registry (slug, label, description, service_name)
VALUES (
  'payments',
  'Pagamentos',
  'Criacao e acompanhamento interno de cobrancas provider-neutral',
  'svc-jboot-payments'
)
ON CONFLICT (slug)
DO UPDATE SET label = EXCLUDED.label,
              description = EXCLUDED.description,
              service_name = EXCLUDED.service_name,
              active = true;

INSERT INTO client_capabilities (client_id, capability, enabled, enabled_by, enabled_at)
SELECT c.id, 'payments', true, i.id, NOW()
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
