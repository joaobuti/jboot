/**
 * Estado da mesa no mapa do salao. Todos derivados em tempo de leitura — nao
 * ha coluna de estado nem marcacao manual (decisao de produto registrada em
 * docs/product/comanda-sprints.md, Sprint 8): mesa marcada errada a mao e
 * pior que mesa sem marcacao.
 */
export type ComandaSalaoMesaState =
  | 'livre'
  | 'ocupada'
  | 'item_pronto'
  | 'conta_solicitada'
  | 'pagamento_parcial'
  | 'esquecida'
  | 'inativa';

export interface ComandaSalaoRawRow {
  mesaId: string;
  tableNumber: number;
  label: string | null;
  mesaStatus: 'active' | 'inactive';
  comandaId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerDocumentNumber: string | null;
  openedAt: string | null;
  lastActivityAt: string | null;
  closingRequestedAt: string | null;
  total: string;
  pago: string;
  itensPendentes: number;
  itensEmProducao: number;
  itensProntos: number;
}

export interface ComandaSalaoComandaView {
  comandaId: string;
  customerName: string;
  customerPhone: string | null;
  customerDocumentNumber: string | null;
  openedAt: string;
  lastActivityAt: string;
  closingRequestedAt: string | null;
  total: string;
  /** Sprint 9: quanto ja foi recebido; `saldo` e o que falta quitar. */
  pago: string;
  saldo: string;
  itensPendentes: number;
  itensEmProducao: number;
  itensProntos: number;
  isForgotten: boolean;
}

export interface ComandaSalaoMesaView {
  mesaId: string;
  tableNumber: number;
  label: string | null;
  mesaStatus: 'active' | 'inactive';
  state: ComandaSalaoMesaState;
  /**
   * Comanda e sempre individual: uma mesa de 10 lugares pode ter N comandas
   * abertas simultaneas, uma por pessoa. O card do salao mostra essa
   * contagem — tratar a mesa como conta unica seria mentira neste produto.
   */
  comandasAbertas: number;
  totalMesa: string;
  comandas: ComandaSalaoComandaView[];
}
