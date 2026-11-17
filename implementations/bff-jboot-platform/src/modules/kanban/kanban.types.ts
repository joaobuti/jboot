export interface PageQuery {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
}

export interface PageResult<T> {
  data: T[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
}

export type BoardMemberRole = 'board_admin' | 'board_member' | 'board_viewer';

export interface KanbanRequestContext {
  identityId: string;
  clientId: string;
  applicationId: string;
  databaseRef: string;
  scopes: string[];
  roles: string[];
}

export interface MutateContext extends KanbanRequestContext {
  userAgent?: string;
  ip?: string;
}
