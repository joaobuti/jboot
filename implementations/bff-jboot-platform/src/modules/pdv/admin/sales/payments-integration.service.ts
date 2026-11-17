import {
  GatewayTimeoutException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppConfigService } from '../../../../config/app-config.service';

interface ServiceTokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface PaymentCharge {
  id: string;
  consumerApplication: string;
  merchantOrderReference: string;
  amountMinor: number;
  currency: 'BRL';
  status: 'created' | 'awaiting_payment' | 'verification_pending' | 'received' |
    'pending_reconciliation' | 'creation_outcome_unknown' | 'failed' | 'cancelled';
  checkoutUrl?: string;
  createdAt: string;
}

export interface ProviderConnection {
  provider: 'infinitepay';
  publicIdentifier: string;
  status: 'unverified' | 'verified' | 'disabled';
  verifiedAt: string | null;
  updatedAt: string;
}

export interface PaymentRefund {
  id: string;
  chargeId: string;
  amountMinor: number;
  status: 'requested' | 'succeeded' | 'failed';
  reason: string;
  operatorIdentityId: string;
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PixReconciliationItem {
  chargeId: string;
  merchantReference: string;
  amountMinor: number;
  status: 'verification_pending' | 'pending_reconciliation' | 'creation_outcome_unknown';
  verificationAttempts: number;
  nextVerificationAt?: string;
  lastVerificationAt?: string;
  lastVerificationError?: string;
  createdAt: string;
}

@Injectable()
export class PaymentsIntegrationService {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: AppConfigService) {}

  createPixCharge(input: {
    clientId: string;
    saleId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<PaymentCharge> {
    return this.request<PaymentCharge>('POST', '/v1/charges', input.clientId, {
      consumerApplication: 'pdv',
      merchantOrderReference: input.saleId,
      amountMinor: input.amountMinor,
      currency: 'BRL',
      paymentMethod: 'pix',
    }, input.idempotencyKey);
  }

  verifyCharge(clientId: string, chargeId: string): Promise<PaymentCharge> {
    return this.request<PaymentCharge>('POST', `/v1/charges/${encodeURIComponent(chargeId)}/verify`, clientId);
  }

  getInfinitePayConnection(clientId: string): Promise<ProviderConnection> {
    return this.requestWithMethod<ProviderConnection>('GET', '/v1/provider-connections/infinitepay', clientId);
  }

  configureInfinitePayConnection(
    clientId: string,
    input: { publicIdentifier: string; secretRef?: string },
  ): Promise<ProviderConnection> {
    return this.requestWithMethod<ProviderConnection>('PUT', '/v1/provider-connections/infinitepay', clientId, {
      ...input,
      validationEvidence: 'administrator_declaration_and_real_charge',
    });
  }

  listRefunds(clientId: string): Promise<{ data: PaymentRefund[] }> {
    return this.requestWithMethod<{ data: PaymentRefund[] }>('GET', '/v1/refunds', clientId);
  }

  listReconciliation(clientId: string): Promise<{ data: PixReconciliationItem[] }> {
    return this.requestWithMethod<{ data: PixReconciliationItem[] }>('GET', '/v1/operations/reconciliation', clientId);
  }

  requestRefund(input: {
    clientId: string;
    operatorIdentityId: string;
    chargeId: string;
    amountMinor: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<PaymentRefund> {
    return this.requestWithMethod<PaymentRefund>('POST', '/v1/refunds', input.clientId, {
      chargeId: input.chargeId,
      amountMinor: input.amountMinor,
      reason: input.reason,
    }, input.idempotencyKey, input.operatorIdentityId);
  }

  completeRefund(input: {
    clientId: string;
    operatorIdentityId: string;
    refundId: string;
    succeeded: boolean;
    resolutionNote: string;
  }): Promise<PaymentRefund> {
    return this.requestWithMethod<PaymentRefund>(
      'POST',
      `/v1/refunds/${encodeURIComponent(input.refundId)}/complete`,
      input.clientId,
      { succeeded: input.succeeded, resolutionNote: input.resolutionNote },
      undefined,
      input.operatorIdentityId,
    );
  }

  private async request<T>(
    method: 'POST',
    path: string,
    clientId: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    return this.requestWithMethod<T>(method, path, clientId, body, idempotencyKey);
  }

  private async requestWithMethod<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    clientId: string,
    body?: unknown,
    idempotencyKey?: string,
    operatorIdentityId?: string,
  ): Promise<T> {
    const token = await this.serviceToken();
    let response: Response;
    try {
      response = await fetch(`${this.config.paymentsServiceUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-JBoot-Client-Id': clientId,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...(operatorIdentityId ? { 'X-JBoot-Operator-Id': operatorIdentityId } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new GatewayTimeoutException('Payments excedeu o tempo limite; consulte a cobranca antes de tentar novamente');
      }
      throw new ServiceUnavailableException('Payments indisponivel');
    }
    if (!response.ok) {
      const problem = await this.safeProblem(response);
      throw new HttpException(problem, response.status);
    }
    return response.json() as Promise<T>;
  }

  private async serviceToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 10_000) {
      return this.cachedToken.value;
    }
    if (!this.config.platformServiceClientSecret) {
      throw new ServiceUnavailableException('Credencial s2s da Platform nao configurada');
    }
    let response: Response;
    try {
      response = await fetch(`${this.config.identityServiceUrl}/auth/service-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: this.config.platformServiceClientId,
          clientSecret: this.config.platformServiceClientSecret,
          audience: 'svc:payments',
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ServiceUnavailableException('Identity indisponivel para autenticacao s2s');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Identity recusou autenticacao s2s');
    }
    const payload = (await response.json()) as ServiceTokenResponse;
    this.cachedToken = { value: payload.accessToken, expiresAt: Date.now() + payload.expiresIn * 1000 };
    return payload.accessToken;
  }

  private async safeProblem(response: Response): Promise<Record<string, unknown>> {
    try {
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body.code === 'string' && typeof body.title === 'string') {
        return {
          type: typeof body.type === 'string' ? body.type : 'about:blank',
          title: body.title,
          status: response.status,
          code: body.code,
          requestId: typeof body.requestId === 'string' ? body.requestId : 'unavailable',
        };
      }
    } catch {
      // Raw provider/service bodies never cross the BFF boundary.
    }
    return {
      type: 'https://docs.jboot.local/problems/payments_unavailable',
      title: 'Servico de pagamentos indisponivel',
      status: response.status,
      code: 'payments_unavailable',
      requestId: 'unavailable',
    };
  }
}
