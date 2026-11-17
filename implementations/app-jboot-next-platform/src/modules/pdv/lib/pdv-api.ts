"use client";

import { getApplicationAuthToken } from "@/lib/module-auth-token";

const API_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PDV_API_URL ??
  process.env.NEXT_PUBLIC_PDV_API_URL ??
  "http://localhost:8010";

export type PdvStatus = "active" | "inactive";

export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

export interface PageResult<T> {
  data: T[];
  meta: PageMeta;
}

export interface PdvCustomer {
  id: string;
  name: string;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressIbgeCode: string | null;
  ie: string | null;
  indIeDest: number;
  status: PdvStatus;
}

export interface PdvStockLocation {
  id: string;
  name: string;
  type: "store" | "warehouse" | "virtual";
  isMatriz: boolean;
  cnpj: string | null;
  ie: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressIbgeCode: string | null;
  status: PdvStatus;
}

export interface PdvStockTransfer {
  id: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  productId: string;
  productName: string;
  quantity: string;
  notes: string | null;
  transferredAt: string;
}

export interface PdvInventoryBalance {
  productId: string;
  locationId: string;
  quantity: string;
  reservedQuantity: string;
  updatedAt: string;
}

export interface PdvInventoryImport {
  id: string;
  locationId: string;
  status:
    "pending" | "processing" | "processed" | "processed_with_errors" | "failed";
  fileName: string | null;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  createdAt: string;
  processedAt: string | null;
}

export interface PdvCashier {
  id: string;
  clientId: string;
  operatorId: string;
  status: "open" | "closed";
  openingBalance: string;
  closingBalance: string | null;
  expectedClosingBalance: string | null;
  countedBalance: string | null;
  closingDifference: string | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
}

export interface CashierMovement {
  id: string;
  cashierId: string;
  operatorId: string;
  type: "sangria" | "suprimento";
  amount: string;
  reason: string;
  occurredAt: string;
}

export interface CashierSummary {
  salesCount: number;
  totalCollected: string;
  openingBalance: string;
  movementTotal: string;
  expectedClosingBalance: string;
  countedBalance: string | null;
  closingDifference: string | null;
  byMethod: { paymentMethod: string; amount: string }[];
  movements: CashierMovement[];
}

export type PaymentMethod =
  "dinheiro" | "cartao_credito" | "cartao_debito" | "pix" | "outro";

export interface PdvSaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  total: string;
}

export interface PdvSalePayment {
  id: string;
  saleId: string;
  paymentMethod: PaymentMethod;
  amount: string;
  status: string;
  externalRef?: string | null;
}

export interface IntegratedPixPayment {
  chargeId: string;
  status:
    | "created"
    | "awaiting_payment"
    | "verification_pending"
    | "received"
    | "pending_reconciliation"
    | "creation_outcome_unknown"
    | "failed"
    | "cancelled";
  checkoutUrl?: string;
  payment: PdvSalePayment | null;
}

export interface PaymentsProviderConnection {
  provider: "infinitepay";
  publicIdentifier: string;
  status: "unverified" | "verified" | "disabled";
  verifiedAt: string | null;
  updatedAt: string;
}

