import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { FiscalRequestContext } from './fiscal.types';

export interface FiscalRequest extends Request {
  fiscalContext: FiscalRequestContext;
}

interface TokenClaims {
  sub?: string;
  client_id?: string;
  application_id?: string;
  database_ref?: string;
  scopes?: string[];
  scope?: string;
  roles?: string[];
}

@Injectable()
export class FiscalAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FiscalRequest>();
    const token = this.extractBearerToken(request);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const claims = await this.verify(token);
    if (!claims.sub || !claims.client_id || !claims.application_id || !claims.database_ref) {
      throw new UnauthorizedException('Missing required token context');
    }

    const scopes = Array.isArray(claims.scopes)
      ? claims.scopes
      : typeof claims.scope === 'string'
        ? claims.scope.split(' ').filter(Boolean)
        : [];

    request.fiscalContext = {
      identityId: claims.sub,
      clientId: claims.client_id,
      applicationId: claims.application_id,
      databaseRef: claims.database_ref,
      scopes,
      roles: Array.isArray(claims.roles) ? claims.roles : []
    };

    return true;
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null;
  }

  private async verify(token: string): Promise<TokenClaims> {
    try {
      const secret = new TextEncoder().encode(this.config.jwtSecret);
      const { payload } = await jwtVerify(token, secret);
      return payload as TokenClaims;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}
