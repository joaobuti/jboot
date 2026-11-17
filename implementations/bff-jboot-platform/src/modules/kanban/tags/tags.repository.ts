import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { PageQuery, PageResult } from '../kanban.types';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';
import { ensureOne } from '../shared/repository-result';
import { CreateCardTagDto, UpdateCardTagDto } from './dto/tag.dto';

export interface CardTagRow {
  id: string;
  boardId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

const TAG_SELECT = `id, board_id AS "boardId", name, color, created_at AS "createdAt", updated_at AS "updatedAt"`;

@Injectable()
export class TagsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    databaseRef: string,
    clientId: string,
    boardId: string,
    query: PageQuery
  ): Promise<PageResult<Omit<CardTagRow, 'total'>>> {
    const result = await this.database.queryForDatabaseRef<CardTagRow>(
      databaseRef,
      `SELECT ${TAG_SELECT}, count(*) OVER() AS total
       FROM kanban_card_tags
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

  async findById(databaseRef: string, clientId: string, boardId: string, tagId: string): Promise<Omit<CardTagRow, 'total'> | null> {
    const result = await this.database.queryForDatabaseRef<Omit<CardTagRow, 'total'>>(
      databaseRef,
      `SELECT ${TAG_SELECT} FROM kanban_card_tags WHERE client_id = $1 AND board_id = $2 AND id = $3`,
      [clientId, boardId, tagId]
    );
    return result.rows[0] ?? null;
  }

  async create(databaseRef: string, clientId: string, boardId: string, dto: CreateCardTagDto): Promise<Omit<CardTagRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardTagRow, 'total'>>(
        databaseRef,
        `INSERT INTO kanban_card_tags (client_id, board_id, name, color)
         VALUES ($1, $2, $3, $4)
         RETURNING ${TAG_SELECT}`,
        [clientId, boardId, dto.name, dto.color ?? '#6c757d']
      )
    );
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    tagId: string,
    dto: UpdateCardTagDto
  ): Promise<Omit<CardTagRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardTagRow, 'total'>>(
        databaseRef,
        `UPDATE kanban_card_tags
         SET name = COALESCE($4, name), color = COALESCE($5, color), updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${TAG_SELECT}`,
        [clientId, boardId, tagId, dto.name ?? null, dto.color ?? null]
      )
    );
  }

  async remove(databaseRef: string, clientId: string, boardId: string, tagId: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `DELETE FROM kanban_card_tags WHERE client_id = $1 AND board_id = $2 AND id = $3`,
      [clientId, boardId, tagId]
    );
  }

  async listForCard(databaseRef: string, clientId: string, cardId: string): Promise<Omit<CardTagRow, 'total'>[]> {
    const result = await this.database.queryForDatabaseRef<Omit<CardTagRow, 'total'>>(
      databaseRef,
      `SELECT t.id, t.board_id AS "boardId", t.name, t.color, t.created_at AS "createdAt", t.updated_at AS "updatedAt"
       FROM kanban_card_tags t
       JOIN kanban_card_tag_links l ON l.tag_id = t.id AND l.client_id = t.client_id
       WHERE t.client_id = $1 AND l.card_id = $2
       ORDER BY t.name`,
      [clientId, cardId]
    );
    return result.rows;
  }

  async listTagIdsForBoard(
    databaseRef: string,
    clientId: string,
    boardId: string,
    viewer: KanbanViewer
  ): Promise<Map<string, string[]>> {
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<{ cardId: string; tagId: string }>(
      databaseRef,
      `SELECT l.card_id AS "cardId", l.tag_id AS "tagId"
       FROM kanban_card_tag_links l
       JOIN kanban_cards c ON c.id = l.card_id AND c.client_id = l.client_id
       WHERE l.client_id = $1 AND c.board_id = $2 AND ${scope.sql}`,
      [clientId, boardId, ...scope.params]
    );
    const map = new Map<string, string[]>();
    for (const row of result.rows) {
      const existing = map.get(row.cardId) ?? [];
      existing.push(row.tagId);
      map.set(row.cardId, existing);
    }
    return map;
  }

  async attach(databaseRef: string, clientId: string, cardId: string, tagId: string): Promise<void> {
    await this.database.queryForDatabaseRef(
      databaseRef,
      `INSERT INTO kanban_card_tag_links (client_id, card_id, tag_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (card_id, tag_id) DO NOTHING`,
      [clientId, cardId, tagId]
    );
  }

  async detach(databaseRef: string, clientId: string, cardId: string, tagId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `DELETE FROM kanban_card_tag_links WHERE client_id = $1 AND card_id = $2 AND tag_id = $3`,
      [clientId, cardId, tagId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
