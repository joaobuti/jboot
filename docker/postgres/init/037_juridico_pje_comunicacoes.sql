\set ON_ERROR_STOP on

\connect jboot_juridico_advocacia_dev

-- Portal PJe/DJEN (Comunica API do CNJ).
-- A consulta de comunicacoes e publica; a credencial e opcional e existe apenas
-- para escopos autenticados futuros (endpoints exclusivos de tribunais).
INSERT INTO juridico_portals (slug, name, auth_type) VALUES
    ('pje', 'PJe - Comunicacoes DJEN (CNJ)', 'user_pass')
ON CONFLICT (slug) DO NOTHING;

-- Configuracao de monitoramento por tenant: define o filtro obrigatorio da API.
CREATE TABLE IF NOT EXISTS juridico_pje_monitoring_configs (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id         uuid        NOT NULL,
    numero_oab        varchar(20),
    uf_oab            varchar(2),
    nome_advogado     text,
    nome_parte        text,
    siglas_tribunal   text[]      NOT NULL DEFAULT '{}',
    lookback_days     integer     NOT NULL DEFAULT 7
                                  CHECK (lookback_days BETWEEN 1 AND 90),
    status            varchar(24) NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'inactive')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id)
);

-- A API exige ao menos um filtro discriminante por consulta.
ALTER TABLE juridico_pje_monitoring_configs
    DROP CONSTRAINT IF EXISTS juridico_pje_monitoring_configs_filtro_check;

ALTER TABLE juridico_pje_monitoring_configs
    ADD CONSTRAINT juridico_pje_monitoring_configs_filtro_check
    CHECK (
        (numero_oab IS NOT NULL AND uf_oab IS NOT NULL)
        OR nome_advogado IS NOT NULL
        OR nome_parte IS NOT NULL
        OR cardinality(siglas_tribunal) > 0
    );

-- Comunicacoes capturadas do DJEN. Deduplicacao pelo hash publicado pelo CNJ.
CREATE TABLE IF NOT EXISTS juridico_pje_comunicacoes (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id             uuid        NOT NULL,
    comunicacao_id        bigint,
    numero_comunicacao    bigint,
    hash                  text        NOT NULL,
    numero_processo       varchar(30),
    numero_processo_mask  varchar(40),
    sigla_tribunal        varchar(20),
    nome_orgao            text,
    id_orgao              bigint,
    tipo_comunicacao      text,
    tipo_documento        text,
    nome_classe           text,
    codigo_classe         varchar(20),
    meio                  varchar(1),
    link                  text,
    texto                 text,
    data_disponibilizacao date,
    destinatarios         jsonb       NOT NULL DEFAULT '[]'::jsonb,
    advogados             jsonb       NOT NULL DEFAULT '[]'::jsonb,
    raw_data              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    sync_job_id           uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, hash)
);

CREATE INDEX IF NOT EXISTS juridico_pje_comunicacoes_client_data_idx
    ON juridico_pje_comunicacoes (client_id, data_disponibilizacao DESC, id);

CREATE INDEX IF NOT EXISTS juridico_pje_comunicacoes_client_processo_idx
    ON juridico_pje_comunicacoes (client_id, numero_processo);

CREATE INDEX IF NOT EXISTS juridico_pje_comunicacoes_client_tribunal_idx
    ON juridico_pje_comunicacoes (client_id, sigla_tribunal);

-- Fila de sincronizacao, no mesmo padrao de juridico_eproc_query_jobs.
CREATE TABLE IF NOT EXISTS juridico_pje_sync_jobs (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id            uuid        NOT NULL,
    portal_id            uuid        NOT NULL REFERENCES juridico_portals(id),
    status               varchar(24) NOT NULL DEFAULT 'queued'
                                     CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    trigger_source       varchar(24) NOT NULL DEFAULT 'manual'
                                     CHECK (trigger_source IN ('manual', 'scheduled')),
    filtro               jsonb       NOT NULL DEFAULT '{}'::jsonb,
    data_inicio          date,
    data_fim             date,
    paginas_lidas        integer     NOT NULL DEFAULT 0,
    comunicacoes_recebidas integer   NOT NULL DEFAULT 0,
    comunicacoes_novas   integer     NOT NULL DEFAULT 0,
    comunicacoes_duplicadas integer  NOT NULL DEFAULT 0,
    rate_limit_waits     integer     NOT NULL DEFAULT 0,
    last_error           text,
    worker_id            text,
    started_at           timestamptz,
    finished_at          timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS juridico_pje_sync_jobs_client_status_idx
    ON juridico_pje_sync_jobs (client_id, status, created_at DESC);
