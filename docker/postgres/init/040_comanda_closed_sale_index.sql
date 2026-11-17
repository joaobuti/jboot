\set ON_ERROR_STOP on
\connect jboot_pdv

-- Sprint 6 do modulo `comanda` (CPF-na-nota): a tela de emissao de NF do
-- PDV busca a comanda de origem de uma venda pelo caminho inverso
-- (comandas.closed_sale_id -> pdv_sales.id) pra sugerir os dados do
-- cliente final no destinatario. Ver
-- src/modules/pdv/admin/comanda/comanda-admin.repository.ts,
-- findComandaCustomerLinkByClosedSaleId.
CREATE INDEX IF NOT EXISTS idx_comandas_closed_sale_id ON comandas(closed_sale_id) WHERE closed_sale_id IS NOT NULL;
