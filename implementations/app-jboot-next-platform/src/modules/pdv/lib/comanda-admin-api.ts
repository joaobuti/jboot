"use client";

import { getApplicationAuthToken } from "@/lib/module-auth-token";

const API_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PDV_API_URL ??
  process.env.NEXT_PUBLIC_PDV_API_URL ??
  "http://localhost:8010";

export type ComandaQueueType = "cozinha" | "bar";

export type ComandaItemStatus =
  | "pendente"
  | "em_producao"
  | "pronto"
  | "liberado_para_entrega"
  | "cancelado";

export interface ComandaAdminItem {
  id: string;
  comandaId: string;
  comandaPedidoId: string;
  tableNumber: number;
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: string;
  queueType: ComandaQueueType;
  notes: string | null;
  status: ComandaItemStatus;
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

export type ComandaPaymentMethod = "dinheiro" | "cartao_credito" | "cartao_debito" | "pix" | "outro";

export interface ComandaSummary {
  id: string;
  tableNumber: number;
  customerName: string;
  customerPhone: string | null;
  customerDocumentNumber: string | null;
  status: "aberta" | "fechada";
  openedAt: string;
  lastActivityAt: string;
  closingRequestedAt: string | null;
  total: string;
}

export interface ComandaListItem extends ComandaSummary {
  isForgotten: boolean;
}

export interface ComandaPagamento {
  saleId: string;
  saleNumber: number;
  paymentMethod: ComandaPaymentMethod;
  amount: string;
  receivedAt: string;
}

/** Sprint 9: cada recebimento e uma venda derivada da venda-pai da comanda. */
export interface ComandaSaldo {
  total: string;
  pago: string;
  saldo: string;
  pagamentos: ComandaPagamento[];
}

export interface ComandaDetail {
  comanda: ComandaSummary;
  itens: ComandaAdminItem[];
  saldo: ComandaSaldo;
}

export type ComandaMesaStatus = "active" | "inactive";

export interface ComandaMesa {
  id: string;
  tableNumber: number;
  label: string | null;
  status: ComandaMesaStatus;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  /** `null` em mesa inativa: nao ha QR valido para imprimir. */
  qrToken: string | null;
}

export type ComandaSalaoMesaState =
  | "livre"
  | "ocupada"
  | "item_pronto"
  | "conta_solicitada"
  | "pagamento_parcial"
  | "esquecida"
  | "inativa";

export interface ComandaSalaoComanda {
  comandaId: string;
  customerName: string;
  customerPhone: string | null;
  customerDocumentNumber: string | null;
  openedAt: string;
  lastActivityAt: string;
  closingRequestedAt: string | null;
  total: string;
  /** Sprint 9: ja recebido e o que falta quitar. */
  pago: string;
  saldo: string;
  itensPendentes: number;
  itensEmProducao: number;
  itensProntos: number;
  isForgotten: boolean;
}

export interface ComandaSalaoMesa {
  mesaId: string;
  tableNumber: number;
  label: string | null;
  mesaStatus: ComandaMesaStatus;
  state: ComandaSalaoMesaState;
  /** Comanda e sempre individual: uma mesa pode ter N comandas simultaneas. */
  comandasAbertas: number;
  totalMesa: string;
  comandas: ComandaSalaoComanda[];
}

function getAuthToken(): string | null {
  return getApplicationAuthToken("app:pdv", "pdvAccessToken");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `PDV API error ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const comandaAdminApi = {
  itensPendentes: () => request<ComandaAdminItem[]>("/pdv/comanda/itens/pendentes"),
  itensProntos: () => request<ComandaAdminItem[]>("/pdv/comanda/itens/prontos"),
  fila: (queueType: ComandaQueueType) =>
    request<ComandaAdminItem[]>(`/pdv/comanda/fila?queueType=${queueType}`),
  encaminhar: (itemId: string) =>
    request<ComandaAdminItem>(`/pdv/comanda/itens/${itemId}/encaminhar`, { method: "POST" }),
  finalizar: (itemId: string) =>
    request<ComandaAdminItem>(`/pdv/comanda/itens/${itemId}/finalizar`, { method: "POST" }),
  liberar: (itemId: string) =>
    request<ComandaAdminItem>(`/pdv/comanda/itens/${itemId}/liberar`, { method: "POST" }),
  cancelar: (itemId: string, reason?: string) =>
    request<ComandaAdminItem>(`/pdv/comanda/itens/${itemId}/cancelar`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),
  listComandas: () => request<ComandaListItem[]>("/pdv/comanda"),
  comandaDetail: (comandaId: string) => request<ComandaDetail>(`/pdv/comanda/${comandaId}`),
  fechar: (comandaId: string, paymentMethod: ComandaPaymentMethod) =>
    request<{ comanda: ComandaSummary; saleId: string }>(`/pdv/comanda/${comandaId}/fechar`, {
      method: "POST",
      body: JSON.stringify({ paymentMethod })
    }),

  // Sprint 9 — recebimento parcial ou final. Valor sempre absoluto: divisao
  // em partes iguais e materializada na tela antes de enviar.
  registrarPagamento: (comandaId: string, amount: number, paymentMethod: ComandaPaymentMethod) =>
    request<{ comanda: ComandaSummary; saldo: ComandaSaldo; fechada: boolean }>(
      `/pdv/comanda/${comandaId}/pagamentos`,
      { method: "POST", body: JSON.stringify({ amount, paymentMethod }) }
    ),

  // Sprint 8 — mapa do salao (uma chamada agregada, ver comanda-sprints.md).
  salao: () => request<ComandaSalaoMesa[]>("/pdv/comanda-salao"),

  // Sprint 7 — cadastro de mesas e QR. Prefixo `comanda-mesas` (e nao
  // `comanda/mesas`) porque `/pdv/comanda/:id` capturaria a rota irma.
  listMesas: () => request<ComandaMesa[]>("/pdv/comanda-mesas"),
  createMesa: (tableNumber: number, label?: string) =>
    request<ComandaMesa>("/pdv/comanda-mesas", {
      method: "POST",
      body: JSON.stringify({ tableNumber, label: label?.trim() || undefined })
    }),
  updateMesa: (mesaId: string, label?: string) =>
    request<ComandaMesa>(`/pdv/comanda-mesas/${mesaId}`, {
      method: "PATCH",
      body: JSON.stringify({ label: label?.trim() || undefined })
    }),
  updateMesaStatus: (mesaId: string, status: ComandaMesaStatus) =>
    request<ComandaMesa>(`/pdv/comanda-mesas/${mesaId}/status`, {
      method: "POST",
      body: JSON.stringify({ status })
    }),
  regenerarQrMesa: (mesaId: string) =>
    request<ComandaMesa>(`/pdv/comanda-mesas/${mesaId}/qr/regenerar`, { method: "POST" })
};
