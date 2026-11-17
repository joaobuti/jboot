import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ensureOne } from '../shared/repository-result';

export type NotificationKind =
  | 'card.assigned'
  | 'card.commented'
  | 'card.moved'
  | 'card.document_rejected'
  // CRM de leads, Sprint 4: envio aos administradores e devolucao ao escritorio.
  | 'card.lead_submitted'
  | 'card.lead_returned'
  // CRM de leads, Sprint 6: documento aprovado entregue ao escritorio.
  | 'card.lead_document_approved';

export interface NotificationRow {
  id: string;
  boardId: string;
  cardId: string;
  recipientIdentityId: string;
  actorIdentityId: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATION_SELECT = `id, board_id AS "boardId", card_id AS "cardId",
                              recipient_identity_id AS "recipientIdentityId", actor_identity_id AS "actorIdentityId",
                              kind, payload, read_at AS "readAt", created_at AS "createdAt"`;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(
    databaseRef: string,
    clientId: string,
    params: {
      boardId: string;
      cardId: string;
      recipientIdentityId: string;
      actorIdentityId: string;
      kind: NotificationKind;
      payload: Record<string, unknown>;
    }
  ): Promise<NotificationRow> {
    return ensureOne(
      await this.database.queryForDatabaseRef<NotificationRow>(
        databaseRef,
        `INSERT INTO kanban_notifications (client_id, board_id, card_id, recipient_identity_id, actor_identity_id, kind, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING ${NOTIFICATION_SELECT}`,
        [
          clientId,
          params.boardId,
          params.cardId,
          params.recipientIdentityId,
          params.actorIdentityId,
          params.kind,
          JSON.stringify(params.payload)
        ]
      )
    );
  }

  async listForIdentity(
    databaseRef: string,
    clientId: string,
    identityId: string,
    unreadOnly: boolean
  ): Promise<NotificationRow[]> {
    const result = await this.database.queryForDatabaseRef<NotificationRow>(
      databaseRef,
      `SELECT ${NOTIFICATION_SELECT} FROM kanban_notifications
       WHERE client_id = $1 AND recipient_identity_id = $2 AND ($3 = false OR read_at IS NULL)
       ORDER BY created_at DESC
       LIMIT 50`,
      [clientId, identityId, unreadOnly]
    );
    return result.rows;
  }

  async markRead(databaseRef: string, clientId: string, identityId: string, notificationId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_notifications SET read_at = now()
       WHERE client_id = $1 AND recipient_identity_id = $2 AND id = $3 AND read_at IS NULL`,
      [clientId, identityId, notificationId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(databaseRef: string, clientId: string, identityId: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_notifications SET read_at = now()
       WHERE client_id = $1 AND recipient_identity_id = $2 AND read_at IS NULL`,
      [clientId, identityId]
    );
  }
}
