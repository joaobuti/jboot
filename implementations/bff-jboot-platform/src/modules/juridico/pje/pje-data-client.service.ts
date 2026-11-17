import { GatewayTimeoutException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

export interface DjenPageDto {
  items: Array<Record<string, unknown>>;
  count: number;
  page: number;
  pageSize: number;
}

export interface DjenTribunaisDto {
  items: unknown[];
  total: number;
}

@Injectable()
export class PjeDataClientService {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: AppConfigService) {}

  async comunicacoes(params: URLSearchParams): Promise<DjenPageDto> {
    return this.request<DjenPageDto>('GET', `/v1/djen/comunicacoes?${params.toString()}`);
  }

  tribunais(): Promise<DjenTribunaisDto> {
    return this.request<DjenTribunaisDto>('GET', '/v1/djen/tribunais');
  }

  private async request<T>(method: 'GET', path: string): Promise<T> {
    const token = await this.serviceToken();
    let response: Response;
    try {
      response = await fetch(`${this.config.juridicoDataServiceUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') throw new GatewayTimeoutException('Servico de dados juridicos excedeu o tempo limite');
      throw new ServiceUnavailableException('Servico de dados juridicos indisponivel');
    }
    if (!response.ok) throw new HttpException(await this.problem(response), response.status);
    return response.json() as Promise<T>;
  }

  /**
   * Preserva o problema que o servico interno descreveu, em vez de trocar por
   * uma mensagem generica.
   *
   * Sem isso, indisponibilidade do DJEN/CNJ chegava a tela como "o servico
   * recusou a consulta", que soa como defeito nosso — quando o proprio CNJ
   * respondeu "o sistema esta muito ocupado". O `code` e o que a UI usa para
   * dizer de quem e a falha; o corpo bruto do provedor continua descartado.
   */
  private async problem(response: Response): Promise<{ code: string; title: string; status: number }> {
    try {
      const body = (await response.json()) as { code?: unknown; title?: unknown };
      if (typeof body.code === 'string' && typeof body.title === 'string') {
        return { code: body.code, title: body.title, status: response.status };
      }
    } catch {
      // Corpo nao estruturado: nunca repassar conteudo bruto do provedor.
    }
    return {
      code: response.status >= 500 ? 'provider_unavailable' : 'juridico_data_unavailable',
      title: 'Servico de dados juridicos indisponivel',
      status: response.status,
    };
  }

  private async serviceToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 10_000) return this.cachedToken.value;
    if (!this.config.platformServiceClientSecret) throw new ServiceUnavailableException('Credencial s2s da Platform nao configurada');
    let response: Response;
    try {
      response = await fetch(`${this.config.identityServiceUrl}/auth/service-token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.config.platformServiceClientId, clientSecret: this.config.platformServiceClientSecret, audience: 'svc:juridico-data' }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch { throw new ServiceUnavailableException('Identity indisponivel para autenticacao s2s'); }
    if (!response.ok) throw new ServiceUnavailableException('Identity recusou autenticacao s2s');
    const payload = await response.json() as { accessToken: string; expiresIn: number };
    this.cachedToken = { value: payload.accessToken, expiresAt: Date.now() + payload.expiresIn * 1000 };
    return payload.accessToken;
  }
}
