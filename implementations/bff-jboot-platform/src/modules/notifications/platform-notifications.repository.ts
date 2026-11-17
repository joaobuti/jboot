import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ensureOne } from '../kanban/shared/repository-result';
import { PlatformNotificationRow, PublishPlatformNotificationInput } from './notifications.types';

const NOTIFICATION_SELECT = `id,
  client_id AS "clientId",
  application_slug AS "applicationSlug",
  module_slug AS "moduleSlug",
  recipient_identity_id AS "recipientIdentityId",
  actor_identity_id AS "actorIdentityId",
  kind,
  title,
  body,
  entity_type AS "entityType",
  entity_id AS "entityId",
  action_url AS "actionUrl",
  severity,
  payload,
  read_at AS "readAt",
  created_at AS "createdAt"`;

@Injectable()
export class PlatformNotificationsRepository {
  constructor(private readonly database: DatabaseService) {}

  async create(input: PublishPlatformNotificationInput): Promise<PlatformNotificationRow> {
    return ensureOne(
      await this.database.queryIdentity<PlatformNotificationRow>(
        `INSERT INTO platform_notifications (
           client_id, application_slug, module_slug, recipient_identity_id, actor_identity_id,
           kind, title, body, entity_type, entity_id, action_url, severity, payload
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
         RETURNING ${NOTIFICATION_SELECT}`,
        [
          input.clientId,
          input.applicationSlug,
          input.moduleSlug ?? null,
          input.recipientIdentityId,
          input.actorIdentityId ?? null,
          input.kind,
          input.title,
          input.body ?? null,
          input.entityType ?? null,
          input.entityId ?? null,
          input.actionUrl ?? null,
          input.severity ?? 'info',
          JSON.stringify(input.payload ?? {})
        ]
      )
    );
  }

  async listForIdentity(
    clientId: string,
    identityId: string,
    filters: { applicationSlug?: string; moduleSlug?: string; unreadOnly?: boolean }
  ): Promise<PlatformNotificationRow[]> {
    const result = await this.database.queryIdentity<PlatformNotificationRow>(
      `SELECT ${NOTIFICATION_SELECT}
       FROM platform_notifications
       WHERE client_id = $1
         AND recipient_identity_id = $2
         AND ($3::text IS NULL OR application_slug = $3)
         AND ($4::text IS NULL OR module_slug = $4)
         AND ($5::boolean = false OR read_at IS NULL)
       ORDER BY created_at DESC
       LIMIT 50`,
      [clientId, identityId, filters.applicationSlug ?? null, filters.moduleSlug ?? null, filters.unreadOnly ?? false]
    );
    return result.rows;
  }

  async unreadCount(
    clientId: string,
    identityId: string,
    filters: { applicationSlug?: string; moduleSlug?: string }
  ): Promise<number> {
    const result = await this.database.queryIdentity<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM platform_notifications
       WHERE client_id = $1
         AND recipient_identity_id = $2
         AND read_at IS NULL
         AND ($3::text IS NULL OR application_slug = $3)
         AND ($4::text IS NULL OR module_slug = $4)`,
      [clientId, identityId, filters.applicationSlug ?? null, filters.moduleSlug ?? null]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async markRead(clientId: string, identityId: string, notificationId: string): Promise<boolean> {
    const result = await this.database.queryIdentity(
      `UPDATE platform_notifications
       SET read_at = now()
       WHERE client_id = $1 AND recipient_identity_id = $2 AND id = $3 AND read_at IS NULL`,
      [clientId, identityId, notificationId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(
    clientId: string,
    identityId: string,
    filters: { applicationSlug?: string; moduleSlug?: string }
  ): Promise<void> {
    await this.database.queryIdentity(
      `UPDATE platform_notifications
       SET read_at = now()
       WHERE client_id = $1
         AND recipient_identity_id = $2
         AND read_at IS NULL
         AND ($3::text IS NULL OR application_slug = $3)
         AND ($4::text IS NULL OR module_slug = $4)`,
      [clientId, identityId, filters.applicationSlug ?? null, filters.moduleSlug ?? null]
    );
  }
}
