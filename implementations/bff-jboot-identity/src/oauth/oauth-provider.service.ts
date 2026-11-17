import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidScopeError, InvalidTargetError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { PoolClient } from 'pg';
import { AuditService } from '../audit/audit.service';
import { DestinationRecord } from '../auth/auth.types';
import { IdentityApplicationsCacheService } from '../auth/identity-applications-cache.service';
import { AppConfigService } from '../config/app-config.service';
import { CimdClientResolver } from './cimd-client.resolver';
import { OAuthRepository } from './oauth.repository';
import {
  FLOW_CONNECTOR_SCOPES,
  GrantRecord,
  GrantRevokedReason,
  OFFLINE_ACCESS_SCOPE,
  generateOpaqueToken,
  hashOpaqueToken
} from './oauth.types';

type Outcome<T> = { ok: true; value: T } | { ok: false; revoke?: { grant: GrantRecord; reason: GrantRevokedReason }; error: Error };

/**
 * Servidor OAuth 2.1 do conector Claude do Flow. Protocolo (PKCE S256,
 * redirect, formato de erro, parsing) fica com os handlers do SDK MCP; aqui
 * ficam armazenamento, vinculo com o Identity e regras de revogacao.
 */
@Injectable()
export class OAuthProviderService implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;

  constructor(
    private readonly config: AppConfigService,
    private readonly repository: OAuthRepository,
    private readonly resolver: CimdClientResolver,
    private readonly identityApplications: IdentityApplicationsCacheService,
    private readonly audit: AuditService
  ) {
    // Sem `registerClient`: o SDK nao expoe /register (DCR desligado).
    this.clientsStore = { getClient: (clientId: string) => this.resolver.resolve(clientId) };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const resource = this.resolveResource(params.resource);
    const scopes = this.resolveRequestedScopes(params.scopes);
    const requestId = await this.repository.createAuthorizationRequest({
      oauthClientId: client.client_id,
      clientName: client.client_name ?? client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes,
      state: params.state ?? null,
      resource,
      expiresAt: new Date(Date.now() + this.config.oauthAuthorizationRequestTtlSeconds * 1000)
    });
    const consent = new URL(this.config.oauthConsentUrl);
    consent.searchParams.set('request', requestId);
    res.redirect(302, consent.href);
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const code = await this.repository.findAuthorizationCode(hashOpaqueToken(authorizationCode));
    if (!code || code.grant.oauthClientId !== client.client_id) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    return code.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const codeHash = hashOpaqueToken(authorizationCode);
    const outcome = await this.repository.transaction<Outcome<OAuthTokens>>(async (db) => {
      const code = await this.repository.lockAuthorizationCode(db, codeHash);
      if (!code || code.grant.oauthClientId !== client.client_id) {
        return { ok: false, error: new InvalidGrantError('Invalid authorization code') };
      }
      if (code.consumedAt) {
        // Codigo reapresentado: revoga tudo que ele gerou (OAuth 2.1, 4.1.3).
        return { ok: false, revoke: { grant: code.grant, reason: 'code_reuse' }, error: new InvalidGrantError('Authorization code already used') };
      }
      if (new Date(code.expiresAt).getTime() <= Date.now() || code.grant.revokedAt) {
        return { ok: false, error: new InvalidGrantError('Authorization code expired') };
      }
      if (redirectUri !== undefined && redirectUri !== code.redirectUri) {
        return { ok: false, error: new InvalidGrantError('redirect_uri does not match the authorization request') };
      }
      if (resource && resource.href !== new URL(code.grant.resource).href) {
        return { ok: false, error: new InvalidTargetError('Resource does not match the authorization') };
      }
      await this.repository.markCodeConsumed(db, codeHash);
      return { ok: true, value: await this.issueTokens(db, code.grant) };
    });
    return this.settle(outcome);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const outcome = await this.repository.transaction<Outcome<OAuthTokens>>(async (db) => {
      const consumed = await this.repository.consumeRefreshToken(db, hashOpaqueToken(refreshToken));
      if (consumed.status === 'invalid' || consumed.grant.oauthClientId !== client.client_id) {
        return { ok: false, error: new InvalidGrantError('Invalid refresh token') };
      }
      if (consumed.status === 'reused') {
        return { ok: false, revoke: { grant: consumed.grant, reason: 'refresh_reuse' }, error: new InvalidGrantError('Refresh token already used') };
      }
      const grant = consumed.grant;
      if (resource && resource.href !== new URL(grant.resource).href) {
        return { ok: false, error: new InvalidTargetError('Resource does not match the authorization') };
      }
      const requested = (scopes ?? []).filter((scope) => scope !== OFFLINE_ACCESS_SCOPE);
      if (requested.some((scope) => !grant.scopes.includes(scope))) {
        return { ok: false, error: new InvalidScopeError('Requested scope exceeds the authorization') };
      }
      // Entitlement removido no Identity encerra a conexao no proximo refresh.
      if (!(await this.findFlowDestination(grant.identityId, grant.clientId, grant.applicationId))) {
        return { ok: false, revoke: { grant, reason: 'entitlement' }, error: new InvalidGrantError('Access to the application was removed') };
      }
      return { ok: true, value: await this.issueTokens(db, grant) };
    });
    return this.settle(outcome);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const grant = await this.repository.findGrantByAccessToken(hashOpaqueToken(token));
    if (!grant) {
      throw new InvalidTokenError('Invalid access token');
    }
    return {
      token,
      clientId: grant.oauthClientId,
      scopes: grant.scopes,
      expiresAt: Math.floor(new Date(grant.expiresAt).getTime() / 1000),
      resource: new URL(grant.resource)
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const grant = await this.repository.findGrantByAnyToken(hashOpaqueToken(request.token));
    if (grant && grant.oauthClientId === client.client_id) {
      await this.revokeAndAudit(grant, 'user');
    }
  }

  /** Destino Flow ainda contratado/permitido para o usuario no tenant. */
  async findFlowDestination(identityId: string, clientId: string, applicationId: string): Promise<DestinationRecord | null> {
    const destinations = await this.identityApplications.listDestinations(identityId);
    return destinations.find((destination) =>
      destination.clientId === clientId &&
      destination.applicationId === applicationId &&
      destination.applicationSlug === this.config.flowConnectorApplicationSlug
    ) ?? null;
  }

  async revokeAndAudit(grant: GrantRecord, reason: GrantRevokedReason): Promise<void> {
    if (await this.repository.revokeGrant(grant.id, reason)) {
      await this.audit.record({
        eventType: 'oauth_grant_revoked',
        identityId: grant.identityId,
        clientId: grant.clientId,
        applicationId: grant.applicationId,
        metadata: { grantId: grant.id, reason, oauthClientId: grant.oauthClientId }
      });
    }
  }

  private async settle<T>(outcome: Outcome<T>): Promise<T> {
    if (outcome.ok) {
      return outcome.value;
    }
    // Revogacao fora da transacao: o erro abaixo nao pode desfaze-la.
    if (outcome.revoke) {
      await this.revokeAndAudit(outcome.revoke.grant, outcome.revoke.reason);
    }
    throw outcome.error;
  }

  private async issueTokens(db: PoolClient, grant: GrantRecord): Promise<OAuthTokens> {
    const accessToken = generateOpaqueToken();
    const refreshToken = generateOpaqueToken();
    const now = Date.now();
    await this.repository.insertToken(db, {
      tokenHash: hashOpaqueToken(accessToken),
      grantId: grant.id,
      tokenType: 'access',
      expiresAt: new Date(now + this.config.oauthAccessTokenTtlSeconds * 1000)
    });
    await this.repository.insertToken(db, {
      tokenHash: hashOpaqueToken(refreshToken),
      grantId: grant.id,
      tokenType: 'refresh',
      expiresAt: new Date(now + this.config.oauthRefreshTokenTtlSeconds * 1000)
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.config.oauthAccessTokenTtlSeconds,
      refresh_token: refreshToken,
      scope: grant.scopes.join(' ')
    };
  }

  private resolveResource(resource?: URL): string {
    const expected = new URL(this.config.flowConnectorResourceUrl).href;
    if (resource && resource.href !== expected) {
      throw new InvalidTargetError('Unknown resource');
    }
    return expected;
  }

  private resolveRequestedScopes(requested: string[] | undefined): string[] {
    const scopes = (requested ?? []).filter((scope) => scope && scope !== OFFLINE_ACCESS_SCOPE);
    if (scopes.length === 0) {
      return [...FLOW_CONNECTOR_SCOPES];
    }
    if (scopes.some((scope) => !(FLOW_CONNECTOR_SCOPES as readonly string[]).includes(scope))) {
      throw new InvalidScopeError('Unsupported scope');
    }
    return [...new Set(scopes)];
  }
}
