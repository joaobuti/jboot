import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ensureOne } from '../shared/repository-result';
import { CreateBoardColumnDto, UpdateBoardColumnDto } from './dto/column.dto';

export interface BoardColumnRow {
  id: string;
  boardId: string;
  name: string;
  position: number;
  color: string | null;
  wipLimit: number | null;
  isDefault: boolean;
  requiresCompleteChecklist: boolean;
  status: string;
}

const COLUMN_SELECT = `id, board_id AS "boardId", name, position, color, wip_limit AS "wipLimit", is_default AS "isDefault",
                        requires_complete_checklist AS "requiresCompleteChecklist", status`;

@Injectable()
export class ColumnsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(databaseRef: string, clientId: string, boardId: string): Promise<BoardColumnRow[]> {
    const result = await this.database.queryForDatabaseRef<BoardColumnRow>(
      databaseRef,
      `SELECT ${COLUMN_SELECT} FROM kanban_board_columns
       WHERE client_id = $1 AND board_id = $2 AND status = 'active'
       ORDER BY position`,
      [clientId, boardId]
    );
    return result.rows;
  }

  async findById(
    databaseRef: string,
    clientId: string,
    boardId: string,
    columnId: string
  ): Promise<BoardColumnRow | null> {
    const result = await this.database.queryForDatabaseRef<BoardColumnRow>(
      databaseRef,
      `SELECT ${COLUMN_SELECT} FROM kanban_board_columns WHERE client_id = $1 AND board_id = $2 AND id = $3`,
      [clientId, boardId, columnId]
    );
    return result.rows[0] ?? null;
  }

  async findDefault(databaseRef: string, clientId: string, boardId: string): Promise<BoardColumnRow | null> {
    const result = await this.database.queryForDatabaseRef<BoardColumnRow>(
      databaseRef,
      `SELECT ${COLUMN_SELECT} FROM kanban_board_columns
       WHERE client_id = $1 AND board_id = $2 AND is_default = true AND status = 'active'
       LIMIT 1`,
      [clientId, boardId]
    );
    return result.rows[0] ?? null;
  }

  async create(
    databaseRef: string,
    clientId: string,
    boardId: string,
    dto: CreateBoardColumnDto
  ): Promise<BoardColumnRow> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      await client.query(
        `UPDATE kanban_board_columns SET position = position + 1, updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND position >= $3`,
        [clientId, boardId, dto.position]
      );
      const result = await client.query<BoardColumnRow>(
        `INSERT INTO kanban_board_columns (client_id, board_id, name, position, color, wip_limit, requires_complete_checklist)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COLUMN_SELECT}`,
        [clientId, boardId, dto.name, dto.position, dto.color ?? null, dto.wipLimit ?? null, dto.requiresCompleteChecklist ?? false]
      );
      return ensureOne(result);
    });
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    columnId: string,
    dto: UpdateBoardColumnDto
  ): Promise<BoardColumnRow> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      if (dto.position !== undefined) {
        const current = await client.query<{ position: number }>(
          `SELECT position FROM kanban_board_columns WHERE client_id = $1 AND board_id = $2 AND id = $3`,
          [clientId, boardId, columnId]
        );
        const fromPosition = current.rows[0]?.position;
        if (fromPosition !== undefined && fromPosition !== dto.position) {
          if (dto.position > fromPosition) {
            await client.query(
              `UPDATE kanban_board_columns SET position = position - 1, updated_at = now()
               WHERE client_id = $1 AND board_id = $2 AND position > $3 AND position <= $4 AND id <> $5`,
              [clientId, boardId, fromPosition, dto.position, columnId]
            );
          } else {
            await client.query(
              `UPDATE kanban_board_columns SET position = position + 1, updated_at = now()
               WHERE client_id = $1 AND board_id = $2 AND position >= $3 AND position < $4 AND id <> $5`,
              [clientId, boardId, dto.position, fromPosition, columnId]
            );
          }
        }
      }
      const result = await client.query<BoardColumnRow>(
        `UPDATE kanban_board_columns
         SET name = COALESCE($4, name),
             position = COALESCE($5, position),
             color = COALESCE($6, color),
             wip_limit = COALESCE($7, wip_limit),
             status = COALESCE($8, status),
             requires_complete_checklist = COALESCE($9, requires_complete_checklist),
             updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${COLUMN_SELECT}`,
        [
          clientId,
          boardId,
          columnId,
          dto.name ?? null,
          dto.position ?? null,
          dto.color ?? null,
          dto.wipLimit ?? null,
          dto.status ?? null,
          dto.requiresCompleteChecklist ?? null
        ]
      );
      return ensureOne(result);
    });
  }

  async archive(databaseRef: string, clientId: string, boardId: string, columnId: string): Promise<void> {
    await this.update(databaseRef, clientId, boardId, columnId, { status: 'archived' });
  }
}
