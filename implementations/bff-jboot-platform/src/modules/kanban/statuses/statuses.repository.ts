import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { PageQuery, PageResult } from '../kanban.types';
import { ensureOne } from '../shared/repository-result';
import { CreateCardStatusDto, UpdateCardStatusDto } from './dto/status.dto';

export interface CardStatusRow {
  id: string;
  boardId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

const STATUS_SELECT = `id, board_id AS "boardId", name, color, created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class StatusesRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    databaseRef: string,
    clientId: string,
    boardId: string,
    query: PageQuery
  ): Promise<PageResult<Omit<CardStatusRow, 'total'>>> {
    const result = await this.database.queryForDatabaseRef<CardStatusRow>(
      databaseRef,
      `SELECT ${STATUS_SELECT}, count(*) OVER() AS total
       FROM kanban_card_statuses
       WHERE client_id = $1 AND board_id = $2
       ORDER BY name
       LIMIT $3 OFFSET $4`,
      [clientId, boardId, query.limit, query.offset]
    );
    const total = result.rows[0]?.total ? Number(result.rows[0].total) : 0;
    return {
      data: result.rows.map(({ total: _total, ...rest }) => {
        void _total;
        return rest;
      }),
      meta: { limit: query.limit, offset: query.offset, total }
    };
  }

  async findById(databaseRef: string, clientId: string, boardId: string, statusId: string): Promise<Omit<CardStatusRow, 'total'> | null> {
    const result = await this.database.queryForDatabaseRef<Omit<CardStatusRow, 'total'>>(
      databaseRef,
      `SELECT ${STATUS_SELECT} FROM kanban_card_statuses WHERE client_id = $1 AND board_id = $2 AND id = $3`,
      [clientId, boardId, statusId]
    );
    return result.rows[0] ?? null;
  }

  async create(databaseRef: string, clientId: string, boardId: string, dto: CreateCardStatusDto): Promise<Omit<CardStatusRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardStatusRow, 'total'>>(
        databaseRef,
        `INSERT INTO kanban_card_statuses (client_id, board_id, name, color)
         VALUES ($1, $2, $3, $4)
         RETURNING ${STATUS_SELECT}`,
        [clientId, boardId, dto.name, dto.color ?? '#6c757d']
      )
    );
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    statusId: string,
    dto: UpdateCardStatusDto
  ): Promise<Omit<CardStatusRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardStatusRow, 'total'>>(
        databaseRef,
        `UPDATE kanban_card_statuses
         SET name = COALESCE($4, name), color = COALESCE($5, color), updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${STATUS_SELECT}`,
        [clientId, boardId, statusId, dto.name ?? null, dto.color ?? null]
      )
    );
  }

  async remove(databaseRef: string, clientId: string, boardId: string, statusId: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `DELETE FROM kanban_card_statuses WHERE client_id = $1 AND board_id = $2 AND id = $3`,
      [clientId, boardId, statusId]
    );
  }
}
