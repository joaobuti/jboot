\set ON_ERROR_STOP on
\connect jboot_kanban_demo_dev

-- Escritorio ativo do usuario (docs/product/flow-offices-sprints.md, Sprints 2 e 3): o escritorio
-- em que ele atua para cadastrar cliente e card. Sem linha (ou vinculo/escritorio desfeito), vale o
-- principal, se for dele, ou o primeiro dos seus escritorios ativos.
--
-- Idempotente. So roda sozinho em volume novo; em base existente aplicar a mao.
BEGIN;

CREATE TABLE IF NOT EXISTS kanban_user_active_office (
  client_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  office_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, identity_id),
  CONSTRAINT kanban_user_active_office_office_fk FOREIGN KEY (client_id, office_id)
    REFERENCES kanban_offices (client_id, id)
);

COMMIT;
