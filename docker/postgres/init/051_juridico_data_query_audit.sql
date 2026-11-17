\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE jboot_juridico_advocacia_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jboot_juridico_advocacia_dev')\gexec

\connect jboot_juridico_advocacia_dev

CREATE TABLE IF NOT EXISTS juridico_data_query_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  request_id uuid NOT NULL,
  provider varchar(32) NOT NULL CHECK (provider IN ('datajud')),
  tribunal varchar(32),
  process_number_hmac char(64) NOT NULL,
  hmac_key_version smallint NOT NULL CHECK (hmac_key_version > 0),
  result_status varchar(32) NOT NULL CHECK (result_status IN (
    'success', 'not_found', 'restricted', 'invalid', 'rate_limited',
    'timeout', 'provider_unavailable', 'internal_error'
  )),
  provider_latency_ms integer CHECK (provider_latency_ms >= 0),
  provider_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_juridico_data_audit_client_created
  ON juridico_data_query_audit (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_juridico_data_audit_client_process
  ON juridico_data_query_audit (client_id, process_number_hmac, created_at DESC);
