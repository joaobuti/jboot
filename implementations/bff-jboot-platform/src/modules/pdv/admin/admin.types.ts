export interface PageQuery {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
}

export interface PdvRequestContext {
  identityId: string;
  clientId: string;
  applicationId: string;
  databaseRef: string;
  locationId?: string;
  scopes: string[];
  roles: string[];
}

export interface MutateContext extends PdvRequestContext {
  userAgent?: string;
  ip?: string;
}

export interface PageResult<T> {
  data: T[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
}
