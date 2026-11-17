import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { BoardColumnPermissionInputDto } from './dto/profile.dto';

export interface BoardColumnPermissionRow {
  id: string;
  profileId: string;
  boardColumnId: string;
  canView: boolean;
  canEdit: boolean;
}

export interface ColumnAccess {
  canView: boolean;
  canEdit: boolean;
}

// Ausencia de linha de ACL para (profileId, boardColumnId) significa "sem
// restricao configurada" -> acesso liberado por padrao. So uma linha
// explicita pode restringir. Isso preserva o comportamento da Sprint 1 em
// boards onde board_admin ainda nao configurou nenhuma ACL.
const DEFAULT_ACCESS: ColumnAccess = { canView: true, canEdit: true };

const PERMISSION_SELECT = `id, profile_id AS "profileId", board_column_id AS "boardColumnId",
                            can_view AS "canView", can_edit AS "canEdit"`;

@Injectable()
export class ColumnPermissionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(databaseRef: string, clientId: string, profileId: string): Promise<BoardColumnPermissionRow[]> {
    const result = await this.database.queryForDatabaseRef<BoardColumnPermissionRow>(
      databaseRef,
      `SELECT ${PERMISSION_SELECT} FROM kanban_board_column_permissions
       WHERE client_id = $1 AND profile_id = $2
       ORDER BY created_at`,
      [clientId, profileId]
    );
    return result.rows;
  }

  async resolveForColumns(
    databaseRef: string,
    clientId: string,
    profileId: string | null,
    boardColumnIds: string[]
  ): Promise<Map<string, ColumnAccess>> {
    const access = new Map<string, ColumnAccess>();
    if (!profileId || boardColumnIds.length === 0) {
      for (const columnId of boardColumnIds) {
        access.set(columnId, DEFAULT_ACCESS);
      }
      return access;
    }

    const result = await this.database.queryForDatabaseRef<{ boardColumnId: string; canView: boolean; canEdit: boolean }>(
      databaseRef,
      `SELECT board_column_id AS "boardColumnId", can_view AS "canView", can_edit AS "canEdit"
       FROM kanban_board_column_permissions
       WHERE client_id = $1 AND profile_id = $2 AND board_column_id = ANY($3::uuid[])`,
      [clientId, profileId, boardColumnIds]
    );
    const configured = new Map(result.rows.map((row) => [row.boardColumnId, { canView: row.canView, canEdit: row.canEdit }]));

    for (const columnId of boardColumnIds) {
      access.set(columnId, configured.get(columnId) ?? DEFAULT_ACCESS);
    }
    return access;
  }

  async resolveForColumn(
    databaseRef: string,
    clientId: string,
    profileId: string | null,
    boardColumnId: string
  ): Promise<ColumnAccess> {
    const access = await this.resolveForColumns(databaseRef, clientId, profileId, [boardColumnId]);
    return access.get(boardColumnId) ?? DEFAULT_ACCESS;
  }

  async replace(
    databaseRef: string,
    clientId: string,
    profileId: string,
    permissions: BoardColumnPermissionInputDto[]
  ): Promise<BoardColumnPermissionRow[]> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      await client.query(`DELETE FROM kanban_board_column_permissions WHERE client_id = $1 AND profile_id = $2`, [
        clientId,
        profileId
      ]);

      for (const permission of permissions) {
        await client.query(
          `INSERT INTO kanban_board_column_permissions (client_id, profile_id, board_column_id, can_view, can_edit)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (client_id, profile_id, board_column_id)
           DO UPDATE SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, updated_at = now()`,
          [clientId, profileId, permission.boardColumnId, permission.canView, permission.canEdit || false]
        );
      }

      const result = await client.query<BoardColumnPermissionRow>(
        `SELECT ${PERMISSION_SELECT} FROM kanban_board_column_permissions
         WHERE client_id = $1 AND profile_id = $2
         ORDER BY created_at`,
        [clientId, profileId]
      );
      return result.rows;
    });
  }
}
