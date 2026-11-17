import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { AppConfigService } from '../config/app-config.service';
import { DestinationRecord, LoginTicketPayload } from './auth.types';

@Injectable()
export class IdentityJwtService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: AppConfigService) {
    this.secret = new TextEncoder().encode(config.jwtSecret);
  }

  async issueLoginTicket(identityId: string): Promise<string> {
    return new SignJWT({ typ: 'login_ticket' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.config.issuer)
      .setSubject(identityId)
      .setAudience('jboot-login-selection')
      .setIssuedAt()
      .setExpirationTime(`${this.config.loginTicketTtlSeconds}s`)
      .sign(this.secret);
  }

  async verifyLoginTicket(token: string): Promise<LoginTicketPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.config.issuer,
        audience: 'jboot-login-selection'
      });
      if (payload.typ !== 'login_ticket' || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid login ticket');
      }
      return { sub: payload.sub, typ: 'login_ticket' };
    } catch {
      throw new UnauthorizedException('Invalid login ticket');
    }
  }

  async verifyAccessToken(token: string): Promise<{
    sub: string;
    sid?: string;
    clientId?: string;
    applicationId?: string;
    locationId?: string;
    roles: string[];
    scopes: string[];
  }> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.config.issuer
      });
      if (typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid access token');
      }
      return {
        sub: payload.sub,
        sid: typeof payload.sid === 'string' ? payload.sid : undefined,
        clientId: typeof payload.client_id === 'string' ? payload.client_id : undefined,
        applicationId: typeof payload.application_id === 'string' ? payload.application_id : undefined,
        locationId: typeof payload.location_id === 'string' ? payload.location_id : undefined,
        roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
        scopes: Array.isArray(payload.scopes) ? payload.scopes.map(String) : []
      };
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  async issueAccessToken(params: {
    sessionId: string;
    jwtId: string;
    identityId: string;
    destination: DestinationRecord;
  }): Promise<string> {
    const destination = params.destination;
    const locationId = typeof destination.moduleAttributes?.location_id === 'string'
      ? destination.moduleAttributes.location_id
      : undefined;
    return new SignJWT({
      sid: params.sessionId,
      client_id: destination.clientId,
      application_id: destination.applicationId,
      database_ref: destination.databaseRefId,
      client_application_id: destination.clientApplicationId,
      contract_status: destination.contractStatus,
      plan_code: destination.planCode,
      scopes: destination.scopes,
      roles: destination.roles,
      ...(locationId ? { location_id: locationId } : {})
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.config.issuer)
      .setSubject(params.identityId)
      .setAudience(destination.tokenAudience)
      .setJti(params.jwtId)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenTtlSeconds}s`)
      .sign(this.secret);
  }

  /** Token s2s emitido por `issueServiceAccessToken`, so para a audience pedida. */
  async verifyServiceAccessToken(token: string, audience: string): Promise<{ clientId: string }> {
    try {
      const { payload } = await jwtVerify(token, this.secret, { issuer: this.config.issuer, audience });
      if (payload.typ !== 'service_access' || typeof payload.client_id !== 'string' || payload.sub !== payload.client_id) {
        throw new UnauthorizedException('Invalid service token');
      }
      return { clientId: payload.client_id };
    } catch {
      throw new UnauthorizedException('Invalid service token');
    }
  }

  async issueServiceAccessToken(clientId: string, audience: string): Promise<string> {
    return new SignJWT({ typ: 'service_access', client_id: clientId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.config.issuer)
      .setSubject(clientId)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${this.config.serviceAccessTokenTtlSeconds}s`)
      .sign(this.secret);
  }
}
