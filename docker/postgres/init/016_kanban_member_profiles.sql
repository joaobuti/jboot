\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Sprint 3: perfis de movimentacao por board (MemberProfile), transicoes de
-- coluna permitidas por perfil (MemberProfileTransition) e ACL de coluna por
-- perfil (BoardColumnPermission). Ver docs/product/kanban-sprint-3-gate.md e
-- docs/data/kanban-sprint-3-data-model.md.

CREATE TABLE IF NOT EXISTS kanban_member_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    board_id uuid NOT NULL REFERENCES kanban_boards(id),
    name varchar(160) NOT NULL,
    can_delete_archived_cards boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, board_id, name)
);

CREATE TABLE IF NOT EXISTS kanban_member_profile_transitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    profile_id uuid NOT NULL REFERENCES kanban_member_profiles(id),
    from_board_column_id uuid NOT NULL REFERENCES kanban_board_columns(id),
    to_board_column_id uuid NOT NULL REFERENCES kanban_board_columns(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, profile_id, from_board_column_id, to_board_column_id),
    CHECK (from_board_column_id <> to_board_column_id)
);

CREATE TABLE IF NOT EXISTS kanban_board_column_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    profile_id uuid NOT NULL REFERENCES kanban_member_profiles(id),
    board_column_id uuid NOT NULL REFERENCES kanban_board_columns(id),
    can_view boolean NOT NULL DEFAULT true,
    can_edit boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (client_id, profile_id, board_column_id),
    CHECK (can_edit = false OR can_view = true)
);

ALTER TABLE kanban_board_members
    ADD COLUMN IF NOT EXISTS profile_id uuid NULL REFERENCES kanban_member_profiles(id);

ALTER TABLE kanban_board_members
    DROP CONSTRAINT IF EXISTS kanban_board_members_role_check;

ALTER TABLE kanban_board_members
    ADD CONSTRAINT kanban_board_members_role_check
    CHECK (role IN ('board_admin', 'board_member', 'board_viewer'));

CREATE INDEX IF NOT EXISTS kanban_member_profiles_client_board_name_idx
    ON kanban_member_profiles(client_id, board_id, name);

CREATE INDEX IF NOT EXISTS kanban_member_profile_transitions_client_profile_idx
    ON kanban_member_profile_transitions(client_id, profile_id, from_board_column_id, to_board_column_id);

CREATE INDEX IF NOT EXISTS kanban_board_column_permissions_client_profile_idx
    ON kanban_board_column_permissions(client_id, profile_id, board_column_id);

CREATE INDEX IF NOT EXISTS kanban_board_members_client_board_profile_idx
    ON kanban_board_members(client_id, board_id, profile_id);
