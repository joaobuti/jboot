\set ON_ERROR_STOP on
\connect jboot_pdv

-- Sprint 2 do modulo `comanda` (autoatendimento via QR de mesa). Ver
-- implementations/bff-jboot-platform/modules/comanda/MODULE_CONTRACT.md
-- para o desenho completo (maquina de estados, segredos JWT, decisao de
-- nao usar geolocalizacao).

-- Mesas fisicas do estabelecimento. `token_version` permite revogar um QR
-- impresso (que nao expira por tempo) sem trocar o segredo JWT global.
CREATE TABLE IF NOT EXISTS comanda_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  table_number int NOT NULL,
  label varchar(80),
  status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  token_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, table_number)
);

-- Comanda: sempre individual (por customer), nunca compartilhada por mesa.
CREATE TABLE IF NOT EXISTS comandas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  table_number int NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','fechada')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  closing_requested_at timestamptz,
  closed_at timestamptz,
  paid_confirmed_by uuid,
  paid_confirmed_at timestamptz,
  closed_sale_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS comandas_client_customer_open_unique ON comandas(client_id, customer_id) WHERE status = 'aberta';
CREATE INDEX IF NOT EXISTS idx_comandas_client_status_activity ON comandas(client_id, status, last_activity_at);

-- Um "pedido" agrupa os itens submetidos numa unica chamada de garcom virtual.
CREATE TABLE IF NOT EXISTS comanda_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  comanda_id uuid NOT NULL REFERENCES comandas(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Item de fila. Preco/nome/queue_type sao sempre snapshot resolvido no
-- servidor a partir de catalog_products no momento do pedido — nunca
-- aceitos do payload do cliente.
CREATE TABLE IF NOT EXISTS comanda_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  comanda_id uuid NOT NULL REFERENCES comandas(id),
  comanda_pedido_id uuid NOT NULL REFERENCES comanda_pedidos(id),
  product_id uuid NOT NULL,
  product_name_snapshot varchar(200) NOT NULL,
  unit_price_snapshot numeric(14,2) NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  queue_type varchar(16) NOT NULL CHECK (queue_type IN ('cozinha','bar')),
  notes text,
  status varchar(24) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_producao','pronto','liberado_para_entrega','cancelado')),
  encaminhado_por uuid, encaminhado_at timestamptz,
  finalizado_por uuid, finalizado_at timestamptz,
  liberado_por uuid, liberado_at timestamptz,
  cancelado_por uuid, cancelado_at timestamptz,
  cancel_reason text,
  cancel_is_exception boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comanda_itens_client_queue_status ON comanda_itens(client_id, queue_type, status);
CREATE INDEX IF NOT EXISTS idx_comanda_itens_comanda_status ON comanda_itens(comanda_id, status);

-- Tabela auxiliar de idempotencia para POST /comanda/public/pedidos (header
-- opcional `Idempotency-Key`). Nao faz parte do modelo de dados fechado no
-- MODULE_CONTRACT.md — e um detalhe de implementacao da Sprint 2, isolado
-- numa tabela propria para nao poluir `comanda_pedidos`. Ver
-- ComandaPedidosRepository para o fluxo de claim/consulta.
CREATE TABLE IF NOT EXISTS comanda_pedido_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id uuid NOT NULL REFERENCES comandas(id),
  idempotency_key varchar(200) NOT NULL,
  comanda_pedido_id uuid REFERENCES comanda_pedidos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comanda_id, idempotency_key)
);

-- Seed de dev: mesas de exemplo do tenant JBOOT LTDA (mesmo cliente usado
-- pelos demais seeds de dev do PDV), para permitir testar o fluxo de QR
-- sem depender de uma UI de admin para cadastrar mesa (fora de escopo desta
-- sprint).
\connect jboot_identity
SELECT id AS "jboot_client_id"
FROM clients
WHERE document_type = 'cnpj' AND document_number = '63784101000110'
LIMIT 1 \gset

\connect jboot_pdv
INSERT INTO comanda_tables (client_id, table_number, label, status)
VALUES
  (:'jboot_client_id'::uuid, 1, 'Mesa 1', 'active'),
  (:'jboot_client_id'::uuid, 2, 'Mesa 2', 'active')
ON CONFLICT (client_id, table_number) DO NOTHING;
