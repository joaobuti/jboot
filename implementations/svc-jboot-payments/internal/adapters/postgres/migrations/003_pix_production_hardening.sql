ALTER TABLE charges ADD COLUMN IF NOT EXISTS next_verification_at TIMESTAMPTZ;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS last_verification_at TIMESTAMPTZ;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS last_verification_error TEXT;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS verification_locked_at TIMESTAMPTZ;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS verification_locked_by TEXT;
ALTER TABLE charges ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_charges_reconciliation_due
    ON charges (next_verification_at, updated_at)
    WHERE status IN ('verification_pending', 'pending_reconciliation');

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS operator_identity_id UUID;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE refunds
   SET reason = COALESCE(reason, 'legacy_record_before_audited_refund_workflow'),
       operator_identity_id = COALESCE(operator_identity_id, '00000000-0000-0000-0000-000000000000'::UUID);

ALTER TABLE refunds ALTER COLUMN reason SET NOT NULL;
ALTER TABLE refunds ALTER COLUMN operator_identity_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_tenant_status
    ON refunds (client_id, status, created_at DESC);
