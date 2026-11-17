import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { MutateContext } from '../kanban.types';

@Injectable()
export class KanbanAuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(
    eventType: string,
    context: MutateContext,
    boardId: string | null,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.database.queryForDatabaseRef(
      context.databaseRef,
      `INSERT INTO kanban_audit_events (client_id, identity_id, event_type, board_id, payload, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        context.clientId,
        context.identityId,
        eventType,
        boardId,
        JSON.stringify(payload),
        context.ip ?? null,
        context.userAgent ?? null
      ]
    );
  }
}
