import { AiResponseMode } from '../../config/app-config.service';
import { AiToolDefinition } from '../tools/tool-catalog';

export type ProviderToolCall = {
  callId: string;
  toolId: string;
  arguments: Record<string, unknown>;
};

export type ProviderExecutionInput = {
  apiKey: string; model: string; systemPrompt: string;
  input: Record<string, unknown>;
  responseMode?: AiResponseMode;
  outputSchema?: Record<string, unknown>;
  tools?: AiToolDefinition[];
};
export type ProviderExecutionResult = {
  output: unknown;
  toolCalls?: ProviderToolCall[];
  inputTokens: number;
  outputTokens: number;
};
export class ProviderExecutionError extends Error {
  constructor(readonly code: string) { super(code); }
}
