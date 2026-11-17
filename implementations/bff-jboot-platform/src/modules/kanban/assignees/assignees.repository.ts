import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ensureOne } from '../shared/repository-result';

export interface CardAssigneeRow {
  id: string;
  cardId: string;
  identityId: string;
  assignedByIdentityId: string;
  createdAt: string;
}

const ASSIGNEE_SELECT = `id, card_id AS "cardId", identity_id AS "identityId",
                          assigned_by_identity_id AS "assignedByIdentityId", created_at AS "createdAt"`;

@Injectable()
export class AssigneesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(databaseRef: string, clientId: string, cardId: string): Promise<CardAssigneeRow[]> {
    const result = await this.database.queryForDatabaseRef<CardAssigneeRow>(
      databaseRef,
      `SELECT ${ASSIGNEE_SELECT} FROM kanban_card_assignees
       WHERE client_id = $1 AND card_id = $2
       ORDER BY created_at`,
      [clientId, cardId]
    );
    return result.rows;
  }

  async create(
    databaseRef: string,
    clientId: string,
    cardId: string,
    identityId: string,
    assignedByIdentityId: string
  ): Promise<CardAssigneeRow> {
    return ensureOne(
      await this.database.queryForDatabaseRef<CardAssigneeRow>(
        databaseRef,
        `INSERT INTO kanban_card_assignees (client_id, card_id, identity_id, assigned_by_identity_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id, card_id, identity_id) DO UPDATE SET assigned_by_identity_id = EXCLUDED.assigned_by_identity_id
         RETURNING ${ASSIGNEE_SELECT}`,
        [clientId, cardId, identityId, assignedByIdentityId]
      )
    );
  }

  async remove(databaseRef: string, clientId: string, cardId: string, identityId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `DELETE FROM kanban_card_assignees WHERE client_id = $1 AND card_id = $2 AND identity_id = $3`,
      [clientId, cardId, identityId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
