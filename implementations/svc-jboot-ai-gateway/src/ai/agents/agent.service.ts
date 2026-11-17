import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuthContext } from "../../auth/auth-context";
import { AgentPromptCryptoService } from "../crypto/agent-prompt-crypto.service";
import { API_SYSTEM_PROMPT_MAX, CreateAgentDto, UpdateAgentDto } from "./agent.dto";
import { AgentRepository, AgentView } from "./agent.repository";
import { CredentialCryptoService } from "../crypto/credential-crypto.service";
import { CredentialService } from '../credentials/credential.service';
import { AiResponseMode } from '../../config/app-config.service';
import { AI_TOOL_POLICY_VERSION, ToolCatalog } from '../tools/tool-catalog';

@Injectable()
export class AgentService {
  constructor(
    private readonly repo: AgentRepository,
    private readonly crypto: AgentPromptCryptoService,
    private readonly credentials: CredentialService,
    private readonly tools: ToolCatalog,
    private readonly secrets: CredentialCryptoService,
  ) {}
  list(auth: AuthContext) {
    return this.repo.list(auth.clientId, auth.identityId, auth.applicationSlug);
  }
  async create(auth: AuthContext, input: CreateAgentDto) {
    if (input.executionMode === 'claude_routine') return this.createRoutine(auth, input);
    this.rejectRoutineFields(input);
    requireApiPromptSize(input.systemPrompt);
    const responseMode = input.responseMode ?? 'json_schema';
    const outputSchema = this.requireOutputSchema(responseMode, input.outputSchema);
    const allowedTools = this.tools.requireAllowed(input.allowedTools).map(tool => tool.id);
    const credential = await this.repo.credential(
      input.credentialId!,
      auth.clientId,
      auth.identityId,
    );
    if (!credential || credential.status !== "active")
      throw new BadRequestException("Active credential required");
    this.requireToolProvider(credential.provider, allowedTools);
    await this.requireModel(auth, input.credentialId!, input.model!, responseMode);
    const id = randomUUID();
    const encrypted = this.crypto.encrypt(input.systemPrompt!, {
      agentId: id,
      version: 1,
      clientId: auth.clientId,
      ownerIdentityId: auth.identityId,
      applicationSlug: auth.applicationSlug,
    });
    return uniqueName(this.repo.create(
      id,
      auth.clientId,
      auth.identityId,
      auth.applicationSlug,
      { ...input, credentialId: input.credentialId!, model: input.model!, systemPrompt: input.systemPrompt!, responseMode, outputSchema, allowedTools, toolPolicyVersion: AI_TOOL_POLICY_VERSION },
      credential.provider,
      encrypted,
    ));
  }
  async update(auth: AuthContext, id: string, input: UpdateAgentDto) {
    const agent = await this.repo.find(
      id,
      auth.clientId,
      auth.identityId,
      auth.applicationSlug,
    );
    if (!agent) throw new NotFoundException("Agent not found");
    if (input.executionMode && input.executionMode !== agent.executionMode)
      throw new BadRequestException("ai_agent_execution_mode_immutable");
    if (agent.executionMode === 'claude_routine') return this.updateRoutine(auth, agent, input);
    this.rejectRoutineFields(input);
    requireApiPromptSize(input.systemPrompt);
    const versionChange =
      input.systemPrompt !== undefined ||
      input.outputSchema !== undefined ||
      input.responseMode !== undefined ||
      input.allowedTools !== undefined;
    if (versionChange && !input.systemPrompt)
      throw new BadRequestException("systemPrompt required for a new version");
    const responseMode = input.responseMode ?? agent.responseMode;
    const outputSchema = versionChange
      ? this.requireOutputSchema(responseMode, input.outputSchema ?? agent.outputSchema)
      : undefined;
    const allowedTools = versionChange
      ? this.tools.requireAllowed(input.allowedTools ?? agent.allowedTools).map(tool => tool.id)
      : undefined;
    const credential = await this.repo.credential(
      input.credentialId ?? agent.credentialId!,
      auth.clientId,
      auth.identityId,
    );
    if (!credential || credential.status !== "active")
      throw new BadRequestException("Active credential required");
    this.requireToolProvider(credential.provider, allowedTools ?? agent.allowedTools);
    await this.requireModel(
      auth,
      input.credentialId ?? agent.credentialId!,
      input.model ?? agent.model!,
      responseMode,
    );
    const encrypted = input.systemPrompt
      ? this.crypto.encrypt(input.systemPrompt, {
          agentId: id,
          version: agent.activeVersion + 1,
          clientId: auth.clientId,
          ownerIdentityId: auth.identityId,
          applicationSlug: auth.applicationSlug,
        })
      : undefined;
    return uniqueName(this.repo.update(
      agent,
      auth.clientId,
      auth.identityId,
      auth.applicationSlug,
      {
        ...input,
        responseMode: versionChange ? responseMode : undefined,
        outputSchema,
        allowedTools,
        toolPolicyVersion: versionChange ? AI_TOOL_POLICY_VERSION : undefined,
      },
      credential.provider,
      encrypted,
    ));
  }
  async remove(auth: AuthContext, id: string) {
    const agent = await this.repo.remove(
      id,
      auth.clientId,
      auth.identityId,
      auth.applicationSlug,
    );
    if (!agent) throw new NotFoundException("Agent not found");
    return agent;
  }
  private createRoutine(auth: AuthContext, input: CreateAgentDto) {
    this.rejectApiFields(input);
    const id = randomUUID();
    const referencePrompt = input.systemPrompt ?? '';
    return uniqueName(this.repo.createRoutine(
      id,
      auth.clientId,
      auth.identityId,
      auth.applicationSlug,
      { name: input.name, description: input.description, externalReference: input.externalReference, routineFireUrl: input.routineFireUrl!, referencePrompt },
      this.sealRoutineToken(auth, id, input.routineToken!),
      this.crypto.encrypt(referencePrompt, { agentId: id, version: 1, clientId: auth.clientId, ownerIdentityId: auth.identityId, applicationSlug: auth.applicationSlug }),
    ));
  }

