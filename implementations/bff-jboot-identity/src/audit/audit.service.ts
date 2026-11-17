import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface AuditEventInput {
  eventType: string;
  identityId?: string;
  clientId?: string;
  applicationId?: string;
  sessionContextId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly database: DatabaseService) {}

  async record(input: AuditEventInput): Promise<void> {
    await this.database.query(
      `INSERT INTO audit_events (
        event_type, identity_id, client_id, application_id, session_context_id, ip, user_agent, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.eventType,
        input.identityId ?? null,
        input.clientId ?? null,
        input.applicationId ?? null,
        input.sessionContextId ?? null,
        input.ip ?? null,
        input.userAgent ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }
}

