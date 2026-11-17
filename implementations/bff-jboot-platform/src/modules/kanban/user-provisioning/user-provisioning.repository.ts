import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

export interface ProvisioningCommandRow {
  id: string;
  requestSha256: string;
  state: 'processing' | 'completed' | 'failed';
  identityId: string | null;
  officeIds: string[];
  errorCode: string | null;
  claimed: boolean;
}

@Injectable()
export class UserProvisioningRepository {
  constructor(private readonly database: DatabaseService) {}

  async begin(databaseRef: string, clientId: string, actorId: string, key: string, hash: string) {
    const result = await this.database.queryForDatabaseRef<ProvisioningCommandRow>(databaseRef,
      `WITH inserted AS (
         INSERT INTO kanban_user_provisioning_commands
           (client_id, actor_identity_id, idempotency_key, request_sha256, state)
         VALUES ($1, $2, $3, $4, 'processing')
         ON CONFLICT (client_id, actor_identity_id, idempotency_key) DO NOTHING
         RETURNING *, true AS claimed
       ), retried AS (
         UPDATE kanban_user_provisioning_commands
         SET state = 'processing', error_code = NULL, updated_at = now()
         WHERE client_id = $1 AND actor_identity_id = $2 AND idempotency_key = $3 AND state = 'failed'
           AND NOT EXISTS (SELECT 1 FROM inserted)
         RETURNING *, true AS claimed
       ), existing AS (
         SELECT *, false AS claimed FROM kanban_user_provisioning_commands
         WHERE client_id = $1 AND actor_identity_id = $2 AND idempotency_key = $3
           AND NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM retried)
       )
       SELECT id, request_sha256 AS "requestSha256", state, identity_id AS "identityId",
              office_ids AS "officeIds", error_code AS "errorCode", claimed
       FROM inserted UNION ALL
       SELECT id, request_sha256, state, identity_id, office_ids, error_code, claimed FROM retried UNION ALL
       SELECT id, request_sha256, state, identity_id, office_ids, error_code, claimed FROM existing`,
      [clientId, actorId, key, hash]);
    if (result.rows[0]) return result.rows[0];
    const replay = await this.database.queryForDatabaseRef<ProvisioningCommandRow>(databaseRef,
      `SELECT id, request_sha256 AS "requestSha256", state, identity_id AS "identityId",
              office_ids AS "officeIds", error_code AS "errorCode", false AS claimed
       FROM kanban_user_provisioning_commands
       WHERE client_id = $1 AND actor_identity_id = $2 AND idempotency_key = $3`,
      [clientId, actorId, key]);
    return replay.rows[0];
  }

  async setIdentity(databaseRef: string, commandId: string, identityId: string, officeIds: string[]) {
    await this.database.queryForDatabaseRef(databaseRef,
      `UPDATE kanban_user_provisioning_commands
       SET identity_id = $2, office_ids = $3, updated_at = now() WHERE id = $1`,
      [commandId, identityId, officeIds]);
  }

  async complete(
    databaseRef: string,
    commandId: string,
    context: { clientId: string; identityId: string; ip?: string; userAgent?: string },
    targetIdentityId: string,
    officeIds: string[]
  ) {
    return this.database.transactionForDatabaseRef(databaseRef, async tx => {
      const result = await tx.query<ProvisioningCommandRow>(
        `UPDATE kanban_user_provisioning_commands SET state = 'completed', error_code = NULL, updated_at = now()
         WHERE id = $1 RETURNING id, request_sha256 AS "requestSha256", state,
         identity_id AS "identityId", office_ids AS "officeIds", error_code AS "errorCode", false AS claimed`, [commandId]);
      await tx.query(
        `INSERT INTO kanban_audit_events (client_id, identity_id, event_type, board_id, payload, ip, user_agent)
         VALUES ($1, $2, 'kanban_user_provisioned', NULL, $3::jsonb, $4, $5)`,
        [context.clientId, context.identityId, JSON.stringify({ commandId, targetIdentityId, officeIds }), context.ip ?? null, context.userAgent ?? null]
      );
      return result.rows[0];
    });
  }

  async fail(databaseRef: string, commandId: string, errorCode: string) {
    await this.database.queryForDatabaseRef(databaseRef,
      `UPDATE kanban_user_provisioning_commands SET state = 'failed', error_code = $2, updated_at = now() WHERE id = $1`,
      [commandId, errorCode]);
  }
}