export interface PaymentRefund {
  id: string;
  chargeId: string;
  amountMinor: number;
  status: "requested" | "succeeded" | "failed";
  reason: string;
  operatorIdentityId: string;
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PixReconciliationItem {
  chargeId: string;
  merchantReference: string;
  amountMinor: number;
  status:
    | "verification_pending"
    | "pending_reconciliation"
    | "creation_outcome_unknown";
  verificationAttempts: number;
  nextVerificationAt?: string;
  lastVerificationAt?: string;
  lastVerificationError?: string;
  createdAt: string;
}

export interface PdvSale {
  id: string;
  saleNumber: number;
  clientId: string;
  operatorId: string;
  cashierId: string | null;
  status:
    "open" | "completed" | "cancelled" | "fiscal_pending" | "fiscal_error";
  subtotal: string;
  discount: string;
  total: string;
  createdAt: string;
  updatedAt: string;
  items?: PdvSaleItem[];
  payments?: PdvSalePayment[];
}

export interface FiscalConfig {
  id: string;
  clientId: string;
  cnpjEmitente: string;
  razaoSocial: string;
  uf: string;
  crt: number;
  addressLogradouro: string;
  addressNumero: string;
  addressBairro: string;
  addressMunicipio: string;
  addressUf: string;
  addressCep: string;
  addressCodigoMunicipio: string;
}

export interface NfResult {
  status: "authorized" | "contingency" | "failed";
  chaveAcesso?: string;
  protocolo?: string;
  errorMessage?: string;
}

export interface PdvSaleWithNf extends PdvSale {
  items: PdvSaleItem[];
  payments: PdvSalePayment[];
  fiscal: NfResult;
}

export interface ComandaCustomerSuggestion {
  comandaId: string;
  name: string;
  documentNumber: string | null;
  phone: string | null;
  address: {
    zip: string;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    ibgeCode: string;
  } | null;
}

export type PdvPayload = Record<string, string | boolean | null | undefined>;

export type DashboardPeriod = "today" | "week" | "month";

export interface DashboardTopProduct {
  productId: string;
  productName: string;
  quantitySold: string;
  revenue: string;
}

export interface DashboardPaymentMethod {
  method: string;
  amount: string;
  count: number;
}

export interface DashboardData {
  period: DashboardPeriod;
  locationId: string | null;
  revenue: string;
  salesCount: number;
  averageTicket: string;
  topProducts: DashboardTopProduct[];
  paymentMethods: DashboardPaymentMethod[];
  fiscalErrors: number;
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
    headers,
  });

  if (!response.ok) {
    const raw = await response.text();
    try {
      const problem = JSON.parse(raw) as {
        title?: string;
        code?: string;
        requestId?: string;
      };
      const error = new Error(
        problem.title || `PDV API error ${response.status}`,
      ) as Error & {
        status: number;
        code?: string;
        requestId?: string;
      };
      error.status = response.status;
      error.code = problem.code;
      error.requestId = problem.requestId;
      throw error;
    } catch (error) {
      if (error instanceof Error && "status" in error) throw error;
      throw new Error(`PDV API error ${response.status}`);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

function crud<T>(basePath: string) {
  return {
    list: (
      params: {
        limit?: number;
        offset?: number;
        search?: string;
        status?: string;
      } = {},
    ) =>
      request<PageResult<T>>(
        `${basePath}${query({ limit: 20, offset: 0, ...params })}`,
      ),
    create: (payload: PdvPayload) =>
      request<T>(basePath, { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: PdvPayload) =>
      request<T>(`${basePath}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    remove: (id: string) =>
      request<void>(`${basePath}/${id}`, { method: "DELETE" }),
  };
}

export const pdvApi = {
  cashier: {
    open: (payload: { openingBalance: number; notes?: string }) =>
      request<PdvCashier>("/pdv/cashiers/open", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    current: () => request<PdvCashier[]>("/pdv/cashiers/current"),
    summary: (id: string) =>
      request<CashierSummary>(`/pdv/cashiers/${id}/summary`),
    close: (id: string, payload: { countedBalance: number; notes?: string }) =>
      request<PdvCashier>(`/pdv/cashiers/${id}/close`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    movement: (
      id: string,
      payload: {
        type: "sangria" | "suprimento";
        amount: number;
        reason: string;
      },
    ) =>
      request<CashierMovement>(`/pdv/cashiers/${id}/movements`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },
  sales: {
    list: (params: { limit?: number; offset?: number; status?: string } = {}) =>
      request<PageResult<PdvSale>>(
        `/pdv/sales${query({ limit: 20, offset: 0, ...params })}`,
      ),
    create: (cashierId?: string) =>
      request<PdvSale>("/pdv/sales", {
        method: "POST",
        body: JSON.stringify({ cashierId }),
      }),
    get: (id: string) =>
      request<PdvSale & { items: PdvSaleItem[]; payments: PdvSalePayment[] }>(
        `/pdv/sales/${id}`,
      ),
    comandaCustomer: (id: string) =>
      request<ComandaCustomerSuggestion | null>(
        `/pdv/sales/${id}/comanda-customer`,
      ),
    addItem: (
      saleId: string,
      payload: {
        productId: string;
        quantity: number;
        unitPrice: number;
        discount?: number;
      },
    ) =>
      request<PdvSaleItem>(`/pdv/sales/${saleId}/items`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    removeItem: (saleId: string, itemId: string) =>
      request<void>(`/pdv/sales/${saleId}/items/${itemId}`, {
        method: "DELETE",
      }),
    updateItem: (
      saleId: string,
      itemId: string,
      payload: { quantity: number },
    ) =>
      request<PdvSaleItem>(`/pdv/sales/${saleId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    addPayment: (
      saleId: string,
      payload: { paymentMethod: PaymentMethod; amount: number },
    ) =>
      request<PdvSalePayment>(`/pdv/sales/${saleId}/payments`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    initiatePix: (saleId: string, amount: number) =>
      request<IntegratedPixPayment>(`/pdv/sales/${saleId}/payments/pix`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      }),
    verifyPix: (saleId: string, chargeId: string) =>
      request<IntegratedPixPayment>(
        `/pdv/sales/${saleId}/payments/pix/${chargeId}`,
      ),
    applyDiscount: (
      saleId: string,
      payload: { discountType: "value" | "percent"; amount: number },
    ) =>
      request<PdvSale>(`/pdv/sales/${saleId}/discount`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    complete: (saleId: string) =>
      request<PdvSale>(`/pdv/sales/${saleId}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    emitNf: (
      saleId: string,
      payload: {
        nfType: "nfce" | "nfe";
        cpfConsumidor?: string;
        destinatario?: {
          cnpj?: string;
          cpf?: string;
          razaoSocial: string;
          endereco?: {
            logradouro: string;
            numero: string;
            bairro: string;
            municipio: string;
            uf: string;
            cep: string;
            codigoMunicipio: string;
          };
        };
      },
    ) =>
      request<PdvSaleWithNf>(`/pdv/sales/${saleId}/emit-nf`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    cancel: (saleId: string, payload: { reason?: string } = {}) =>
      request<void>(`/pdv/sales/${saleId}/cancel`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },
  payments: {
    getConnection: () =>
      request<PaymentsProviderConnection>("/pdv/payments/provider-connection"),
    configureConnection: (payload: {
      publicIdentifier: string;
      secretRef?: string;
      validationConfirmed: true;
    }) =>
      request<PaymentsProviderConnection>("/pdv/payments/provider-connection", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    listRefunds: () =>
      request<{ data: PaymentRefund[] }>("/pdv/payments/refunds"),
    listReconciliation: () =>
      request<{ data: PixReconciliationItem[] }>(
        "/pdv/payments/reconciliation",
      ),
    requestRefund: (payload: {
      chargeId: string;
      amountMinor: number;
      reason: string;
      idempotencyKey: string;
    }) =>
      request<PaymentRefund>("/pdv/payments/refunds", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    completeRefund: (
      refundId: string,
      payload: { succeeded: boolean; resolutionNote: string },
    ) =>
      request<PaymentRefund>(
        `/pdv/payments/refunds/${encodeURIComponent(refundId)}/complete`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
  },
  fiscalConfig: {
    get: () => request<FiscalConfig | null>("/pdv/fiscal-config"),
    set: (payload: Omit<FiscalConfig, "id" | "clientId">) =>
      request<FiscalConfig>("/pdv/fiscal-config", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
  },
  customers: crud<PdvCustomer>("/pdv/admin/customers"),
  stockLocations: {
    list: () =>
      request<PageResult<PdvStockLocation>>("/pdv/admin/stock-locations"),
    create: (payload: PdvPayload) =>
      request<PdvStockLocation>("/pdv/admin/stock-locations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: PdvPayload) =>
      request<PdvStockLocation>(`/pdv/admin/stock-locations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },
  stockTransfers: {
    list: (
      params: {
        limit?: number;
        offset?: number;
        productId?: string;
        fromLocationId?: string;
        toLocationId?: string;
      } = {},
    ) =>
      request<PageResult<PdvStockTransfer>>(
        `/pdv/admin/stock-transfers${query({ limit: 20, offset: 0, ...params })}`,
      ),
    create: (payload: {
      fromLocationId: string;
      toLocationId: string;
      productId: string;
      quantity: string;
      notes?: string;
    }) =>
      request<PdvStockTransfer>("/pdv/admin/stock-transfers", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },
  inventoryBalances: {
    list: (
      params: {
        limit?: number;
        offset?: number;
        productId?: string;
        locationId?: string;
      } = {},
    ) =>
      request<PageResult<PdvInventoryBalance>>(
        `/pdv/admin/inventory-balances${query({ limit: 20, offset: 0, ...params })}`,
      ),
  },
  inventoryAdjustments: {
    create: (payload: {
      productId: string;
      locationId: string;
      type: "adjustment_in" | "adjustment_out";
      quantity: string;
      reason?: string;
    }) =>
      request<void>("/pdv/admin/inventory-adjustments", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },
  inventoryImports: {
    list: (params: { limit?: number; offset?: number } = {}) =>
      request<PageResult<PdvInventoryImport>>(
        `/pdv/admin/inventory-imports${query({ limit: 20, offset: 0, ...params })}`,
      ),
  },
  dashboard: {
    get: (params: { period?: DashboardPeriod; locationId?: string } = {}) =>
      request<DashboardData>(
        `/pdv/admin/dashboard${query({ period: params.period ?? "today", locationId: params.locationId })}`,
      ),
  },
};
