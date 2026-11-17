-- 034: module_attributes JSONB on entitlements
-- Allows per-application context (e.g. PDV location_id) to be carried in JWT
-- without polluting the Identity schema with application-specific columns.

\c jboot_identity

ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS module_attributes JSONB NOT NULL DEFAULT '{}';
