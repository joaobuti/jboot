import { BadRequestException, Injectable } from '@nestjs/common';
import { AnthropicProviderAdapter } from './anthropic-provider.adapter';
import { AnthropicExecutionAdapter } from './anthropic-execution.adapter';
import { OpenAIProviderAdapter } from './openai-provider.adapter';
import { OpenAIExecutionAdapter } from './openai-execution.adapter';
import { ProviderExecutionInput } from './provider-execution';

@Injectable()
export class ProviderRegistry {
  constructor(private readonly anthropic: AnthropicProviderAdapter,
    private readonly anthropicExecution: AnthropicExecutionAdapter,
    private readonly openai: OpenAIProviderAdapter,
    private readonly openaiExecution: OpenAIExecutionAdapter) {}
  models(provider: string, apiKey: string) {
    if (provider === 'anthropic') return this.anthropic.models(apiKey);
    if (provider === 'openai') return this.openai.models(apiKey);
    throw new BadRequestException('provider_not_supported');
  }
  execute(provider: string, input: ProviderExecutionInput) {
    if (provider === 'anthropic') return this.anthropicExecution.execute(input);
    if (provider === 'openai') return this.openaiExecution.execute(input);
    throw new BadRequestException('provider_not_supported');
  }
}
