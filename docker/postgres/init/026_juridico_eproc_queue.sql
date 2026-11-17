\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

ALTER TABLE juridico_captacao_consultations
    DROP CONSTRAINT IF EXISTS juridico_captacao_consultations_status_check;

ALTER TABLE juridico_captacao_consultations
    ADD CONSTRAINT juridico_captacao_consultations_status_check
    CHECK (status IN ('pending', 'running', 'done', 'error'));

ALTER TABLE juridico_captacao_consultations
    ADD COLUMN IF NOT EXISTS job_id uuid,
    ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_at timestamptz,
    ADD COLUMN IF NOT EXISTS locked_by text;

CREATE TABLE IF NOT EXISTS juridico_eproc_query_jobs (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id             uuid        NOT NULL,
    portal_id             uuid        NOT NULL REFERENCES juridico_portals(id),
    status                varchar(24) NOT NULL DEFAULT 'queued'
                                      CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    keyword_filter        text,
    cpf_filter            varchar(14),
    total                 integer     NOT NULL DEFAULT 0,
    processed             integer     NOT NULL DEFAULT 0,
    success_count         integer     NOT NULL DEFAULT 0,
    error_count           integer     NOT NULL DEFAULT 0,
    processes_received    integer     NOT NULL DEFAULT 0,
    processes_persisted   integer     NOT NULL DEFAULT 0,
    processes_filtered    integer     NOT NULL DEFAULT 0,
    last_error            text,
    worker_id             text,
    started_at            timestamptz,
    finished_at           timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS juridico_captacao_consultations_queue_idx
    ON juridico_captacao_consultations(client_id, portal_id, status, created_at)
    WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS juridico_eproc_query_jobs_client_status_idx
    ON juridico_eproc_query_jobs(client_id, status, created_at DESC);
