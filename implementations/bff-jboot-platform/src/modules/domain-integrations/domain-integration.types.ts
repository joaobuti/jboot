export interface DomainIntegrationRequestContext {
  identityId: string;
  clientId: string;
  applicationId: string;
  databaseRef: string;
  scopes: string[];
  roles: string[];
}

export type DomainApplicationSlug = 'juridico' | 'flow';

export interface ResolvedApplicationContext {
  identityId: string;
  clientId: string;
  applicationId: string;
  databaseRef: string;
  scopes: string[];
  roles: string[];
}

export type FlowDestinationContext = ResolvedApplicationContext;
