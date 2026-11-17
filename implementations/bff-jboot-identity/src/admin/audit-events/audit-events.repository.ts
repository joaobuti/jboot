import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { PageQuery } from '../admin.types';

@Injectable()
export class AuditEventsRepository {
  constructor(private readonly database: DatabaseService) {}

  list(query: PageQuery) {
    return this.database.query(
      `SELECT id, occurred_at AS "occurredAt", event_type AS "eventType",
              identity_id AS "identityId", client_id AS "clientId",
              application_id AS "applicationId", session_context_id AS "sessionContextId",
              ip::text, user_agent AS "userAgent", metadata
       FROM audit_events
       WHERE ($3::text IS NULL OR event_type ILIKE '%' || $3 || '%')
       ORDER BY occurred_at DESC
       LIMIT $1 OFFSET $2`,
      [query.limit, query.offset, query.search ?? null]
    );
  }
}
