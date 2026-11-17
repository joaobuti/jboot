import { createHash, randomBytes } from 'node:crypto';

/** Scopes do conector Claude do Flow; nao confundir com os scopes `flow:*` do usuario. */
export const FLOW_CONNECTOR_SCOPES = ['flow:connector:read', 'flow:connector:comment'] as const;
export type FlowConnectorScope = (typeof FLOW_CONNECTOR_SCOPES)[number];

/** Pedido pelo Claude para obter refresh token; aceito e nunca gravado na conexao. */
export const OFFLINE_ACCESS_SCOPE = 'offline_access';

export type GrantRevokedReason = 'user' | 'refresh_reuse' | 'code_reuse' | 'entitlement';

export interface AuthorizationRequestRecord {
  id: string;
  oauthClientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  state: string | null;
  resource: string;
  expiresAt: Date;
  decidedAt: Date | null;
}

export interface GrantRecord {
  id: string;
  identityId: string;
  clientId: string;
  applicationId: string;
  oauthClientId: string;
  clientName: string;
  scopes: string[];
  resource: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/** Introspeccao consumida pelo BFF da Platform (resource server do conector). */
export interface ConnectorIntrospection {
  active: boolean;
  sub?: string;
  scope?: string;
  client_id?: string;
  exp?: number;
  aud?: string;
  grant_id?: string;
  tenant_client_id?: string;
  application_id?: string;
  database_ref?: string;
  flow_scopes?: string[];
  flow_roles?: string[];
}

/** Codigo/token opaco: 256 bits aleatorios; so o hash vai para o banco. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOpaqueToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
