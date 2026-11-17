import { GatewayTimeoutException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import {
  DjenCommunicationPageDto,
  InternalProcessResponseDto,
  ProblemDto,
  QueryJuridicoDataProcessInput,
  TribunalListDto,
} from './juridico-data.types';

/** Tela: o servico desiste em 12 s. Segundo plano: o servico desiste em 60 s; 70 s cobre a resposta. */
const INTERACTIVE_TIMEOUT_MS = 15_000;
const BACKGROUND_TIMEOUT_MS = 70_000;

interface ServiceTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class DataJudClientService {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: AppConfigService) {}

  listTribunals(): Promise<TribunalListDto> {
    return this.request<TribunalListDto>('GET', '/v1/datajud/tribunais');
  }

  /**
   * `background`: acompanhamento sem ninguem esperando na tela (ADR 021, Sprint 4). O servico tenta uma
   * vez com o limite proprio do segundo plano (60 s); aqui a espera cobre esse limite com folga.
   */
  queryProcess(
    body: QueryJuridicoDataProcessInput,
    requestId: string,
    options: { background?: boolean } = {},
  ): Promise<InternalProcessResponseDto> {
    return this.request<InternalProcessResponseDto>(
      'POST',
      '/v1/datajud/processos/consulta',
      body,
      requestId,
      options.background ? { mode: 'background', timeoutMs: BACKGROUND_TIMEOUT_MS } : undefined,
    );
  }

  /** Comunicacoes do DJEN pelo servico de dados (filtros e periodo ja validados por quem chama). */
  djenCommunications(params: Record<string, string>): Promise<DjenCommunicationPageDto> {
    return this.request<DjenCommunicationPageDto>('GET', `/v1/djen/comunicacoes?${new URLSearchParams(params).toString()}`);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    requestId?: string,
    background?: { mode: 'background'; timeoutMs: number },
  ): Promise<T> {
    const token = await this.serviceToken();
    let response: Response;
    try {
      response = await fetch(`${this.config.juridicoDataServiceUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(requestId ? { 'X-Request-Id': requestId } : {}),
          ...(background ? { 'X-JBoot-Query-Mode': background.mode } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(background?.timeoutMs ?? INTERACTIVE_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new GatewayTimeoutException('Servico de dados juridicos excedeu o tempo limite');
      }
      throw new ServiceUnavailableException('Servico de dados juridicos indisponivel');
    }
    if (!response.ok) {
      const problem = await this.safeProblem(response, requestId);
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
          audience: 'svc:juridico-data',
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
    this.cachedToken = {
      value: payload.accessToken,
      expiresAt: Date.now() + payload.expiresIn * 1000,
    };
    return payload.accessToken;
  }

  private async safeProblem(response: Response, requestId = 'unavailable'): Promise<ProblemDto> {
    try {
      const body = (await response.json()) as Partial<ProblemDto>;
      if (typeof body.code === 'string' && typeof body.title === 'string') {
        return {
          type: typeof body.type === 'string' ? body.type : 'about:blank',
          title: body.title,
          status: response.status,
          code: this.mapCode(body.code, response.status),
          requestId: typeof body.requestId === 'string' ? body.requestId : requestId,
        };
      }
    } catch {
      // Deliberately discard provider/internal raw bodies.
    }
    return {
      type: 'https://docs.jboot.local/problems/juridico_data_unavailable',
      title: 'Servico de dados juridicos indisponivel',
      status: response.status,
      code: this.mapCode('', response.status),
      requestId,
    };
  }

  private mapCode(code: string, status: number): string {
    const explicit: Record<string, string> = {
      process_restricted: 'process_restricted',
      process_not_found: 'process_not_found',
      validation_error: 'validation_error',
      provider_rate_limited: 'rate_limited',
      provider_timeout: 'juridico_data_timeout',
      provider_unavailable: 'juridico_data_unavailable',
    };
    return explicit[code] ?? (status === 504 ? 'juridico_data_timeout' : 'juridico_data_unavailable');
  }
}
