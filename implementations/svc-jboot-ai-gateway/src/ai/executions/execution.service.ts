import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import { CredentialCryptoService } from '../crypto/credential-crypto.service';
import { AgentPromptCryptoService } from '../crypto/agent-prompt-crypto.service';
import { ProviderExecutionError } from '../providers/provider-execution';
import { ProviderRegistry } from '../providers/provider-registry';
import { CreateExecutionDto } from './execution.dto';
import { ExecutionRepository } from './execution.repository';
import { AuthContext } from '../../auth/auth-context';
import { CreateInteractionDto } from '../interactions/interaction.dto';
import { ToolCatalog } from '../tools/tool-catalog';
import { ExecutionToolCallsCryptoService } from '../crypto/execution-tool-calls-crypto.service';
import { ClaudeRoutineFireAdapter } from '../providers/claude-routine-fire.adapter';
import { CLAUDE_ROUTINE_PROVIDER } from '../agents/agent.service';
import { ExecutionView } from './execution.repository';

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

@Injectable()
export class ExecutionService {
  constructor(
    private readonly repo: ExecutionRepository,
    private readonly config: AppConfigService,
    private readonly credentials: CredentialCryptoService,
    private readonly prompts: AgentPromptCryptoService,
    private readonly providers: ProviderRegistry,
    private readonly tools: ToolCatalog,
    private readonly toolCallsCrypto: ExecutionToolCallsCryptoService,
    private readonly routines: ClaudeRoutineFireAdapter,
  ) {}

  async execute(body: CreateExecutionDto, key: string) {
    const result = await this.run(body, key);
    return {
      ...result.view,
      output: result.output ?? null,
      requestedActions: result.requestedActions ?? [],
      outputAvailable: result.output !== undefined || result.requestedActions !== undefined,
      replayed: result.replayed,
      ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    };
  }

  async interact(auth: AuthContext, body: CreateInteractionDto, key: string) {
    const result = await this.run(
      {
        clientId: auth.clientId,
        requesterIdentityId: auth.identityId,
        applicationSlug: auth.applicationSlug,
        agentId: body.agentId,
        sourceType: 'manual_interaction',
        sourceId: body.requestId,
        input: body.input,
      },
      key,
    );
    return {
      ...result.view,
      output: result.output ?? null,
      requestedActions: result.requestedActions ?? [],
      outputAvailable: result.output !== undefined || result.requestedActions !== undefined,
      replayed: result.replayed,
    };
  }

