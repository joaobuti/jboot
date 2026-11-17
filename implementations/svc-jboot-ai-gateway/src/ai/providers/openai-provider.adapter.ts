import { ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import OpenAI from 'openai';
import { ProviderModel } from './provider-model';
import { openAiClient } from './openai-client';

@Injectable()
export class OpenAIProviderAdapter {
  async models(apiKey: string): Promise<ProviderModel[]> {
    if (!apiKey.trim() || /[\r\n]/.test(apiKey)) throw new UnauthorizedException('ai_credential_invalid');
    try {
      const page = await openAiClient(apiKey, 10_000).models.list();
      if (!Array.isArray(page.data) || page.data.length > 1000) throw new ServiceUnavailableException('ai_provider_invalid_response');
      return page.data.map(model => {
        if (typeof model.id !== 'string' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(model.id)) throw new ServiceUnavailableException('ai_provider_invalid_response');
        return { id: model.id, label: model.id };
      });
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) throw new UnauthorizedException('ai_credential_invalid');
      if (error instanceof OpenAI.PermissionDeniedError) throw new ForbiddenException('ai_provider_permission_denied');
      if (error instanceof OpenAI.RateLimitError) throw new ServiceUnavailableException('ai_provider_rate_limited');
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('ai_provider_unavailable');
    }
  }
}