  private updateRoutine(auth: AuthContext, agent: AgentView, input: UpdateAgentDto) {
    this.rejectApiFields(input);
    const prompt = input.systemPrompt !== undefined
      ? this.crypto.encrypt(input.systemPrompt, { agentId: agent.id, version: agent.activeVersion + 1, clientId: auth.clientId, ownerIdentityId: auth.identityId, applicationSlug: auth.applicationSlug })
      : undefined;
    return uniqueName(this.repo.updateRoutine(
      agent,
      auth.clientId,
      auth.identityId,
      auth.applicationSlug,
      { name: input.name, description: input.description, externalReference: input.externalReference, routineFireUrl: input.routineFireUrl, referencePrompt: input.systemPrompt },
      input.routineToken ? this.sealRoutineToken(auth, agent.id, input.routineToken) : undefined,
      prompt,
    ));
  }

  /** Token da rotina cifrado como credencial (AAD ligado ao agent e ao dono). */
  private sealRoutineToken(auth: AuthContext, agentId: string, token: string) {
    return {
      envelope: this.secrets.encrypt(token, { id: agentId, clientId: auth.clientId, ownerIdentityId: auth.identityId, provider: CLAUDE_ROUTINE_PROVIDER }),
      last4: token.slice(-4),
    };
  }

  private rejectApiFields(input: UpdateAgentDto) {
    if (input.credentialId !== undefined || input.model !== undefined || input.outputSchema !== undefined ||
        input.responseMode !== undefined || (input.allowedTools?.length ?? 0) > 0)
      throw new BadRequestException("ai_agent_routine_fields_only");
  }

  private rejectRoutineFields(input: UpdateAgentDto) {
    if (input.routineFireUrl !== undefined || input.routineToken !== undefined)
      throw new BadRequestException("ai_agent_api_fields_only");
  }

  private requireOutputSchema(
    responseMode: AiResponseMode,
    outputSchema: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (responseMode === 'text') return {};
    if (!outputSchema) throw new BadRequestException('outputSchema required for json_schema mode');
    return outputSchema;
  }

  private async requireModel(
    auth: AuthContext,
    credentialId: string,
    model: string,
    responseMode: AiResponseMode,
  ) {
    const models = await this.credentials.models(auth, credentialId);
    const capability = responseMode === 'text' ? 'text-output' : 'structured-output';
    if (!models.some(candidate => candidate.id === model && candidate.capabilities?.includes(capability))) {
      throw new BadRequestException('ai_model_not_available');
    }
  }

  private requireToolProvider(provider: string, allowedTools: readonly string[]) {
    if (allowedTools.length > 0 && provider !== 'openai') {
      throw new BadRequestException('ai_tools_provider_not_supported');
    }
  }
}

/**
 * Nome e unico por dono e aplicacao, inclusive entre agentes inativos (remover
 * so inativa); colisao vira 409 em vez de 500.
 */
async function uniqueName<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ConflictException('ai_agent_name_taken');
    throw error;
  }
}

/** Provider gravado no agent e no ledger em modo rotina; nao e provider BYOK. */
export const CLAUDE_ROUTINE_PROVIDER = 'claude_routine';

/** Prompt executado pelo gateway: o teto maior vale so para a copia de referencia da rotina. */
function requireApiPromptSize(systemPrompt: string | undefined): void {
  if (systemPrompt !== undefined && systemPrompt.length > API_SYSTEM_PROMPT_MAX) {
    throw new BadRequestException(`systemPrompt must be shorter than or equal to ${API_SYSTEM_PROMPT_MAX} characters`);
  }
}
