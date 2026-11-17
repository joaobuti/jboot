const API_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PDV_API_URL ??
  process.env.NEXT_PUBLIC_PDV_API_URL ??
  "http://localhost:8010";

export class ComandaSessionExpiredError extends Error {
  constructor() {
    super("Comanda session expired or comanda was closed");
    this.name = "ComandaSessionExpiredError";
  }
}

export type ComandaQueueType = "cozinha" | "bar";

export type ComandaItemStatus =
  | "pendente"
  | "em_producao"
  | "pronto"
  | "liberado_para_entrega"
  | "cancelado";

export interface ComandaSessionResult {
  token: string;
  clientId: string;
  comandaId: string;
  tableNumber: number;
  status: "aberta" | "fechada";
}

export interface ComandaItemView {
  id: string;
  productId: string;
  productName: string;
  unitPrice: string;
  quantity: string;
  queueType: ComandaQueueType;
  notes: string | null;
  status: ComandaItemStatus;
}

export interface ComandaMeView {
  clientId: string;
  comandaId: string;
  tableNumber: number;
  status: "aberta" | "fechada";
  pedidos: { id: string; submittedAt: string; itens: ComandaItemView[] }[];
  total: string;
}

export interface PublicMenuProduct {
  id: string;
  name: string;
  description: string | null;
  price: string;
  queueType: ComandaQueueType | null;
  imageUrl: string | null;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  products: PublicMenuProduct[];
}

export interface PublicMenuResponse {
  categories: PublicMenuCategory[];
  uncategorized: { name: string; products: PublicMenuProduct[] };
}

export interface CreatePedidoItemInput {
  productId: string;
  quantity: number;
  notes?: string;
}

async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  const response = await requestWithNetworkError(`${API_BASE}${path}`, { ...init, headers });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || `Comanda API error ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function sessionRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  const response = await requestWithNetworkError(`${API_BASE}${path}`, { ...init, headers });

  if (response.status === 401) {
    throw new ComandaSessionExpiredError();
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message || `Comanda API error ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function requestWithNetworkError(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Nao foi possivel conectar ao servidor da comanda.");
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return "";
  }
  try {
    const payload = JSON.parse(text) as { message?: unknown };
    if (Array.isArray(payload.message)) {
      return payload.message.join(" ");
    }
    if (typeof payload.message === "string") {
      return payload.message;
    }
  } catch {
    return text;
  }
  return text;
}

export const comandaPublicApi = {
  createSession: (qrToken: string, identity: { phone?: string; documentNumber?: string }) =>
    publicRequest<ComandaSessionResult>("/comanda/public/sessions", {
      method: "POST",
      body: JSON.stringify({ qrToken, ...identity })
    }),

  refreshSession: (token: string) =>
    sessionRequest<{ token: string }>(token, "/comanda/public/sessions/refresh", { method: "POST" }),

  getMe: (token: string) => sessionRequest<ComandaMeView>(token, "/comanda/public/me"),

  createPedido: (token: string, items: CreatePedidoItemInput[], idempotencyKey: string) =>
    sessionRequest<{ pedidoId: string; submittedAt: string; itens: ComandaItemView[] }>(
      token,
      "/comanda/public/pedidos",
      {
        method: "POST",
        body: JSON.stringify({ items }),
        headers: { "Idempotency-Key": idempotencyKey }
      }
    ),

  cancelItem: (token: string, itemId: string) =>
    sessionRequest<ComandaItemView>(token, `/comanda/public/itens/${itemId}`, { method: "DELETE" }),

  requestClosing: (token: string) =>
    sessionRequest<{ status: string; closingRequestedAt: string | null }>(token, "/comanda/public/fechamento", {
      method: "POST"
    }),

  getMenu: (clientId: string) => publicRequest<PublicMenuResponse>(`/catalog/public/menu/${clientId}`)
};
