import { UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { AppConfigService } from '../../../config/app-config.service';
import { KanbanRequestContext } from '../kanban.types';

interface TokenClaims {
  sub?: string;
  client_id?: string;
  application_id?: string;
  database_ref?: string;
  scopes?: string[];
  scope?: string;
  roles?: string[];
}

export async function verifyKanbanToken(config: AppConfigService, token: string): Promise<KanbanRequestContext> {
  let claims: TokenClaims;
  try {
    const secret = new TextEncoder().encode(config.jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    claims = payload as TokenClaims;
  } catch {
    throw new UnauthorizedException('Invalid bearer token');
  }

  if (!claims.sub || !claims.client_id || !claims.application_id || !claims.database_ref) {
    throw new UnauthorizedException('Missing required kanban context');
  }

  const scopes = Array.isArray(claims.scopes)
    ? claims.scopes
    : typeof claims.scope === 'string'
      ? claims.scope.split(' ').filter(Boolean)
      : [];

  if (!scopes.includes('flow:read')) {
    throw new UnauthorizedException('Insufficient flow scope');
  }

  return {
    identityId: claims.sub,
    clientId: claims.client_id,
    applicationId: claims.application_id,
    databaseRef: claims.database_ref,
    scopes,
    roles: Array.isArray(claims.roles) ? claims.roles : []
  };
}
