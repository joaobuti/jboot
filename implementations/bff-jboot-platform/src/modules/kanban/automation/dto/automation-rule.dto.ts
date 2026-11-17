import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { CUSTOMER_DOCUMENT_TYPES, CustomerDocumentType } from '../../customer-documents/customer-document-catalog';

export type ColumnAutomationTriggerType =
  | 'column_entered'
  | 'due_date_approaching'
  | 'card_stale'
  | 'column_left'
  | 'ai_completed'
  | 'juridico_process_moved'
  | 'signed_kit_approved'
  | 'djen_publication_received';
export type ColumnAutomationActionType = 'send_email_notification' | 'execute_ai_agent' | 'move_card' | 'require_to_enter';
export type ColumnAutomationRecipientRole = 'assignee' | 'creator' | 'board_member';

export const TRIGGER_TYPES: ColumnAutomationTriggerType[] = [
  'column_entered',
  'due_date_approaching',
  'card_stale',
  'column_left',
  'ai_completed',
  'juridico_process_moved',
  'signed_kit_approved',
  // Publicacao nova do DJEN no processo do card (ADR 022, Sprint 8 de process-monitoring-sprints.md).
  'djen_publication_received'
];
const ACTION_TYPES: ColumnAutomationActionType[] = ['send_email_notification', 'execute_ai_agent', 'move_card', 'require_to_enter'];

/**
 * Requisitos de entrada da coluna (docs/product/flow-signed-kit-sprints.md, S1): regra `require_to_enter`.
 * `customer_hiscon`: cliente do card com HISCON atual na ficha. `signed_kit` (S2): kit mais recente do cliente
 * com o assinado atual aprovado pelo Validador de assinatura e confirmado por uma pessoa.
 */
export type EntryRequirement = 'customer_hiscon' | 'signed_kit';
export const ENTRY_REQUIREMENTS: EntryRequirement[] = ['customer_hiscon', 'signed_kit'];
const RECIPIENT_ROLES: ColumnAutomationRecipientRole[] = ['assignee', 'creator', 'board_member'];

/**
 * Resultado esperado da regra "Executar agente" (ADR 020): define a ferramenta que encerra a execucao
 * e o que e concluir sem erro. `comment`: comentario com run_id (rotina) ou agente de chave de API
 * concluido; `action_analysis`: flow_submit_action_analysis; `initial_petitions`: peticoes da rotina.
 */
export type AutomationExpectedResult = 'comment' | 'action_analysis' | 'initial_petitions';
export const EXPECTED_RESULTS: AutomationExpectedResult[] = ['comment', 'action_analysis', 'initial_petitions'];
/** Quem gera o documento em `initial_petitions` (ADR 020): o Flow monta o .docx ou a rotina envia o arquivo. */
export type AutomationDocumentGenerator = 'flow' | 'ai';
export const DOCUMENT_GENERATORS: AutomationDocumentGenerator[] = ['flow', 'ai'];

export class ColumnAutomationActionConfigDto {
  @ApiPropertyOptional({ description: 'move_card: coluna ativa de destino no mesmo board' })
  @IsOptional()
  @IsUUID()
  toBoardColumnId?: string;

  @ApiPropertyOptional({ description: 'Obrigatorio quando recipientRole = board_member' })
  @IsOptional()
  @IsUUID()
  boardMemberIdentityId?: string;

