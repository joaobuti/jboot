export interface IdentityRecord {
  id: string;
  documentType: 'cpf' | 'cnpj';
  documentNumber: string;
  displayName: string;
  status: string;
}

export interface CredentialRecord {
  identityId: string;
  secretHash: string | null;
}

export interface DestinationRecord {
  clientApplicationId: string;
  clientId: string;
  clientName: string;
  clientType: string;
  contractStatus: 'active' | 'trial';
  planCode: string | null;
  applicationId: string;
  applicationSlug: string;
  applicationName: string;
  tokenAudience: string;
  launchUrl: string | null;
  databaseRefId: string;
  databaseStrategy: string;
  databaseName: string;
  schemaName: string | null;
  scopes: string[];
  roles: string[];
  moduleAttributes: Record<string, unknown>;
}

export interface IdentityApplicationsCacheEntry {
  identityId: string;
  permissionsVersion: number;
  destinations: DestinationRecord[];
  cachedAt: string;
}

export interface IssuedContext {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  context: {
    sessionId: string;
    clientId: string;
    clientApplicationId: string;
    applicationId: string;
    databaseRefId: string;
    applicationSlug: string;
    contractStatus: 'active' | 'trial';
    planCode: string | null;
    roles: string[];
    scopes: string[];
  };
}

export interface LoginTicketPayload {
  sub: string;
  typ: 'login_ticket';
}
