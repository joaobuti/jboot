\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Importacao de processos em andamento por planilha (docs/product/flow-process-import-sprints.md, Sprint 1).
--
-- - `kanban_process_imports`: o lote (board destino, escritorio, quem importou, andamento).
-- - `kanban_process_import_rows`: uma linha valida por numero CNJ. Nome, CPF e situacao (STATUS) da
--   planilha so existem enquanto o lote processa: ao concluir, viram NULL (minimizacao). O resultado
--   (card, cliente, motivo de falha) fica.
-- O card criado tem origem `kanban/flow_process_import/<cnj>`; a unicidade do CNJ no tenant e a da
-- Sprint 2 de flow-card-actions (peticao, card DataJud, card importado, vinculo no Juridico).

CREATE TABLE IF NOT EXISTS kanban_process_imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards (id),
    office_id uuid NOT NULL,
    created_by_identity_id uuid NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    total_rows integer NOT NULL CHECK (total_rows BETWEEN 1 AND 2000),
    created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
    existing_count integer NOT NULL DEFAULT 0 CHECK (existing_count >= 0),
    failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    failure_code varchar(60) NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    started_at timestamptz NULL,
    finished_at timestamptz NULL,
    UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS kanban_process_imports_client_created_idx
    ON kanban_process_imports (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kanban_process_import_rows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    import_id uuid NOT NULL,
    line integer NOT NULL CHECK (line >= 1),
    process_number char(20) NOT NULL CHECK (process_number ~ '^[0-9]{20}$'),
    tribunal varchar(16) NOT NULL,
    customer_name varchar(160) NULL,
    customer_cpf char(11) NULL CHECK (customer_cpf IS NULL OR customer_cpf ~ '^[0-9]{11}$'),
    situation varchar(200) NULL,
    status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'created', 'existing', 'failed')),
    card_id uuid NULL REFERENCES kanban_cards (id),
    customer_id uuid NULL,
    existing_card_id uuid NULL,
    existing_board_id uuid NULL,
    extras_done boolean NOT NULL DEFAULT false,
    skipped_assignees integer NOT NULL DEFAULT 0 CHECK (skipped_assignees >= 0),
    error_code varchar(60) NULL,
    processed_at timestamptz NULL,
    CONSTRAINT kanban_process_import_rows_lot_fkey
        FOREIGN KEY (client_id, import_id) REFERENCES kanban_process_imports (client_id, id),
    UNIQUE (import_id, process_number),
    UNIQUE (import_id, line)
);

CREATE INDEX IF NOT EXISTS kanban_process_import_rows_lot_idx
    ON kanban_process_import_rows (client_id, import_id, status, line);
