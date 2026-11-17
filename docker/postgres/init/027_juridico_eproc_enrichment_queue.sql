\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

ALTER TABLE juridico_processes
    ADD COLUMN IF NOT EXISTS detail_status varchar(24) NOT NULL DEFAULT 'pending'
        CHECK (detail_status IN ('pending', 'running', 'done', 'error')),
    ADD COLUMN IF NOT EXISTS detail_enriched_at timestamptz,
    ADD COLUMN IF NOT EXISTS detail_error text;

CREATE TABLE IF NOT EXISTS juridico_eproc_process_enrichment_jobs (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid        NOT NULL,
    process_id    uuid        NOT NULL REFERENCES juridico_processes(id) ON DELETE CASCADE,
    status        varchar(24) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'done', 'error')),
    attempt_count integer     NOT NULL DEFAULT 0,
    locked_at     timestamptz,
    locked_by     text,
    last_error    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (process_id)
);

CREATE INDEX IF NOT EXISTS juridico_eproc_process_enrichment_queue_idx
    ON juridico_eproc_process_enrichment_jobs(client_id, status, created_at)
    WHERE status IN ('pending', 'running');