  private async run(body: CreateExecutionDto, key: string): Promise<{
    view: ExecutionView;
    output?: unknown;
    requestedActions?: Array<{ callId: string; toolId: string; arguments: Record<string, unknown> }>;
    replayed: boolean;
    retryAfterSeconds?: number;
  }> {
    if (!this.config.aiExecutionEnabled) throw new ServiceUnavailableException('ai_execution_not_enabled');
    if (Buffer.byteLength(JSON.stringify(body.input)) > 65_536) throw new BadRequestException('ai_input_too_large');
    // Bind replay to all authorization/source fields, not just the input content.
    const inputSha256 = digest(body);
    const replay = await this.repo.byKey(body.clientId, body.applicationSlug, key);
    if (replay) {
      if (replay.inputSha256 !== inputSha256) throw new ConflictException('ai_idempotency_conflict');
      const requestedActions = replay.toolCallsEnvelope
        ? this.toolCallsCrypto.decrypt(replay.toolCallsEnvelope, {
            executionId: replay.view.id,
            clientId: body.clientId,
            applicationSlug: body.applicationSlug,
          })
        : undefined;
      return { view: replay.view, requestedActions, replayed: true };
    }
    const mode = await this.repo.mode(body.clientId, body.requesterIdentityId, body.applicationSlug, body.agentId);
    if (!mode) throw new NotFoundException('Active agent not found');
    if (mode === 'claude_routine') return this.fireRoutine(body, key, inputSha256);
    const material = await this.repo.material(body.clientId, body.requesterIdentityId, body.applicationSlug, body.agentId);
    if (!material) throw new NotFoundException('Active agent not found');
    if (!this.config.isProviderEnabled(material.provider)) throw new BadRequestException('provider_not_enabled');
    if (!this.config.isModelAllowed(material.provider, material.model, material.responseMode)) {
      throw new BadRequestException('ai_model_not_enabled');
    }
    const execution = await this.repo.create({ id: randomUUID(), clientId: body.clientId, requesterId: body.requesterIdentityId, applicationSlug: body.applicationSlug, sourceType: body.sourceType, sourceId: body.sourceId, idempotencyKey: key, inputSha256, material });
    if (!execution) {
      const concurrent = await this.repo.byKey(body.clientId, body.applicationSlug, key);
      if (!concurrent || concurrent.inputSha256 !== inputSha256) throw new ConflictException('ai_idempotency_conflict');
      return { view: concurrent.view, replayed: true };
    }
    const started = Date.now();
    try {
      const apiKey = this.credentials.decrypt({ ciphertext: material.credentialCiphertext, nonce: material.credentialNonce, authTag: material.credentialAuthTag, keyVersion: material.credentialKeyVersion }, { id: material.credentialId, clientId: body.clientId, ownerIdentityId: body.requesterIdentityId, provider: material.provider });
      const systemPrompt = this.prompts.decrypt({ ciphertext: material.promptCiphertext, nonce: material.promptNonce, authTag: material.promptAuthTag, keyVersion: material.promptKeyVersion }, { agentId: material.agentId, version: material.agentVersion, clientId: body.clientId, ownerIdentityId: body.requesterIdentityId, applicationSlug: body.applicationSlug });
      const result = await this.providers.execute(material.provider, {
        apiKey,
        systemPrompt,
        model: material.model,
        input: body.input,
        responseMode: material.responseMode,
        outputSchema: material.outputSchema,
        tools: this.tools.requireAllowed(material.allowedTools),
      });
      const requestedActions = result.toolCalls ?? [];
      const toolCallsEnvelope = requestedActions.length > 0
        ? this.toolCallsCrypto.encrypt(requestedActions, {
            executionId: execution.id,
            clientId: body.clientId,
            applicationSlug: body.applicationSlug,
          })
        : undefined;
      const view = await this.repo.succeed(
        execution.id,
        digest({ output: result.output, requestedActions }),
        Date.now() - started,
        result.inputTokens,
        result.outputTokens,
        toolCallsEnvelope,
      );
      return { view, output: result.output, requestedActions, replayed: false };
    } catch (error) {
      const view = await this.repo.fail(execution.id, error instanceof ProviderExecutionError ? error.code : 'ai_execution_failed', Date.now() - started);
      return { view, replayed: false };
    }
  }
  /**
   * Modo rotina: o gateway nao chama modelo. Dispara a rotina do Claude Code do
   * dono com so os identificadores do input; a rotina le e escreve no Flow pelo
   * conector MCP. Uso interativo pela assinatura e o proprio conector.
   */
  private async fireRoutine(body: CreateExecutionDto, key: string, inputSha256: string) {
    if (body.sourceType === 'manual_interaction') throw new BadRequestException('ai_agent_mode_not_interactive');
    const material = await this.repo.routineMaterial(body.clientId, body.requesterIdentityId, body.applicationSlug, body.agentId);
    if (!material) throw new NotFoundException('Active agent not found');
    const execution = await this.repo.create({
      id: randomUUID(), clientId: body.clientId, requesterId: body.requesterIdentityId, applicationSlug: body.applicationSlug,
      sourceType: body.sourceType, sourceId: body.sourceId, idempotencyKey: key, inputSha256,
      material: { agentId: material.agentId, agentVersion: material.agentVersion, provider: CLAUDE_ROUTINE_PROVIDER, model: CLAUDE_ROUTINE_PROVIDER },
      executionMode: 'claude_routine',
    });
    if (!execution) {
      const concurrent = await this.repo.byKey(body.clientId, body.applicationSlug, key);
      if (!concurrent || concurrent.inputSha256 !== inputSha256) throw new ConflictException('ai_idempotency_conflict');
      return { view: concurrent.view, replayed: true };
    }
    const started = Date.now();
    let token: string;
    try {
      token = this.credentials.decrypt(
        { ciphertext: material.tokenCiphertext, nonce: material.tokenNonce, authTag: material.tokenAuthTag, keyVersion: material.tokenKeyVersion },
        { id: material.agentId, clientId: body.clientId, ownerIdentityId: body.requesterIdentityId, provider: CLAUDE_ROUTINE_PROVIDER },
      );
    } catch {
      return { view: await this.repo.fail(execution.id, 'routine_token_unreadable', Date.now() - started), replayed: false };
    }
    const outcome = await this.routines.fire({ fireUrl: material.fireUrl, token, text: routineText(body.input) });
    const latency = Date.now() - started;
    if (outcome.kind === 'dispatched') {
      return { view: await this.repo.dispatched(execution.id, outcome.sessionUrl, latency), replayed: false };
    }
    const view = await this.repo.fail(execution.id, outcome.code, latency);
    return outcome.kind === 'retryable'
      ? { view, replayed: false, retryAfterSeconds: outcome.retryAfterSeconds }
      : { view, replayed: false };
  }

  async get(id: string, clientId: string, applicationSlug: string) {
    const found = await this.repo.find(id, clientId, applicationSlug);
    if (!found) throw new NotFoundException('Execution not found');
    return found;
  }
}

/**
 * Texto do disparo da rotina: so pares chave/valor escalares do input (ids da
 * automacao). Objetos aninhados (snapshot do card) nunca vao para a rotina; ela
 * le o card pelo conector, com a ACL do proprio dono.
 */
export function routineText(input: Record<string, unknown>): string {
  const lines = Object.entries(input)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([name, value]) => `${name.replace(/[^a-zA-Z0-9_]/g, '_')}: ${String(value).replace(/[\r\n]+/g, ' ')}`);
  return ['JBoot Flow automation', ...lines].join('\n').slice(0, 4_096);
}
