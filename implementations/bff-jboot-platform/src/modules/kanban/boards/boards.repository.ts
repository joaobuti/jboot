import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { BoardMemberRole, PageQuery, PageResult } from '../kanban.types';
import { ensureOne } from '../shared/repository-result';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto';

export interface BoardRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  /** Captacao de leads ligada (CRM de leads, Sprint 4; PE1). */
  leadIntakeEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

export interface BoardWithRoleRow extends Omit<BoardRow, 'total'> {
  currentUserRole: BoardMemberRole | null;
  defaultColumnId?: string | null;
}

const BOARD_COLUMNS = `b.id, b.name, b.description, b.status, b.lead_intake_enabled AS "leadIntakeEnabled", b.created_at AS "createdAt", b.updated_at AS "updatedAt", dc.id AS "defaultColumnId"`;
const BOARD_SELECT = `id, name, description, status, lead_intake_enabled AS "leadIntakeEnabled", created_at AS "createdAt", updated_at AS "updatedAt"`;
const DEFAULT_COLUMN_JOIN = `LEFT JOIN LATERAL (
         SELECT id
         FROM kanban_board_columns
         WHERE client_id = b.client_id
           AND board_id = b.id
           AND is_default = true
           AND status = 'active'
         ORDER BY position, id
         LIMIT 1
       ) dc ON true`;

@Injectable()
export class BoardsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    databaseRef: string,
    clientId: string,
    identityId: string,
    query: PageQuery
  ): Promise<PageResult<BoardWithRoleRow>> {
    const result = await this.database.queryForDatabaseRef<BoardWithRoleRow & { total?: string }>(
      databaseRef,
      `SELECT ${BOARD_COLUMNS}, m.role AS "currentUserRole", count(*) OVER() AS total
       FROM kanban_boards b
       ${DEFAULT_COLUMN_JOIN}
       LEFT JOIN kanban_board_members m
         ON m.board_id = b.id AND m.client_id = b.client_id AND m.identity_id = $6 AND m.status = 'active'
       WHERE b.client_id = $1
         AND ($4::text IS NULL OR b.status = $4)
         AND ($5::text IS NULL OR b.name ILIKE '%' || $5 || '%')
       ORDER BY b.name
       LIMIT $2 OFFSET $3`,
      [clientId, query.limit, query.offset, query.status ?? null, query.search ?? null, identityId]
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

  async findById(
    databaseRef: string,
    clientId: string,
    boardId: string,
    identityId: string
  ): Promise<BoardWithRoleRow | null> {
    const result = await this.database.queryForDatabaseRef<BoardWithRoleRow>(
      databaseRef,
      `SELECT ${BOARD_COLUMNS}, m.role AS "currentUserRole"
       FROM kanban_boards b
       ${DEFAULT_COLUMN_JOIN}
       LEFT JOIN kanban_board_members m
         ON m.board_id = b.id AND m.client_id = b.client_id AND m.identity_id = $3 AND m.status = 'active'
       WHERE b.client_id = $1 AND b.id = $2`,
      [clientId, boardId, identityId]
    );
    return result.rows[0] ?? null;
  }

  async createWithOwner(
    databaseRef: string,
    clientId: string,
    dto: CreateBoardDto,
    ownerIdentityId: string
  ): Promise<Omit<BoardRow, 'total'> & { defaultColumnId: string }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      const boardResult = await client.query<Omit<BoardRow, 'total'>>(
        `INSERT INTO kanban_boards (client_id, name, description, created_by_identity_id)
         VALUES ($1, $2, $3, $4)
         RETURNING ${BOARD_SELECT}`,
        [clientId, dto.name, dto.description ?? null, ownerIdentityId]
      );
      const board = ensureOne(boardResult);
      const defaultColumnResult = await client.query<{ id: string }>(
        `INSERT INTO kanban_board_columns (client_id, board_id, name, position, is_default)
         VALUES ($1, $2, 'BACKLOG', 0, true)
         RETURNING id`,
        [clientId, board.id]
      );
      const defaultColumn = ensureOne(defaultColumnResult);
      await client.query(
        `INSERT INTO kanban_board_members (client_id, board_id, identity_id, role)
         VALUES ($1, $2, $3, 'board_admin')`,
        [clientId, board.id, ownerIdentityId]
      );
      return { ...board, defaultColumnId: defaultColumn.id };
    });
  }

  /** `allBoards` (flow:admin): todo board ativo do cliente, sem exigir membresia (regra de 2026-11-11). */
  async listImportDestinations(
    databaseRef: string,
    clientId: string,
    identityId: string,
    allBoards = false
  ): Promise<Array<{ id: string; name: string; defaultColumnId: string }>> {
    const result = await this.database.queryForDatabaseRef<{ id: string; name: string; defaultColumnId: string }>(
      databaseRef,
      `SELECT b.id,
              b.name,
              c.id AS "defaultColumnId"
       FROM kanban_boards b
       JOIN kanban_board_columns c
         ON c.board_id = b.id
        AND c.client_id = b.client_id
        AND c.is_default = true
        AND c.status = 'active'
      WHERE b.client_id = $1
         AND b.status = 'active'
         AND ($3::boolean OR EXISTS (
           SELECT 1 FROM kanban_board_members m
           WHERE m.board_id = b.id AND m.client_id = b.client_id AND m.identity_id = $2 AND m.status = 'active'
         ))
       ORDER BY b.name`,
      [clientId, identityId, allBoards]
    );
    return result.rows;
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    dto: UpdateBoardDto
  ): Promise<Omit<BoardRow, 'total'> & { defaultColumnId: string | null }> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<BoardRow, 'total'> & { defaultColumnId: string | null }>(
        databaseRef,
        `WITH updated AS (
           UPDATE kanban_boards
           SET name = COALESCE($3, name),
               description = COALESCE($4, description),
               status = COALESCE($5, status),
               lead_intake_enabled = COALESCE($6, lead_intake_enabled),
               updated_at = now()
           WHERE client_id = $1 AND id = $2
           RETURNING ${BOARD_SELECT}
         )
         SELECT b.id,
                b.name,
                b.description,
                b.status,
                b."leadIntakeEnabled",
                b."createdAt",
                b."updatedAt",
                dc.id AS "defaultColumnId"
         FROM updated b
         LEFT JOIN LATERAL (
           SELECT id
           FROM kanban_board_columns
           WHERE client_id = $1
             AND board_id = b.id
             AND is_default = true
             AND status = 'active'
           ORDER BY position, id
           LIMIT 1
         ) dc ON true`,
        [clientId, boardId, dto.name ?? null, dto.description ?? null, dto.status ?? null, dto.leadIntakeEnabled ?? null]
      )
    );
  }

  async archive(databaseRef: string, clientId: string, boardId: string): Promise<void> {
    await this.update(databaseRef, clientId, boardId, { status: 'archived' });
  }
}
