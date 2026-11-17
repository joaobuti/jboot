\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

CREATE TABLE IF NOT EXISTS juridico_captacao_cpfs (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id  uuid        NOT NULL,
    cpf        varchar(14) NOT NULL,
    nome       text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, cpf)
);

CREATE TABLE IF NOT EXISTS juridico_captacao_imports (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   uuid        NOT NULL,
    uf          char(2)     NOT NULL,
    filename    text,
    created_by  uuid,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS juridico_captacao_import_cpfs (
    import_id  uuid        NOT NULL REFERENCES juridico_captacao_imports(id) ON DELETE CASCADE,
    cpf_id     uuid        NOT NULL REFERENCES juridico_captacao_cpfs(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (import_id, cpf_id)
);

CREATE TABLE IF NOT EXISTS juridico_captacao_consultations (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf_id             uuid        NOT NULL REFERENCES juridico_captacao_cpfs(id) ON DELETE CASCADE,
    portal_id          uuid        NOT NULL REFERENCES juridico_portals(id),
    import_id          uuid        REFERENCES juridico_captacao_imports(id) ON DELETE SET NULL,
    client_id          uuid        NOT NULL,
    uf                 char(2),
    keyword_filter_snapshot text,
    result_window_years_snapshot integer NOT NULL DEFAULT 5,
    status             varchar(24) NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'running', 'done', 'error')),
    job_id             uuid,
    attempt_count      integer     NOT NULL DEFAULT 0,
    locked_at          timestamptz,
    locked_by          text,
    last_consulted_at  timestamptz,
    error_message      text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cpf_id, portal_id, import_id)
);

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

CREATE INDEX IF NOT EXISTS juridico_captacao_cpfs_client_idx
    ON juridico_captacao_cpfs(client_id);

CREATE INDEX IF NOT EXISTS juridico_captacao_imports_client_idx
    ON juridico_captacao_imports(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS juridico_captacao_import_cpfs_cpf_idx
    ON juridico_captacao_import_cpfs(cpf_id);

CREATE INDEX IF NOT EXISTS juridico_captacao_consultations_cpf_idx
    ON juridico_captacao_consultations(cpf_id);

CREATE INDEX IF NOT EXISTS juridico_captacao_consultations_import_idx
    ON juridico_captacao_consultations(import_id);

CREATE INDEX IF NOT EXISTS juridico_captacao_consultations_portal_status_idx
    ON juridico_captacao_consultations(portal_id, client_id, status);

-- índice para o worker buscar CPFs pendentes ou com periodicidade expirada
CREATE INDEX IF NOT EXISTS juridico_captacao_consultations_worker_idx
    ON juridico_captacao_consultations(portal_id, client_id, last_consulted_at)
    WHERE status IN ('pending', 'error');

CREATE INDEX IF NOT EXISTS juridico_captacao_consultations_queue_idx
    ON juridico_captacao_consultations(client_id, portal_id, status, created_at)
    WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS juridico_eproc_query_jobs_client_status_idx
    ON juridico_eproc_query_jobs(client_id, status, created_at DESC);
