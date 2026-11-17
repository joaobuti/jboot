import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

import { ProviderModel } from './provider-model';
export { ProviderModel } from './provider-model';

/** Only metadata leaves this boundary; provider bodies and credentials never escape. */
@Injectable()
export class AnthropicProviderAdapter {
  async models(apiKey: string): Promise<ProviderModel[]> {
    if (!apiKey.trim() || /[\r\n]/.test(apiKey)) throw new UnauthorizedException('ai_credential_invalid');
    try {
      const response = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
        method: 'GET',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        throw new UnauthorizedException('ai_credential_invalid');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new ServiceUnavailableException(response.status === 429 ? 'ai_provider_rate_limited' : 'ai_provider_unavailable');
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ServiceUnavailableException('ai_provider_invalid_response');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 1_048_576) throw new ServiceUnavailableException('ai_provider_invalid_response');
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { data?: unknown; has_more?: unknown };
      if (!Array.isArray(payload.data) || payload.has_more !== false) throw new ServiceUnavailableException('ai_provider_invalid_response');
      return payload.data.map((item: unknown) => {
        const model = item as Record<string, unknown> | null;
        if (!model || typeof model.id !== 'string' || typeof model.display_name !== 'string' || !/^claude-[a-zA-Z0-9._-]+$/.test(model.id)) {
          throw new ServiceUnavailableException('ai_provider_invalid_response');
        }
        return { id: model.id, label: model.display_name };
      });
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('ai_provider_unavailable');
    }
  }
}
