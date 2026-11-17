import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, IsUUID, Length, Matches, ValidateIf } from 'class-validator';
import { ROUTINE_FIRE_URL_PATTERN, ROUTINE_TOKEN_PATTERN } from '../providers/claude-routine-fire.adapter';

export const AGENT_EXECUTION_MODES = ['api', 'claude_routine'] as const;
export type AgentExecutionMode = (typeof AGENT_EXECUTION_MODES)[number];

const isApi = (o: { executionMode?: AgentExecutionMode }) => (o.executionMode ?? 'api') === 'api';
const isRoutine = (o: { executionMode?: AgentExecutionMode }) => o.executionMode === 'claude_routine';

/** Prompt executado pelo gateway (agente por chave de API). */
export const API_SYSTEM_PROMPT_MAX = 50000;
/**
 * Copia de referencia do prompt da rotina: nunca executada pelo JBoot, pode ser o prompt inteiro do
 * escritorio (as peticoes iniciais passam de 57 mil caracteres).
 */
export const ROUTINE_REFERENCE_PROMPT_MAX = 120000;

/**
 * `api` (padrao): credencial BYOK, modelo, prompt e tools executados aqui.
 * `claude_routine`: prompt e modelo ficam na rotina do Claude Code do dono; o
 * prompt enviado e so copia de referencia e nunca e executado pelo JBoot.
 */
export class CreateAgentDto {
  @ApiPropertyOptional({ enum: AGENT_EXECUTION_MODES, default: 'api' })
  @IsOptional() @IsIn(AGENT_EXECUTION_MODES) executionMode?: AgentExecutionMode;
  @ValidateIf(isApi) @IsUUID() credentialId?: string;
  @IsString() @Length(1,120) name!: string;
  @IsOptional() @IsString() @Length(0,500) description?: string;
  @ValidateIf(isApi) @IsString() @Matches(/^[a-zA-Z0-9._:-]{1,120}$/) model?: string;
  // No modo rotina e opcional (copia de referencia), mas sempre validado se enviado. O teto do agente
  // por API (API_SYSTEM_PROMPT_MAX) e conferido no servico, que conhece o modo tambem na edicao.
  @ApiProperty({writeOnly:true}) @ValidateIf(o => isApi(o) || o.systemPrompt !== undefined) @IsString() @Length(1,ROUTINE_REFERENCE_PROMPT_MAX) systemPrompt?: string;
  @IsOptional() @IsIn(['text', 'json_schema']) responseMode?: 'text' | 'json_schema';
  @ValidateIf((input: CreateAgentDto) => isApi(input) && input.responseMode !== 'text')
  @IsObject()
  outputSchema?: Record<string,unknown>;
  @IsOptional() @IsArray() @ArrayMaxSize(16) @IsString({ each: true })
  allowedTools?: string[];
  @IsOptional() @IsString() @Length(0,255) externalReference?: string;
  @ValidateIf(isRoutine) @IsString() @Matches(ROUTINE_FIRE_URL_PATTERN, { message: 'routine_fire_url_invalid' }) routineFireUrl?: string;
  @ApiProperty({writeOnly:true}) @ValidateIf(isRoutine) @IsString() @Matches(ROUTINE_TOKEN_PATTERN, { message: 'routine_token_invalid' }) routineToken?: string;
}
export class UpdateAgentDto extends PartialType(CreateAgentDto) {}
