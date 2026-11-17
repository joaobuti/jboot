import { UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { AppConfigService } from '../../../config/app-config.service';
import { PlatformNotificationContext } from '../notifications.types';

interface TokenClaims {
  sub?: string;
  client_id?: string;
  application_id?: string;
  scopes?: string[];
  scope?: string;
  roles?: string[];
}

export async function verifyPlatformToken(config: AppConfigService, token: string): Promise<PlatformNotificationContext> {
  let claims: TokenClaims;
  try {
    const secret = new TextEncoder().encode(config.jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    claims = payload as TokenClaims;
  } catch {
    throw new UnauthorizedException('Invalid bearer token');
  }

  if (!claims.sub || !claims.client_id || !claims.application_id) {
    throw new UnauthorizedException('Missing required platform context');
  }

  const scopes = Array.isArray(claims.scopes)
    ? claims.scopes
    : typeof claims.scope === 'string'
      ? claims.scope.split(' ').filter(Boolean)
      : [];

  return {
    identityId: claims.sub,
    clientId: claims.client_id,
    applicationId: claims.application_id,
    scopes,
    roles: Array.isArray(claims.roles) ? claims.roles : []
  };
}
