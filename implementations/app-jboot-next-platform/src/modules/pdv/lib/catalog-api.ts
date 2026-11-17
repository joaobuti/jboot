"use client";

import { getApplicationAuthToken } from "@/lib/module-auth-token";

const API_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PDV_API_URL ??
  process.env.NEXT_PUBLIC_PDV_API_URL ??
  "http://localhost:8010";

export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

export interface PageResult<T> {
  data: T[];
  meta: PageMeta;
}

export interface CatalogCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  visibleInComanda: boolean;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProduct {
  id: string;
  categoryId: string | null;
  sku: string | null;
  barcode: string | null;
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  gtin: string | null;
  name: string;
  description: string | null;
  unit: string;
  salePrice: string;
  costPrice: string | null;
  trackInventory: boolean;
  visibleInPdv: boolean;
  visibleInCardapio: boolean;
  visibleInComanda: boolean;
  /** Fila de preparo. Obrigatorio no backend quando visibleInComanda=true. */
  queueType: "cozinha" | "bar" | null;
  imageFileId: string | null;
  imageUrl: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export type CatalogPayload = Record<string, string | boolean | null | undefined>;

export interface ProductInitialStock {
  locationId: string;
  quantity: string;
}

function getAuthToken(): string | null {
  return getApplicationAuthToken("app:pdv", "pdvAccessToken");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Catalog API error ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Catalog API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const q = search.toString();
  return q ? `?${q}` : "";
}

export const catalogApi = {
  categories: {
    list: (params: { limit?: number; offset?: number; search?: string; status?: string } = {}) =>
      request<PageResult<CatalogCategory>>(`/catalog/categories${query({ limit: 20, offset: 0, ...params })}`),
    create: (payload: CatalogPayload) =>
      request<CatalogCategory>("/catalog/categories", { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: CatalogPayload) =>
      request<CatalogCategory>(`/catalog/categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (id: string) =>
      request<void>(`/catalog/categories/${id}`, { method: "DELETE" })
  },
  products: {
    list: (params: {
      limit?: number;
      offset?: number;
      search?: string;
      status?: string;
      visibleInPdv?: boolean;
      visibleInCardapio?: boolean;
      visibleInComanda?: boolean;
    } = {}) =>
      request<PageResult<CatalogProduct>>(`/catalog/products${query({ limit: 20, offset: 0, ...params })}`),
    create: (payload: CatalogPayload, initialStock?: ProductInitialStock[]) =>
      request<CatalogProduct>("/catalog/products", {
        method: "POST",
        body: JSON.stringify(initialStock?.length ? { ...payload, initialStock } : payload)
      }),
    update: (id: string, payload: CatalogPayload) =>
      request<CatalogProduct>(`/catalog/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    uploadImage: (id: string, file: File) => {
      const formData = new FormData();
      formData.set("file", file);
      return upload<CatalogProduct>(`/catalog/products/${id}/image`, formData);
    },
    remove: (id: string) =>
      request<void>(`/catalog/products/${id}`, { method: "DELETE" })
  }
};
