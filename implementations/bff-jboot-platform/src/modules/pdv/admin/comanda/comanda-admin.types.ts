export type ComandaAdminQueueType = 'cozinha' | 'bar';

export type ComandaAdminItemStatus =
  | 'pendente'
  | 'em_producao'
  | 'pronto'
  | 'liberado_para_entrega'
  | 'cancelado';

export interface ComandaAdminItemRow {
  id: string;
  comandaId: string;
  comandaPedidoId: string;
  tableNumber: number;
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: string;
  queueType: ComandaAdminQueueType;
  notes: string | null;
  status: ComandaAdminItemStatus;
  createdAt: string;
  encaminhadoPor: string | null;
  encaminhadoAt: string | null;
  finalizadoPor: string | null;
  finalizadoAt: string | null;
  liberadoPor: string | null;
  liberadoAt: string | null;
  canceladoPor: string | null;
  canceladoAt: string | null;
  cancelReason: string | null;
  cancelIsException: boolean;
}

export interface ComandaSummaryRow {
  id: string;
  tableNumber: number;
  customerName: string;
  customerPhone: string | null;
  customerDocumentNumber: string | null;
  status: 'aberta' | 'fechada';
  openedAt: string;
  lastActivityAt: string;
  closingRequestedAt: string | null;
  total: string;
}

export interface ComandaAdminRawRow {
  id: string;
  clientId: string;
  status: 'aberta' | 'fechada';
  /** Sprint 9: venda-pai, criada no primeiro recebimento parcial. */
  parentSaleId: string | null;
}

