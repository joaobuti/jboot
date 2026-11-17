\set ON_ERROR_STOP on

SELECT 'CREATE DATABASE jboot_juridico_advocacia_dev'
WHERE NOT EXISTS (
    SELECT 1 FROM pg_database WHERE datname = 'jboot_juridico_advocacia_dev'
)\gexec

\connect jboot_juridico_advocacia_dev

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Portal registry: portais disponíveis na plataforma
CREATE TABLE IF NOT EXISTS juridico_portals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug varchar(80) NOT NULL UNIQUE,
    name varchar(160) NOT NULL,
    auth_type varchar(40) NOT NULL CHECK (auth_type IN ('none', 'user_pass', 'token', 'totp_2fa')),
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Contrato de acesso por tenant: quais portais cada client_id contratou
CREATE TABLE IF NOT EXISTS juridico_tenant_portals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    portal_id uuid NOT NULL REFERENCES juridico_portals(id),
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    suspended_reason varchar(80),
    contracted_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, portal_id)
);

-- Mapeamento UF -> portais elegíveis para captação
CREATE TABLE IF NOT EXISTS juridico_portal_ufs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    portal_id uuid NOT NULL REFERENCES juridico_portals(id),
    uf char(2) NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (portal_id, uf)
);

-- Credenciais criptografadas por tenant/portal (valores nunca em plaintext)
CREATE TABLE IF NOT EXISTS juridico_portal_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    portal_id uuid NOT NULL REFERENCES juridico_portals(id),
    encrypted_username bytea,
    encrypted_password bytea,
    encrypted_token bytea,
    encrypted_totp_secret bytea,
    encryption_key_ref varchar(80) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, portal_id)
);

-- Configuração de scheduling por tenant/portal
CREATE TABLE IF NOT EXISTS juridico_scheduling_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    portal_id uuid NOT NULL REFERENCES juridico_portals(id),
    interval varchar(24) NOT NULL CHECK (interval IN ('daily', 'weekly', 'biweekly', 'monthly')),
    status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    temporal_workflow_id varchar(240),
    last_run_at timestamptz,
    next_run_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, portal_id)
);

-- Processos encontrados por consulta
CREATE TABLE IF NOT EXISTS juridico_processes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    portal_id uuid NOT NULL REFERENCES juridico_portals(id),
    process_number varchar(120) NOT NULL,
    cpf_query varchar(14),
    subject text,
    data_autuacao date,
    parties jsonb NOT NULL DEFAULT '[]',
    raw_data jsonb NOT NULL DEFAULT '{}',
    match_data jsonb NOT NULL DEFAULT '{}',
    detail_status varchar(24) NOT NULL DEFAULT 'pending' CHECK (detail_status IN ('pending', 'running', 'done', 'error')),
    detail_enriched_at timestamptz,
    detail_error text,
    found_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS juridico_eproc_process_enrichment_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    process_id uuid NOT NULL REFERENCES juridico_processes(id) ON DELETE CASCADE,
    status varchar(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'error')),
    attempt_count integer NOT NULL DEFAULT 0,
    locked_at timestamptz,
    locked_by text,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (process_id)
);

-- Andamentos de processo (fase 2)
CREATE TABLE IF NOT EXISTS juridico_process_updates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    process_id uuid NOT NULL REFERENCES juridico_processes(id),
    portal_id uuid NOT NULL REFERENCES juridico_portals(id),
    description text NOT NULL,
    occurred_at timestamptz NOT NULL,
    raw_data jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Notificações in-app de falha de portal
CREATE TABLE IF NOT EXISTS juridico_portal_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    portal_id uuid NOT NULL REFERENCES juridico_portals(id),
    type varchar(40) NOT NULL CHECK (type IN ('auth_expired', 'portal_unavailable', 'captcha_detected', 'unknown_error')),
    message text NOT NULL,
    workflow_id varchar(240),
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log de operações sensíveis (sem valor de credencial)
CREATE TABLE IF NOT EXISTS juridico_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    identity_id uuid,
    event_type text NOT NULL,
    portal_id uuid,
    payload jsonb NOT NULL DEFAULT '{}',
    ip text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS juridico_tenant_portals_client_idx ON juridico_tenant_portals(client_id, status);
CREATE INDEX IF NOT EXISTS juridico_portal_ufs_uf_idx ON juridico_portal_ufs(uf, status);
CREATE INDEX IF NOT EXISTS juridico_portal_credentials_client_portal_idx ON juridico_portal_credentials(client_id, portal_id);
CREATE INDEX IF NOT EXISTS juridico_scheduling_configs_client_status_idx ON juridico_scheduling_configs(client_id, status);
CREATE INDEX IF NOT EXISTS juridico_processes_client_portal_idx ON juridico_processes(client_id, portal_id);
CREATE INDEX IF NOT EXISTS juridico_processes_client_cpf_idx ON juridico_processes(client_id, cpf_query) WHERE cpf_query IS NOT NULL;
CREATE INDEX IF NOT EXISTS juridico_processes_client_number_idx ON juridico_processes(client_id, process_number);
CREATE INDEX IF NOT EXISTS juridico_eproc_process_enrichment_queue_idx
    ON juridico_eproc_process_enrichment_jobs(client_id, status, created_at)
    WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS juridico_process_updates_process_time_idx ON juridico_process_updates(process_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS juridico_portal_notifications_client_unread_idx ON juridico_portal_notifications(client_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS juridico_audit_events_client_created_idx ON juridico_audit_events(client_id, created_at DESC);

-- Seed: portais iniciais
INSERT INTO juridico_portals (slug, name, auth_type) VALUES
    ('esaj', 'ESAJ - Tribunal de Justiça de SP', 'user_pass'),
    ('projudi', 'Projudi - Sistema de Processo Judicial', 'user_pass'),
    ('eproc', 'eProc - Processo Eletrônico TRF', 'user_pass')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO juridico_portal_ufs (portal_id, uf, status)
SELECT id, 'SC', 'active'
FROM juridico_portals
WHERE slug = 'eproc'
ON CONFLICT (portal_id, uf) DO UPDATE SET
    status = 'active',
    updated_at = now();
