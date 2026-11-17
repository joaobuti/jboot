export interface AdminActor {
  identityId: string;
  sessionId?: string;
  roles: string[];
  scopes: string[];
}

export interface PageQuery {
  limit: number;
  offset: number;
  search?: string;
}

export interface MutateContext {
  actor: AdminActor;
  ip?: string;
  userAgent?: string;
}
