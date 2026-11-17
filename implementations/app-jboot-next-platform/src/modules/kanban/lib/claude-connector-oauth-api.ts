"use client";

import { getIdentityApiUrl } from "@/lib/identity-applications";
import { getKanbanAuthToken, KanbanApiError } from "./kanban-api";

/**
 * Lado do usuario do conector Claude no Identity: consentimento OAuth e as
 * conexoes do proprio usuario. Usa o token Flow; o Identity deriva usuario,
 * tenant e modulo dele, nunca do corpo.
 */
export interface ClaudeAuthorizationRequestDto {
  id: string;
  clientHost: string;
  clientName: string;
  oauthClientId: string;
  redirectHost: string;
  loopbackRedirect: boolean;
  scopes: string[];
  expiresAt: string;
  tenantName: string;
}

export interface ClaudeConnectionDto {
  id: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

async function identityRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getKanbanAuthToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${getIdentityApiUrl()}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new KanbanApiError(response.status, await response.text().catch(() => ""));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const claudeConnectorOAuthApi = {
  getAuthorizationRequest: (requestId: string) =>
    identityRequest<ClaudeAuthorizationRequestDto>(`/oauth/requests/${encodeURIComponent(requestId)}`),
  decide: (requestId: string, approve: boolean) =>
    identityRequest<{ redirectUrl: string }>(`/oauth/requests/${encodeURIComponent(requestId)}/decision`, {
      method: "POST",
      body: JSON.stringify({ approve }),
    }),
  listConnections: () => identityRequest<{ data: ClaudeConnectionDto[] }>("/oauth/grants"),
  revokeConnection: (grantId: string) =>
    identityRequest<void>(`/oauth/grants/${encodeURIComponent(grantId)}`, { method: "DELETE" }),
};

export const CLAUDE_CONNECTOR_SCOPE_LABELS: Record<string, string> = {
  "flow:connector:read": "Ler quadros, cards e histórico que você já vê no Flow",
  "flow:connector:comment": "Comentar em cards em seu nome",
};