  @ApiPropertyOptional({ description: 'Agente versionado do AI Gateway' })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({
    enum: ['api_key', 'claude_routine'],
    description: 'api_key: chave BYOK no gateway. claude_routine: rotina do Claude Code do dono (assinatura Claude).'
  })
  @IsOptional()
  @IsIn(['api_key', 'claude_routine'])
  connectionMode?: 'api_key' | 'claude_routine';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  inputPolicyVersion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toolPolicyVersion?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: CUSTOMER_DOCUMENT_TYPES,
    description: 'Rotina: documentos do cliente do card que ela pode ler (ADR 019). Ausente = todos os validados.'
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CUSTOMER_DOCUMENT_TYPES, { each: true })
  customerDocumentTypes?: CustomerDocumentType[];

  @ApiPropertyOptional({
    enum: EXPECTED_RESULTS,
    description:
      'execute_ai_agent (obrigatorio): comment conclui pelo comentario com run_id ou agente de chave de API concluido; ' +
      'action_analysis e initial_petitions so com claude_routine e concluem pela ferramenta propria do conector.'
  })
  @IsOptional()
  @IsIn(EXPECTED_RESULTS)
  expectedResult?: AutomationExpectedResult;

  @ApiPropertyOptional({
    enum: DOCUMENT_GENERATORS,
    description: 'So em expectedResult = initial_petitions. flow (padrao): o Flow monta o .docx; ai: a rotina envia o arquivo.'
  })
  @IsOptional()
  @IsIn(DOCUMENT_GENERATORS)
  documentGenerator?: AutomationDocumentGenerator;

  @ApiPropertyOptional({
    type: [String],
    enum: ENTRY_REQUIREMENTS,
    description: 'require_to_enter (obrigatorio, ao menos um): o que o card precisa cumprir para entrar na coluna.'
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ENTRY_REQUIREMENTS, { each: true })
  requirements?: EntryRequirement[];
}

// trigger_config e separado de action_config: e a configuracao da condicao de
// disparo (quando avaliar), nunca da acao (quem recebe). Ver
// docs/product/kanban-sprint-9-gate.md, secao "PE Decision — Modelo De
// Dados". Validacao de faixa (N >= 0 / X > 0) e feita no
// AutomationRulesService (requireValidTriggerConfig), no mesmo padrao ja
// usado para action_config/recipientRole (requireValidRecipientConfig) —
// mantem a mesma fonte de verdade de validacao "por combinacao de campos" em
// vez de decorators condicionais em cima de um DTO parcial (update aceita
// payload parcial, entao a validacao de faixa precisa do valor efetivo apos
// merge com a regra existente, nao so do payload isolado).
export class ColumnAutomationTriggerConfigDto {
  @ApiPropertyOptional({ description: 'due_date_approaching: dias antes de Card.due_date. Inteiro >= 0.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  daysBefore?: number;

  @ApiPropertyOptional({ description: 'card_stale: dias parado na coluna atual. Inteiro > 0.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  daysStale?: number;
}

export class CreateColumnAutomationRuleDto {
  @ApiProperty({ enum: TRIGGER_TYPES })
  @IsIn(TRIGGER_TYPES)
  triggerType!: ColumnAutomationTriggerType;

  @ApiProperty({ enum: ACTION_TYPES })
  @IsIn(ACTION_TYPES)
  actionType!: ColumnAutomationActionType;

  @ApiPropertyOptional({ enum: RECIPIENT_ROLES })
  @IsOptional()
  @IsIn(RECIPIENT_ROLES)
  recipientRole?: ColumnAutomationRecipientRole;

  @ApiPropertyOptional({ type: ColumnAutomationActionConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnAutomationActionConfigDto)
  actionConfig?: ColumnAutomationActionConfigDto;

  @ApiPropertyOptional({
    type: ColumnAutomationTriggerConfigDto,
    description: '{daysBefore:N} para due_date_approaching, {daysStale:X} para card_stale, {} para os demais.'
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnAutomationTriggerConfigDto)
  triggerConfig?: ColumnAutomationTriggerConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateColumnAutomationRuleDto {
  @ApiPropertyOptional({ enum: TRIGGER_TYPES })
  @IsOptional()
  @IsIn(TRIGGER_TYPES)
  triggerType?: ColumnAutomationTriggerType;

  @ApiPropertyOptional({ enum: ACTION_TYPES })
  @IsOptional()
  @IsIn(ACTION_TYPES)
  actionType?: ColumnAutomationActionType;

  @ApiPropertyOptional({ enum: RECIPIENT_ROLES })
  @IsOptional()
  @IsIn(RECIPIENT_ROLES)
  recipientRole?: ColumnAutomationRecipientRole;

  @ApiPropertyOptional({ type: ColumnAutomationActionConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnAutomationActionConfigDto)
  actionConfig?: ColumnAutomationActionConfigDto;

  @ApiPropertyOptional({ type: ColumnAutomationTriggerConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ColumnAutomationTriggerConfigDto)
  triggerConfig?: ColumnAutomationTriggerConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
