import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ensureOne } from '../shared/repository-result';
import {
  ColumnAutomationActionConfigDto,
  ColumnAutomationActionType,
  ColumnAutomationRecipientRole,
  ColumnAutomationTriggerConfigDto,
  ColumnAutomationTriggerType,
  CreateColumnAutomationRuleDto,
  UpdateColumnAutomationRuleDto
} from './dto/automation-rule.dto';

export interface ColumnAutomationRuleRow {
  id: string;
  clientId: string;
  boardId: string;
  boardColumnId: string;
  triggerType: ColumnAutomationTriggerType;
  actionType: ColumnAutomationActionType;
  recipientRole: ColumnAutomationRecipientRole | null;
  actionConfig: ColumnAutomationActionConfigDto;
  triggerConfig: ColumnAutomationTriggerConfigDto;
  isActive: boolean;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
}

const RULE_SELECT = `id, client_id AS "clientId", board_id AS "boardId", board_column_id AS "boardColumnId",
                      trigger_type AS "triggerType", action_type AS "actionType", recipient_role AS "recipientRole",
                      action_config AS "actionConfig", trigger_config AS "triggerConfig", is_active AS "isActive",
                      created_by_identity_id AS "createdByIdentityId", created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class AutomationRulesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    databaseRef: string,
    clientId: string,
    boardId: string,
    boardColumnId: string
  ): Promise<ColumnAutomationRuleRow[]> {
    const result = await this.database.queryForDatabaseRef<ColumnAutomationRuleRow>(
      databaseRef,
      `SELECT ${RULE_SELECT} FROM kanban_column_automation_rules
       WHERE client_id = $1 AND board_id = $2 AND board_column_id = $3
       ORDER BY created_at`,
      [clientId, boardId, boardColumnId]
    );
    return result.rows;
  }

  async findById(
    databaseRef: string,
    clientId: string,
    boardId: string,
    boardColumnId: string,
    ruleId: string
  ): Promise<ColumnAutomationRuleRow | null> {
    const result = await this.database.queryForDatabaseRef<ColumnAutomationRuleRow>(
      databaseRef,
      `SELECT ${RULE_SELECT} FROM kanban_column_automation_rules
       WHERE client_id = $1 AND board_id = $2 AND board_column_id = $3 AND id = $4`,
      [clientId, boardId, boardColumnId, ruleId]
    );
    return result.rows[0] ?? null;
  }

  async create(
    databaseRef: string,
    clientId: string,
    boardId: string,
    boardColumnId: string,
    dto: CreateColumnAutomationRuleDto,
    createdByIdentityId: string
  ): Promise<ColumnAutomationRuleRow> {
    return ensureOne(
      await this.database.queryForDatabaseRef<ColumnAutomationRuleRow>(
        databaseRef,
        `INSERT INTO kanban_column_automation_rules
           (client_id, board_id, board_column_id, trigger_type, action_type, recipient_role, action_config, trigger_config, is_active, created_by_identity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
         RETURNING ${RULE_SELECT}`,
        [
          clientId,
          boardId,
          boardColumnId,
          dto.triggerType,
          dto.actionType,
          dto.recipientRole ?? null,
          JSON.stringify(dto.actionConfig ?? {}),
          JSON.stringify(dto.triggerConfig ?? {}),
          dto.isActive ?? true,
          createdByIdentityId
        ]
      )
    );
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    boardColumnId: string,
    ruleId: string,
    dto: UpdateColumnAutomationRuleDto
  ): Promise<ColumnAutomationRuleRow> {
    return ensureOne(
      await this.database.queryForDatabaseRef<ColumnAutomationRuleRow>(
        databaseRef,
        `UPDATE kanban_column_automation_rules
         SET trigger_type = COALESCE($5, trigger_type),
             action_type = COALESCE($6, action_type),
             recipient_role = CASE WHEN COALESCE($6, action_type) IN ('execute_ai_agent','move_card','require_to_enter') THEN NULL ELSE COALESCE($7, recipient_role) END,
             action_config = COALESCE($8::jsonb, action_config),
             trigger_config = COALESCE($9::jsonb, trigger_config),
             is_active = COALESCE($10, is_active),
             updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND board_column_id = $3 AND id = $4
         RETURNING ${RULE_SELECT}`,
        [
          clientId,
          boardId,
          boardColumnId,
          ruleId,
          dto.triggerType ?? null,
          dto.actionType ?? null,
          dto.recipientRole ?? null,
          dto.actionConfig !== undefined ? JSON.stringify(dto.actionConfig) : null,
          dto.triggerConfig !== undefined ? JSON.stringify(dto.triggerConfig) : null,
          dto.isActive ?? null
        ]
      )
    );
  }

  async softDelete(databaseRef: string, clientId: string, boardId: string, boardColumnId: string, ruleId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_column_automation_rules
       SET is_active = false, updated_at = now()
       WHERE client_id = $1 AND board_id = $2 AND board_column_id = $3 AND id = $4`,
      [clientId, boardId, boardColumnId, ruleId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Usado pelo hook de cards.service.ts::move(): regras ativas de column_entered
  // para a coluna de destino, independente de qual board_id/columnId veio na URL
  // (o hook so tem o id da coluna de destino).
  async findActiveForColumnEntered(
    databaseRef: string,
    clientId: string,
    boardColumnId: string
  ): Promise<ColumnAutomationRuleRow[]> {
    return this.findActiveForTrigger(databaseRef, clientId, boardColumnId, 'column_entered');
  }

  // Sprint 9: regras ativas de column_left para a coluna de ORIGEM (o hook em
  // cards.service.ts::move() ja tem card.boardColumnId em escopo, sem query extra).
  async findActiveForColumnLeft(databaseRef: string, clientId: string, boardColumnId: string): Promise<ColumnAutomationRuleRow[]> {
    return this.findActiveForTrigger(databaseRef, clientId, boardColumnId, 'column_left');
  }

  // Sprint 9: regras ativas de juridico_process_moved para a coluna atual do card
  // no momento em que DomainIntegrationsService.notifyProcessChanged() grava o
  // system_event juridico_process_changed.
  async findActiveForJuridicoProcessMoved(
    databaseRef: string,
    clientId: string,
    boardColumnId: string
  ): Promise<ColumnAutomationRuleRow[]> {
    return this.findActiveForTrigger(databaseRef, clientId, boardColumnId, 'juridico_process_moved');
  }

  private async findActiveForTrigger(
    databaseRef: string,
    clientId: string,
    boardColumnId: string,
    triggerType: ColumnAutomationTriggerType
  ): Promise<ColumnAutomationRuleRow[]> {
    const result = await this.database.queryForDatabaseRef<ColumnAutomationRuleRow>(
      databaseRef,
      `SELECT ${RULE_SELECT} FROM kanban_column_automation_rules
       WHERE client_id = $1 AND board_column_id = $2 AND trigger_type = $3 AND is_active = true`,
      [clientId, boardColumnId, triggerType]
    );
    return result.rows;
  }
}
