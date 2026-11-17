import { ForbiddenException, GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DestinationRecord } from '../auth/auth.types';
import { IdentityJwtService } from '../auth/jwt.service';
import { AppConfigService } from '../config/app-config.service';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthRepository } from './oauth.repository';
import { ConnectorIntrospection, GrantRecord, generateOpaqueToken, hashOpaqueToken } from './oauth.types';

interface FlowUser {
  identityId: string;
  destination: DestinationRecord;
}

export interface AuthorizationRequestView {
  id: string;
  /** Host da URL do client_id (CIMD): e quem pede acesso. O nome e autodeclarado. */
  clientHost: string;
  clientName: string;
  oauthClientId: string;
  redirectHost: string;
  loopbackRedirect: boolean;
  scopes: string[];
  expiresAt: string;
  tenantName: string;
}

export interface GrantView {
  id: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Lado do usuario JBoot do conector: consentimento, lista e revogacao das
 * proprias conexoes, mais a introspeccao s2s usada pelo resource server.
 * O usuario e sempre o do token Flow validado; nada vem do body.
 */
@Injectable()
export class OAuthConnectionsService {
  constructor(
    private readonly config: AppConfigService,
    private readonly jwt: IdentityJwtService,
    private readonly repository: OAuthRepository,
    private readonly provider: OAuthProviderService,
    private readonly audit: AuditService
  ) {}

  async getAuthorizationRequest(userToken: string, requestId: string): Promise<AuthorizationRequestView> {
    const user = await this.requireFlowUser(userToken);
    const request = await this.repository.findAuthorizationRequest(requestId);
    if (!request) {
      throw new NotFoundException({ code: 'oauth_request_not_found' });
    }
    if (request.decidedAt || new Date(request.expiresAt).getTime() <= Date.now()) {
      throw new GoneException({ code: 'oauth_request_expired' });
    }
    const redirect = new URL(request.redirectUri);
    return {
      id: request.id,
      clientHost: new URL(request.oauthClientId).host,
      clientName: request.clientName,
      oauthClientId: request.oauthClientId,
      redirectHost: redirect.host,
      loopbackRedirect: ['localhost', '127.0.0.1'].includes(redirect.hostname),
      scopes: request.scopes,
      expiresAt: new Date(request.expiresAt).toISOString(),
      tenantName: user.destination.clientName
    };
  }

  /** Consentimento ou recusa. Devolve a URL para onde o navegador deve seguir. */
  async decide(userToken: string, requestId: string, approve: boolean): Promise<{ redirectUrl: string }> {
    const user = await this.requireFlowUser(userToken);
    const result = await this.repository.transaction(async (db) => {
      const request = await this.repository.decideAuthorizationRequest(db, requestId);
      if (!request) {
        return null;
      }
      const redirect = new URL(request.redirectUri);
      if (request.state !== null) {
        redirect.searchParams.set('state', request.state);
      }
      // RFC 9207: o cliente confere de qual servidor veio a resposta.
      redirect.searchParams.set('iss', this.config.oauthIssuerUrl);
      if (!approve) {
        redirect.searchParams.set('error', 'access_denied');
        return { redirectUrl: redirect.href, grantId: null, request };
      }
      const grantId = await this.repository.createGrant(db, {
        identityId: user.identityId,
        clientId: user.destination.clientId,
        applicationId: user.destination.applicationId,
        oauthClientId: request.oauthClientId,
        clientName: request.clientName,
        scopes: request.scopes,
        resource: request.resource
      });
      const code = generateOpaqueToken();
      await this.repository.createAuthorizationCode(db, {
        codeHash: hashOpaqueToken(code),
        grantId,
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge,
        expiresAt: new Date(Date.now() + this.config.oauthAuthorizationCodeTtlSeconds * 1000)
      });
      redirect.searchParams.set('code', code);
      return { redirectUrl: redirect.href, grantId, request };
    });

    if (!result) {
      throw new GoneException({ code: 'oauth_request_expired' });
    }
    await this.audit.record({
      eventType: result.grantId ? 'oauth_grant_created' : 'oauth_consent_denied',
      identityId: user.identityId,
      clientId: user.destination.clientId,
      applicationId: user.destination.applicationId,
      metadata: {
        grantId: result.grantId,
        oauthClientId: result.request.oauthClientId,
        scopes: result.request.scopes
      }
    });
    return { redirectUrl: result.redirectUrl };
  }

  async listGrants(userToken: string): Promise<GrantView[]> {
    const user = await this.requireFlowUser(userToken);
    const grants = await this.repository.listActiveGrants(user.identityId, user.destination.clientId, user.destination.applicationId);
    return grants.map(toGrantView);
  }

  async revokeGrant(userToken: string, grantId: string): Promise<void> {
    const user = await this.requireFlowUser(userToken);
    const grant = await this.repository.findGrant(grantId);
    // Conexao de outro usuario/tenant/modulo e indistinguivel de inexistente.
    if (
      !grant ||
      grant.identityId !== user.identityId ||
      grant.clientId !== user.destination.clientId ||
      grant.applicationId !== user.destination.applicationId
    ) {
      throw new NotFoundException({ code: 'oauth_grant_not_found' });
    }
    await this.provider.revokeAndAudit(grant, 'user');
  }

  /** Introspeccao para o BFF da Platform; so o cliente s2s `platform-api`. */
  async introspect(serviceToken: string, token: string): Promise<ConnectorIntrospection> {
    const caller = await this.jwt.verifyServiceAccessToken(serviceToken, 'svc:identity-oauth');
    if (caller.clientId !== this.config.platformServiceClientId) {
      throw new ForbiddenException('Caller not allowed');
    }
    const grant = await this.repository.findGrantByAccessToken(hashOpaqueToken(token));
    if (!grant || new URL(grant.resource).href !== new URL(this.config.flowConnectorResourceUrl).href) {
      return { active: false };
    }
    const destination = await this.provider.findFlowDestination(grant.identityId, grant.clientId, grant.applicationId);
    if (!destination) {
      await this.provider.revokeAndAudit(grant, 'entitlement');
      return { active: false };
    }
    await this.repository.touchGrant(grant.id);
    return {
      active: true,
      sub: grant.identityId,
      scope: grant.scopes.join(' '),
      client_id: grant.oauthClientId,
      exp: Math.floor(new Date(grant.expiresAt).getTime() / 1000),
      aud: grant.resource,
      grant_id: grant.id,
      tenant_client_id: grant.clientId,
      application_id: grant.applicationId,
      database_ref: destination.databaseRefId,
      flow_scopes: destination.scopes,
      flow_roles: destination.roles
    };
  }

  private async requireFlowUser(userToken: string): Promise<FlowUser> {
    const payload = await this.jwt.verifyAccessToken(userToken);
    if (!payload.clientId || !payload.applicationId) {
      throw new UnauthorizedException('Flow session required');
    }
    const destination = await this.provider.findFlowDestination(payload.sub, payload.clientId, payload.applicationId);
    if (!destination) {
      throw new ForbiddenException({ code: 'oauth_flow_session_required' });
    }
    return { identityId: payload.sub, destination };
  }
}

function toGrantView(grant: GrantRecord): GrantView {
  return {
    id: grant.id,
    clientName: grant.clientName,
    scopes: grant.scopes,
    createdAt: new Date(grant.createdAt).toISOString(),
    lastUsedAt: grant.lastUsedAt ? new Date(grant.lastUsedAt).toISOString() : null
  };
}
