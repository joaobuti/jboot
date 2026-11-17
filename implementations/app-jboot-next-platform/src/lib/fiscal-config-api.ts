"use client";

import { getApplicationAuthToken } from "@/lib/module-auth-token";

const API_BASE =
  process.env.NEXT_PUBLIC_JBOOT_PDV_API_URL ??
  process.env.NEXT_PUBLIC_PDV_API_URL ??
  "http://localhost:8010";

export interface FiscalConfig {
  id: string;
  cnpjEmitente: string;
  ambiente: "homologacao" | "producao";
  serieNfce: number;
  serieNfe: number;
  razaoSocial: string;
  nomeFantasia: string | null;
  inscricaoEstadual: string;
  telefone: string | null;
  email: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoMunicipio: string;
  cscConfigured: boolean;
  cscId: string | null;
  regimeFiscal: string;
  cfopPadraoNfce: string | null;
  cfopPadraoNfe: string | null;
  icmsOrigemPadrao: number | null;
  icmsCstPadrao: string | null;
  icmsAliquotaPadrao: number | null;
  pisCstPadrao: string | null;
  pisAliquotaPadrao: number | null;
  cofinsCstPadrao: string | null;
  cofinsAliquotaPadrao: number | null;
}

export interface UpsertFiscalConfigPayload {
  cnpjEmitente: string;
  ambiente: "homologacao" | "producao";
  serieNfce: number;
  serieNfe: number;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoEstadual: string;
  telefone?: string;
  email?: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  codigoMunicipio: string;
  csc?: string;
  cscId?: string;
  regimeFiscal: string;
  cfopPadraoNfce?: string;
  cfopPadraoNfe?: string;
  icmsOrigemPadrao?: number;
  icmsCstPadrao?: string;
  icmsAliquotaPadrao?: number;
  pisCstPadrao?: string;
  pisAliquotaPadrao?: number;
  cofinsCstPadrao?: string;
  cofinsAliquotaPadrao?: number;
}

export interface UploadFiscalCertificatePayload {
  cnpjEmitente: string;
  ambiente: "homologacao" | "producao";
  pfxBase64: string;
  pfxPassword: string;
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

  if (response.status === 404) return null as T;

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Fiscal API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const fiscalConfigApi = {
  list: () => request<FiscalConfig[]>("/fiscal/config"),
  get: (cnpjEmitente: string) =>
    request<FiscalConfig | null>(`/fiscal/config?cnpj_emitente=${encodeURIComponent(cnpjEmitente)}`),
  upsert: (payload: UpsertFiscalConfigPayload) =>
    request<FiscalConfig>("/fiscal/config", { method: "PUT", body: JSON.stringify(payload) }),
  uploadCertificate: (payload: UploadFiscalCertificatePayload) =>
    request<unknown>("/fiscal/certificados", { method: "POST", body: JSON.stringify(payload) })
};
