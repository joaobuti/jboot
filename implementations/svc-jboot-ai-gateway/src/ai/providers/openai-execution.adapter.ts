import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import Ajv from 'ajv';
import { openAiClient } from './openai-client';
import { ProviderExecutionError, ProviderExecutionInput, ProviderExecutionResult } from './provider-execution';

@Injectable()
export class OpenAIExecutionAdapter {
  async execute(input: ProviderExecutionInput): Promise<ProviderExecutionResult> {
    const responseMode = input.responseMode ?? 'json_schema';
    let validate: ReturnType<Ajv['compile']> | undefined;
    if (responseMode === 'json_schema') {
      const ajv = new Ajv({ strict: true, allErrors: false, validateFormats: false });
      try { validate = ajv.compile(input.outputSchema ?? {}); }
      catch { throw new ProviderExecutionError('ai_output_schema_invalid'); }
    }
    try {
      const tools = input.tools ?? [];
      const response = await openAiClient(input.apiKey, 60_000).responses.create({
        model: input.model, instructions: input.systemPrompt, input: JSON.stringify(input.input),
        max_output_tokens: 4096, store: false,
        ...(tools.length > 0
          ? {
              tools: tools.map(tool => ({
                type: 'function' as const,
                name: tool.functionName,
                description: tool.description,
                parameters: tool.inputSchema,
                strict: true,
              })),
              tool_choice: 'auto' as const,
              parallel_tool_calls: false,
            }
          : {}),
        ...(responseMode === 'json_schema'
          ? { text: { format: { type: 'json_schema' as const, name: 'agent_output', schema: input.outputSchema ?? {}, strict: true } } }
          : {}),
      });
      if (response.status !== 'completed') throw new ProviderExecutionError('ai_output_incomplete');
      if (response.output.some(item => item.type === 'message' && item.content.some(part => part.type === 'refusal'))) throw new ProviderExecutionError('ai_output_refused');
      const calls = response.output.filter(item => item.type === 'function_call');
      if (calls.length > 1) throw new ProviderExecutionError('ai_tool_call_limit_exceeded');
      const toolCalls = calls.map(call => {
        const definition = tools.find(tool => tool.functionName === call.name);
        if (!definition) throw new ProviderExecutionError('ai_tool_not_allowed');
        let args: unknown;
        try { args = JSON.parse(call.arguments); }
        catch { throw new ProviderExecutionError('ai_tool_arguments_invalid'); }
        const ajv = new Ajv({ strict: true, allErrors: false, validateFormats: false });
        let valid: ReturnType<Ajv['compile']>;
        try { valid = ajv.compile(definition.inputSchema); }
        catch { throw new ProviderExecutionError('ai_tool_schema_invalid'); }
        if (!valid(args) || args === null || Array.isArray(args) || typeof args !== 'object') {
          throw new ProviderExecutionError('ai_tool_arguments_invalid');
        }
        return { callId: call.call_id, toolId: definition.id, arguments: args as Record<string, unknown> };
      });
      if (Buffer.byteLength(response.output_text) > 262_144) throw new ProviderExecutionError('ai_output_too_large');
      let output: unknown = response.output_text || null;
      if (responseMode === 'json_schema' && response.output_text) {
        try { output = JSON.parse(response.output_text); }
        catch { throw new ProviderExecutionError('ai_output_invalid'); }
        if (!validate?.(output)) throw new ProviderExecutionError('ai_output_schema_mismatch');
      }
      const inputTokens = response.usage?.input_tokens, outputTokens = response.usage?.output_tokens;
      if (inputTokens === undefined || outputTokens === undefined || ![inputTokens, outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) throw new ProviderExecutionError('ai_usage_invalid');
      return { output, toolCalls, inputTokens, outputTokens };
    } catch (error) {
      if (error instanceof ProviderExecutionError) throw error;
      if (error instanceof OpenAI.AuthenticationError) throw new ProviderExecutionError('ai_credential_invalid');
      if (error instanceof OpenAI.PermissionDeniedError) throw new ProviderExecutionError('ai_provider_permission_denied');
      if (error instanceof OpenAI.RateLimitError) throw new ProviderExecutionError('ai_provider_rate_limited');
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new ProviderExecutionError('ai_provider_timeout');
      if (error instanceof OpenAI.BadRequestError) throw new ProviderExecutionError('ai_provider_request_rejected');
      throw new ProviderExecutionError('ai_provider_unavailable');
    }
  }
}
