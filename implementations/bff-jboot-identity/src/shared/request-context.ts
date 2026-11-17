import { Request } from 'express';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export function getRequestContext(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.get('user-agent')
  };
}

