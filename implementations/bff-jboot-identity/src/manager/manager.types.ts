export interface ManagerActor {
  identityId: string;
  sessionId?: string;
  clientId: string;
  applicationId: string;
  locationId?: string;
  roles: string[];
  scopes: string[];
}
