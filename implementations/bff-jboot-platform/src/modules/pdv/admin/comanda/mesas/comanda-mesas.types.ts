export type ComandaMesaStatus = 'active' | 'inactive';

export interface ComandaMesaRow {
  id: string;
  tableNumber: number;
  label: string | null;
  status: ComandaMesaStatus;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mesa com o QR ja assinado. O token acompanha a listagem para que a folha
 * de impressao em lote seja montada com uma unica chamada — assinar HMAC por
 * mesa e barato e evita N requisicoes no momento da impressao.
 */
export interface ComandaMesaView extends ComandaMesaRow {
  qrToken: string | null;
}
