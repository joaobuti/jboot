export interface FiscalRequestContext {
  identityId: string;
  clientId: string;
  applicationId: string;
  databaseRef: string;
  scopes: string[];
  roles: string[];
}
