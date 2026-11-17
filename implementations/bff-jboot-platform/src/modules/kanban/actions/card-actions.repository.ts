import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { MutateContext } from '../kanban.types';

export interface ColumnActionAssignment {
  columnId: string;
  actionId: string;
  /** Agente da acao que exige configuracao (`config: 'routine_agent'` no catalogo); `null` nas demais. */
  agentId: string | null;
  configuredByIdentityId: string;
}

/** Configuracao da acao na coluna, gravada em `kanban_column_actions.config`. */
export interface ColumnActionConfig { agentId?: string }

/** Atribuicao conferida na execucao: configuracao e quem configurou (conta executora das acoes de IA). */
export interface ExecutableAssignment { config: ColumnActionConfig; configuredByIdentityId: string }

@Injectable()
export class CardActionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(databaseRef: string, clientId: string, boardId: string, columnIds: string[]): Promise<ColumnActionAssignment[]> {
    const result = await this.database.queryForDatabaseRef<ColumnActionAssignment>(databaseRef,
      `SELECT column_id AS "columnId", action_id AS "actionId", config->>'agentId' AS "agentId",
              configured_by_identity_id AS "configuredByIdentityId"
       FROM kanban_column_actions
       WHERE client_id = $1 AND board_id = $2 AND column_id = ANY($3::uuid[])
       ORDER BY column_id, action_id`, [clientId, boardId, columnIds]);
    return result.rows;
  }

  /** `configs[actionId]`: configuracao das acoes que a exigem; as demais gravam `{}`. */
  async replace(
    context: MutateContext, boardId: string, columnId: string, actionIds: string[], configs: Record<string, ColumnActionConfig> = {}
  ): Promise<void> {
    await this.database.transactionForDatabaseRef(context.databaseRef, async client => {
      await this.lockColumn(client, context.clientId, boardId, columnId);
      await client.query(`DELETE FROM kanban_column_actions WHERE client_id = $1 AND board_id = $2 AND column_id = $3`,
        [context.clientId, boardId, columnId]);
      await client.query(
        `INSERT INTO kanban_column_actions (client_id, board_id, column_id, action_id, configured_by_identity_id, config)
         SELECT $1, $2, $3, action_id, $5, COALESCE(($6::jsonb)->action_id, '{}'::jsonb) FROM unnest($4::text[]) AS action_id`,
        [context.clientId, boardId, columnId, actionIds, context.identityId, JSON.stringify(configs)]);
      await this.audit(client, context, boardId, 'kanban_column_actions_replaced', { columnId, actionIds, configs });
    });
  }

  /**
   * Lock the current card and column through authorization confirmation + audit. No external effects.
   * Devolve a configuracao da acao na coluna (agente e conta executora das acoes de IA).
   */
  async confirmExecution(context: MutateContext, boardId: string, cardId: string, columnId: string, actionId: string): Promise<ExecutableAssignment> {
    return this.database.transactionForDatabaseRef(context.databaseRef, async client => {
      const card = await client.query<{ columnId: string }>(
        `SELECT board_column_id AS "columnId" FROM kanban_cards
         WHERE client_id = $1 AND board_id = $2 AND id = $3 AND status = 'active' FOR UPDATE`,
        [context.clientId, boardId, cardId]);
      if (!card.rows[0]) throw new NotFoundException('Card not found');
      if (card.rows[0].columnId !== columnId) {
        throw new ConflictException({ code: 'card_action_column_changed', message: 'O card mudou de coluna. Atualize o board.' });
      }
      await this.lockColumn(client, context.clientId, boardId, columnId);
      const assignment = await client.query<ExecutableAssignment>(
        `SELECT config, configured_by_identity_id AS "configuredByIdentityId" FROM kanban_column_actions
         WHERE client_id = $1 AND board_id = $2 AND column_id = $3 AND action_id = $4`,
        [context.clientId, boardId, columnId, actionId]);
      if (!assignment.rows.length) {
        throw new ConflictException({ code: 'card_action_not_assigned', message: 'Ação não atribuída à coluna atual do card' });
      }
      await this.audit(client, context, boardId, 'kanban_card_action_executed', { cardId, columnId, actionId });
      return assignment.rows[0];
    });
  }

  async isAssigned(databaseRef: string, clientId: string, boardId: string, columnId: string, actionId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(databaseRef,
      `SELECT 1 FROM kanban_column_actions WHERE client_id = $1 AND board_id = $2 AND column_id = $3 AND action_id = $4`,
      [clientId, boardId, columnId, actionId]);
    return result.rows.length > 0;
  }

  private async lockColumn(client: PoolClient, clientId: string, boardId: string, columnId: string): Promise<void> {
    const column = await client.query(
      `SELECT id FROM kanban_board_columns WHERE client_id = $1 AND board_id = $2 AND id = $3 AND status = 'active' FOR UPDATE`,
      [clientId, boardId, columnId]);
    if (!column.rows.length) throw new NotFoundException('Column not found');
  }

  private async audit(client: PoolClient, context: MutateContext, boardId: string, eventType: string, payload: object): Promise<void> {
    await client.query(
      `INSERT INTO kanban_audit_events (client_id, identity_id, event_type, board_id, payload, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [context.clientId, context.identityId, eventType, boardId, JSON.stringify(payload), context.ip ?? null, context.userAgent ?? null]);
  }
}
