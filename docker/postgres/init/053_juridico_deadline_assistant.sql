\set ON_ERROR_STOP on
\connect jboot_juridico_advocacia_dev

CREATE TABLE IF NOT EXISTS juridico_deadline_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL, year smallint NOT NULL,
  source_url text, source_reference varchar(160), status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded')),
  created_by_identity_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, year, status)
);
CREATE TABLE IF NOT EXISTS juridico_deadline_calendar_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL, calendar_id uuid NOT NULL REFERENCES juridico_deadline_calendars(id) ON DELETE CASCADE,
  date date NOT NULL, name varchar(160) NOT NULL, kind varchar(16) NOT NULL CHECK (kind IN ('national_holiday','override')),
  reason text, supersedes_entry_id uuid REFERENCES juridico_deadline_calendar_entries(id), created_by_identity_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, date, name)
);
CREATE INDEX IF NOT EXISTS idx_juridico_deadline_entries_client_date ON juridico_deadline_calendar_entries(client_id, date);
CREATE TABLE IF NOT EXISTS juridico_deadline_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL, created_by_identity_id uuid NOT NULL,
  start_date date NOT NULL, business_days integer NOT NULL CHECK (business_days > 0), include_start boolean NOT NULL,
  result_date date NOT NULL, calendar_id uuid REFERENCES juridico_deadline_calendars(id), memory jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_juridico_deadline_calculations_client_created ON juridico_deadline_calculations(client_id, created_at DESC);
