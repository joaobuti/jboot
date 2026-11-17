\set ON_ERROR_STOP on
\connect jboot_identity

ALTER TABLE client_applications
    ADD COLUMN IF NOT EXISTS plan_code text,
    ADD COLUMN IF NOT EXISTS billing_ref text,
    ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE client_applications
    DROP CONSTRAINT IF EXISTS client_applications_status_check;

ALTER TABLE client_applications
    ADD CONSTRAINT client_applications_status_check
    CHECK (status IN ('active', 'trial', 'suspended', 'cancelled'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'entitlements_client_application_contract_fk'
    ) THEN
        ALTER TABLE entitlements
            ADD CONSTRAINT entitlements_client_application_contract_fk
            FOREIGN KEY (client_id, application_id)
            REFERENCES client_applications(client_id, application_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS client_applications_client_idx
    ON client_applications(client_id, status);

CREATE INDEX IF NOT EXISTS client_applications_application_idx
    ON client_applications(application_id, status);
