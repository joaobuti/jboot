import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import Ajv from 'ajv';

import { ProviderExecutionError, ProviderExecutionInput, ProviderExecutionResult } from './provider-execution';
export { ProviderExecutionError, ProviderExecutionInput, ProviderExecutionResult } from './provider-execution';

@Injectable()
export class AnthropicExecutionAdapter {
  async execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
    const responseMode = input.responseMode ?? 'json_schema';
    let validate: ReturnType<Ajv['compile']> | undefined;
    if (responseMode === 'json_schema') {
      const ajv = new Ajv({ strict: true, allErrors: false, validateFormats: false });
      try { validate = ajv.compile(input.outputSchema ?? {}); }
      catch { throw new ProviderExecutionError('ai_output_schema_invalid'); }
    }
    // Fixed origin, no redirects, no environment base URL or proxy chosen by input.
    const client = new Anthropic({
      apiKey: input.apiKey, baseURL: 'https://api.anthropic.com',
      timeout: 60_000, maxRetries: 0,
      fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }),
      logLevel: 'off',
    });
    try {
      const message = await client.messages.create({
        model: input.model, max_tokens: 4096,
        system: input.systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(input.input) }],
        ...(responseMode === 'json_schema'
          ? { output_config: { format: { type: 'json_schema' as const, schema: input.outputSchema ?? {} } } }
          : {}),
      });
      if (message.stop_reason !== 'end_turn') throw new ProviderExecutionError('ai_output_incomplete');
      const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
      if (Buffer.byteLength(text) > 262_144) throw new ProviderExecutionError('ai_output_too_large');
      let output: unknown = text;
      if (responseMode === 'json_schema') {
        try { output = JSON.parse(text); }
        catch { throw new ProviderExecutionError('ai_output_invalid'); }
        if (!validate?.(output)) throw new ProviderExecutionError('ai_output_schema_mismatch');
      }
      const { input_tokens: inputTokens, output_tokens: outputTokens } = message.usage;
      if (![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) throw new ProviderExecutionError('ai_usage_invalid');
      return { output, inputTokens, outputTokens };
    } catch (error) {
      if (error instanceof ProviderExecutionError) throw error;
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new ProviderExecutionError('ai_credential_invalid');
      if (error instanceof Anthropic.RateLimitError) throw new ProviderExecutionError('ai_provider_rate_limited');
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderExecutionError('ai_provider_timeout');
      if (error instanceof Anthropic.BadRequestError) throw new ProviderExecutionError('ai_provider_request_rejected');
      throw new ProviderExecutionError('ai_provider_unavailable');
    }
  }
}
