import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ColumnsRepository } from '../columns/columns.repository';
import { MembersRepository } from '../members/members.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { AutomationRulesRepository } from './automation-rules.repository';
import { CreateColumnAutomationRuleDto, UpdateColumnAutomationRuleDto } from './dto/automation-rule.dto';

/** Politica do modo rotina: sem tools do JBoot; escrita so pelo conector MCP. */
export const CLAUDE_ROUTINE_TOOL_POLICY = 'claude_routine.v1';

/** Peticoes iniciais sem gerador informado: o Flow monta o documento (padrao da ADR 020). */
function withDefaultGenerator(actionConfig: { expectedResult?: string; documentGenerator?: string } | undefined): void {
  if (actionConfig?.expectedResult === 'initial_petitions' && actionConfig.documentGenerator === undefined) {
    actionConfig.documentGenerator = 'flow';
  }
}

@Injectable()
export class AutomationRulesService {
  constructor(
    private readonly repository: AutomationRulesRepository,
    private readonly columns: ColumnsRepository,
    private readonly members: MembersRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, columnId: string) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireColumn(context, boardId, columnId);
    return this.repository.list(context.databaseRef, context.clientId, boardId, columnId);
  }

  async create(
    context: KanbanRequestContext,
    boardId: string,
    columnId: string,
    dto: CreateColumnAutomationRuleDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireColumn(context, boardId, columnId);
    await this.requireValidActionConfig(context, boardId, columnId, dto.actionType, dto.triggerType, dto.recipientRole, dto.actionConfig);
    await this.requireMovementDestination(context, boardId, columnId, dto.actionType, dto.actionConfig);
    this.requireValidTriggerConfig(dto.triggerType, dto.triggerConfig);
    withDefaultGenerator(dto.actionConfig);

    const rule = await this.repository.create(context.databaseRef, context.clientId, boardId, columnId, dto, context.identityId);
    await this.audit.record('kanban_column_automation_rule_created', mutate, boardId, {
      ruleId: rule.id,
      boardColumnId: columnId,
      triggerType: rule.triggerType,
      actionType: rule.actionType,
      ...(rule.recipientRole ? { recipientRole: rule.recipientRole } : {})
    });
    return rule;
  }

  async update(
    context: KanbanRequestContext,
    boardId: string,
    columnId: string,
    ruleId: string,
    dto: UpdateColumnAutomationRuleDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireColumn(context, boardId, columnId);
    const existing = await this.requireRule(context, boardId, columnId, ruleId);
    if (dto.isActive !== false) await this.requireMovementDestination(context, boardId, columnId, dto.actionType ?? existing.actionType, dto.actionConfig ?? existing.actionConfig);

    if (
      dto.actionType !== undefined ||
      dto.triggerType !== undefined ||
      dto.recipientRole !== undefined ||
      dto.actionConfig !== undefined
    ) {
      await this.requireValidActionConfig(
        context,
        boardId,
        columnId,
        dto.actionType ?? existing.actionType,
        dto.triggerType ?? existing.triggerType,
        (dto.actionType ?? existing.actionType) === 'send_email_notification'
          ? dto.recipientRole ?? existing.recipientRole ?? undefined : dto.recipientRole,
        dto.actionConfig ?? existing.actionConfig
      );
    }
    if (dto.triggerType !== undefined || dto.triggerConfig !== undefined) {
      this.requireValidTriggerConfig(dto.triggerType ?? existing.triggerType, dto.triggerConfig ?? existing.triggerConfig);
    }

    withDefaultGenerator(dto.actionConfig);
    const rule = await this.repository.update(context.databaseRef, context.clientId, boardId, columnId, ruleId, dto);
    await this.audit.record('kanban_column_automation_rule_updated', mutate, boardId, { ruleId, ...dto });
    return rule;
  }

  async remove(context: KanbanRequestContext, boardId: string, columnId: string, ruleId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireColumn(context, boardId, columnId);
    await this.requireRule(context, boardId, columnId, ruleId);

    await this.repository.softDelete(context.databaseRef, context.clientId, boardId, columnId, ruleId);
    await this.audit.record('kanban_column_automation_rule_removed', mutate, boardId, { ruleId });
  }

  private async requireColumn(context: KanbanRequestContext, boardId: string, columnId: string) {
    const column = await this.columns.findById(context.databaseRef, context.clientId, boardId, columnId);
    if (!column) {
      throw new NotFoundException('Board column not found');
    }
    return column;
  }

  private async requireMovementDestination(
    context: KanbanRequestContext, boardId: string, columnId: string, actionType: string,
    config: { toBoardColumnId?: string } | undefined
  ): Promise<void> {
    if (actionType !== 'move_card') return;
    if (!config?.toBoardColumnId || config.toBoardColumnId === columnId) {
      throw new BadRequestException('Selecione uma coluna de destino diferente da origem');
    }
    const destination = await this.columns.findById(context.databaseRef, context.clientId, boardId, config.toBoardColumnId);
    if (!destination || destination.status !== 'active') throw new BadRequestException('Coluna de destino deve estar ativa neste board');
  }

  private async requireRule(context: KanbanRequestContext, boardId: string, columnId: string, ruleId: string) {
    const rule = await this.repository.findById(context.databaseRef, context.clientId, boardId, columnId, ruleId);
    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }
    return rule;
  }

  private async requireValidActionConfig(
    context: KanbanRequestContext,
    boardId: string,
    columnId: string,
    actionType: string,
    triggerType: string,
    recipientRole: string | undefined,
    actionConfig: {
      boardMemberIdentityId?: string;
      agentId?: string;
      connectionMode?: string;
      inputPolicyVersion?: number;
      toolPolicyVersion?: string;
      customerDocumentTypes?: string[];
      expectedResult?: string;
      documentGenerator?: string;
      toBoardColumnId?: string;
      requirements?: string[];
    } | undefined
  ): Promise<void> {
    if (triggerType === 'ai_completed' && actionType !== 'move_card') {
      throw new BadRequestException('ai_completed requires move_card');
    }
    // Kit assinado aprovado (flow-signed-kit-sprints.md, S3): o card anda; nada mais reage ao evento.
    if (triggerType === 'signed_kit_approved' && actionType !== 'move_card') {
      throw new BadRequestException('signed_kit_approved requires move_card');
    }
    // Requisitos de entrada (flow-signed-kit-sprints.md, S1): so ao entrar, sem destinatario e so a lista.
    if (actionType === 'require_to_enter') {
      if (triggerType !== 'column_entered') throw new BadRequestException('require_to_enter supports only column_entered');
      if (recipientRole !== undefined) throw new BadRequestException('recipientRole is not allowed for require_to_enter');
      if (!actionConfig?.requirements?.length) throw new BadRequestException('require_to_enter requires at least one requirement');
      // DTO transformado traz os campos declarados como chaves `undefined`: so conta o que veio preenchido.
      const extra = Object.entries(actionConfig).filter(([key, value]) => key !== 'requirements' && value !== undefined);
      if (extra.length > 0) throw new BadRequestException('require_to_enter accepts only requirements');
      return;
    }
    if (actionConfig?.requirements !== undefined) {
      throw new BadRequestException('requirements is allowed only for require_to_enter');
    }
    if (actionType === 'move_card') {
      if (recipientRole !== undefined) throw new BadRequestException('recipientRole is not allowed for move_card');
      if (!actionConfig?.toBoardColumnId) throw new BadRequestException('move_card requires toBoardColumnId');
      if (actionConfig.agentId !== undefined || actionConfig.expectedResult !== undefined || actionConfig.customerDocumentTypes !== undefined) {
        throw new BadRequestException('move_card accepts only toBoardColumnId');
      }
      return;
    }
    if (actionConfig?.toBoardColumnId !== undefined) {
      throw new BadRequestException('toBoardColumnId is allowed only for move_card');
    }
    if (actionType === 'execute_ai_agent') {
      if (!['column_entered', 'column_left'].includes(triggerType)) {
        throw new BadRequestException('execute_ai_agent supports only column_entered and column_left');
      }
      // Rotina: a rotina so recebe ids e escreve pelo conector MCP (politica propria).
      const expectedToolPolicy = actionConfig?.connectionMode === 'claude_routine' ? CLAUDE_ROUTINE_TOOL_POLICY : '2026-10-15.v1';
      if (
        !actionConfig?.agentId ||
        !['api_key', 'claude_routine'].includes(actionConfig.connectionMode ?? '') ||
        actionConfig.inputPolicyVersion !== 1 ||
        !(actionConfig.connectionMode === 'claude_routine'
          ? actionConfig.toolPolicyVersion === expectedToolPolicy
          : ['2026-10-15.v1', '2026-10-21.v1'].includes(actionConfig.toolPolicyVersion ?? ''))
      ) {
        throw new BadRequestException('Invalid execute_ai_agent actionConfig');
      }
      if (recipientRole !== undefined) {
        throw new BadRequestException('recipientRole is not allowed for execute_ai_agent');
      }
      // Documentos do cliente so chegam a rotina pelo conector (ADR 019).
      if (actionConfig.customerDocumentTypes !== undefined && actionConfig.connectionMode !== 'claude_routine') {
        throw new BadRequestException('customerDocumentTypes is allowed only for claude_routine');
      }
      // Resultado esperado (ADR 020): define quem encerra a execucao. Analise de acoes e peticoes
      // chegam so pelas ferramentas do conector, entao exigem rotina Claude.
      if (!actionConfig.expectedResult) {
        throw new BadRequestException('expectedResult is required for execute_ai_agent');
      }
      if (actionConfig.expectedResult !== 'comment' && actionConfig.connectionMode !== 'claude_routine') {
        throw new BadRequestException('expectedResult action_analysis and initial_petitions require claude_routine');
      }
      if (actionConfig.documentGenerator !== undefined && actionConfig.expectedResult !== 'initial_petitions') {
        throw new BadRequestException('documentGenerator is allowed only for expectedResult initial_petitions');
      }
      // O card anda por uma regra propria `ai_completed -> move_card` (flow-ai-completion-sprints.md);
      // a conclusao sem erro e decidida pelo resultado esperado.
      return;
    }
    if (
      actionConfig?.customerDocumentTypes !== undefined ||
      actionConfig?.expectedResult !== undefined ||
      actionConfig?.documentGenerator !== undefined
    ) {
      throw new BadRequestException('customerDocumentTypes, expectedResult and documentGenerator are allowed only for execute_ai_agent');
    }
    if (!recipientRole) {
      throw new BadRequestException('recipientRole is required for send_email_notification');
    }
    if (recipientRole !== 'board_member') {
      return;
    }
    const boardMemberIdentityId = actionConfig?.boardMemberIdentityId;
    if (!boardMemberIdentityId) {
      throw new BadRequestException('actionConfig.boardMemberIdentityId is required when recipientRole is board_member');
    }
    const membership = await this.members.findActiveMembership(
      context.databaseRef,
      context.clientId,
      boardId,
      boardMemberIdentityId
    );
    if (!membership) {
      throw new BadRequestException('actionConfig.boardMemberIdentityId must be an active member of this board');
    }
  }

  // trigger_config e validado aqui (nao so por decorator de DTO) porque o valor
  // efetivo em update() depende do merge com a regra existente (payload parcial
  // pode so trocar triggerType sem reenviar triggerConfig, ou vice-versa) — mesmo
  // padrao de requireValidRecipientConfig acima. Ver
  // docs/product/kanban-sprint-9-gate.md, secao "PE Decision — Modelo De Dados".
  private requireValidTriggerConfig(
    triggerType: string,
    triggerConfig: { daysBefore?: number; daysStale?: number } | undefined
  ): void {
    if (triggerType === 'due_date_approaching') {
      const daysBefore = triggerConfig?.daysBefore;
      if (!Number.isInteger(daysBefore) || (daysBefore as number) < 0) {
        throw new BadRequestException('triggerConfig.daysBefore is required and must be an integer >= 0 for trigger_type due_date_approaching');
      }
      return;
    }
    if (triggerType === 'card_stale') {
      const daysStale = triggerConfig?.daysStale;
      if (!Number.isInteger(daysStale) || (daysStale as number) <= 0) {
        throw new BadRequestException('triggerConfig.daysStale is required and must be an integer > 0 for trigger_type card_stale');
      }
      return;
    }
    // column_entered, column_left, juridico_process_moved, djen_publication_received: sem configuracao adicional.
  }
}
