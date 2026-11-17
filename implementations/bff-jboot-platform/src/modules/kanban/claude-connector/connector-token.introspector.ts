import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { KanbanRequestContext } from '../kanban.types';

export const CONNECTOR_READ_SCOPE = 'flow:connector:read';
export const CONNECTOR_COMMENT_SCOPE = 'flow:connector:comment';

/** Quem chama o conector: o usuario Flow que consentiu, com os scopes da conexao. */
export interface ConnectorPrincipal {
  context: KanbanRequestContext;
  grantId: string;
  connectorScopes: string[];
}

interface IntrospectionResponse {
  active: boolean;
  sub?: string;
  scope?: string;
  aud?: string;
  grant_id?: string;
  tenant_client_id?: string;
  application_id?: string;
  database_ref?: string;
  flow_scopes?: string[];
  flow_roles?: string[];
}

export class ConnectorAuthUnavailableError extends Error {}

/**
 * Valida o token opaco do conector no Identity (introspeccao a cada chamada).
 * Sem cache: revogacao e remocao de entitlement valem na proxima tool call.
 * O token do conector nunca e um JWT, logo nao passa nos guards REST do Flow.
 */
@Injectable()
export class ConnectorTokenIntrospector {
  private readonly logger = new Logger(ConnectorTokenIntrospector.name);
  private serviceToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: AppConfigService) {}

  async introspect(token: string): Promise<ConnectorPrincipal | null> {
    const response = await this.post('/oauth/introspect', { token });
    const body = response as IntrospectionResponse;
    if (
      !body.active ||
      body.aud !== this.config.flowConnectorResourceUrl ||
      !body.sub || !body.grant_id || !body.tenant_client_id || !body.application_id || !body.database_ref
    ) {
      return null;
    }
    const flowScopes = body.flow_scopes ?? [];
    if (!flowScopes.includes('flow:read')) {
      return null;
    }
    return {
      grantId: body.grant_id,
      connectorScopes: (body.scope ?? '').split(' ').filter(Boolean),
      context: {
        identityId: body.sub,
        clientId: body.tenant_client_id,
        applicationId: body.application_id,
        databaseRef: body.database_ref,
        scopes: flowScopes,
        roles: body.flow_roles ?? []
      }
    };
  }

  private async post(path: string, payload: unknown, retried = false): Promise<unknown> {
    const serviceToken = await this.getServiceToken();
    let response: Response;
    try {
      response = await fetch(`${this.config.identityServiceUrl}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw new ConnectorAuthUnavailableError('identity_unreachable');
    }
    if (response.status === 401 && !retried) {
      this.serviceToken = null;
      return this.post(path, payload, true);
    }
    if (!response.ok) {
      this.logger.warn(`Connector introspection failed with status ${response.status}`);
      throw new ConnectorAuthUnavailableError(`identity_status_${response.status}`);
    }
    return response.json();
  }

  private async getServiceToken(): Promise<string> {
    if (this.serviceToken && this.serviceToken.expiresAt > Date.now() + 10_000) {
      return this.serviceToken.value;
    }
    if (!this.config.platformServiceClientSecret) {
      throw new ConnectorAuthUnavailableError('platform_service_secret_missing');
    }
    let response: Response;
    try {
      response = await fetch(`${this.config.identityServiceUrl}/auth/service-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.config.platformServiceClientId,
          clientSecret: this.config.platformServiceClientSecret,
          audience: 'svc:identity-oauth'
        }),
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw new ConnectorAuthUnavailableError('identity_unreachable');
    }
    if (!response.ok) {
      throw new ConnectorAuthUnavailableError(`service_token_status_${response.status}`);
    }
    const body = (await response.json()) as { accessToken: string; expiresIn: number };
    this.serviceToken = { value: body.accessToken, expiresAt: Date.now() + body.expiresIn * 1000 };
    return body.accessToken;
  }
}
