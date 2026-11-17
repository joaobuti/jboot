import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

interface ServiceTokenResponse { accessToken: string; expiresIn: number }

export interface AiExecutionResponse {
  id: string;
  status: string;
  errorCode: string | null;
  requestedActions: Array<{ callId: string; toolId: string; arguments: Record<string, unknown> }>;
  /** Rotina: link da sessao Claude Code do dono (status `dispatched`). */
  externalSessionUrl?: string | null;
  /** Rotina recusada por limite: segundos ate poder disparar de novo. */
  retryAfterSeconds?: number;
}

export class AiGatewayRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

@Injectable()
export class AiGatewayClientService {
  private cachedToken: { value: string; expiresAt: number } | null = null;
  constructor(private readonly config: AppConfigService) {}

  async execute(input: {
    clientId: string; requesterIdentityId: string; agentId: string; sourceId: string;
    idempotencyKey: string; payload: Record<string, unknown>;
    /** Origem registrada no ledger do gateway (default: automacao do Kanban). */
    sourceType?: string;
  }): Promise<AiExecutionResponse> {
    const token = await this.serviceToken();
    let response: Response;
    try {
      response = await fetch(`${this.config.aiGatewayServiceUrl}/v1/executions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
          'X-JBoot-Client-Id': input.clientId,
          'X-JBoot-Application-Slug': 'flow',
        },
        body: JSON.stringify({
          clientId: input.clientId,
          requesterIdentityId: input.requesterIdentityId,
          applicationSlug: 'flow',
          agentId: input.agentId,
          sourceType: input.sourceType ?? 'kanban_automation',
          sourceId: input.sourceId,
          input: input.payload,
        }),
        signal: AbortSignal.timeout(65_000),
      });
    } catch {
      throw new AiGatewayRequestError(503, 'ai_gateway_unavailable');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: unknown } | null;
      const code = typeof body?.message === 'string' ? body.message : 'ai_gateway_rejected';
      throw new AiGatewayRequestError(response.status, code);
    }
    return response.json() as Promise<AiExecutionResponse>;
  }

  private async serviceToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 10_000) return this.cachedToken.value;
    if (!this.config.platformServiceClientSecret) throw new AiGatewayRequestError(503, 'service_credential_missing');
    let response: Response;
    try {
      response = await fetch(`${this.config.identityServiceUrl}/auth/service-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.config.platformServiceClientId,
          clientSecret: this.config.platformServiceClientSecret,
          audience: 'svc:ai-gateway',
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new AiGatewayRequestError(503, 'identity_service_unavailable');
    }
    if (!response.ok) throw new AiGatewayRequestError(503, 'service_auth_rejected');
    const payload = await response.json() as ServiceTokenResponse;
    this.cachedToken = { value: payload.accessToken, expiresAt: Date.now() + payload.expiresIn * 1000 };
    return payload.accessToken;
  }
}
