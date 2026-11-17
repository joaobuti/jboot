import { ConflictException, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { PageResult } from '../kanban.types';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';
import { ensureOne } from '../shared/repository-result';
import { CreateCardDto, ListCardsQueryDto, UpdateCardDto } from './dto/card.dto';

export interface CardRow {
  id: string;
  boardId: string;
  boardColumnId: string;
  title: string;
  description: string | null;
  sourceModule: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourcePayload: Record<string, unknown> | null;
  sourceUrl: string | null;
  position: number;
  status: string;
  cardStatusId: string | null;
  dueDate: string | null;
  /** Escritorio do card (Sprint 3.5); nulo ate o administrador atribuir. */
  officeId: string | null;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
  total?: string;
}

const CARD_SELECT = `id, board_id AS "boardId", board_column_id AS "boardColumnId", title, description,
                      source_module AS "sourceModule", source_type AS "sourceType", source_id AS "sourceId",
                      source_payload AS "sourcePayload", source_url AS "sourceUrl", position,
                      status, card_status_id AS "cardStatusId", due_date::text AS "dueDate", office_id AS "officeId",
                      created_by_identity_id AS "createdByIdentityId",
                      created_at AS "createdAt", updated_at AS "updatedAt"`;

export interface CreateCardFromSourceInput {
  boardColumnId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  sourcePayload: Record<string, unknown>;
  sourceUrl?: string | null;
  /** Escritorio resolvido pelo servico (Sprint 3.5); nulo = sem escritorio. */
  officeId?: string | null;
}

export interface CardSummary {
  assigneeIds: string[];
  commentCount: number;
  attachmentCount: number;
}

@Injectable()
export class CardsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(
    databaseRef: string,
    clientId: string,
    boardId: string,
    query: ListCardsQueryDto,
    viewer: KanbanViewer
  ): Promise<PageResult<Omit<CardRow, 'total'>>> {
    // Lista do quadro: so cards visiveis (escopo unico, Sprint 3.5); contagem idem.
    const scope = visibleCardScope(viewer, 'kanban_cards', 9);
    const result = await this.database.queryForDatabaseRef<CardRow>(
      databaseRef,
      `SELECT ${CARD_SELECT}, count(*) OVER() AS total
       FROM kanban_cards
       WHERE client_id = $1 AND board_id = $2 AND status = 'active' AND ${scope.sql}
         AND ($5::uuid IS NULL OR board_column_id = $5)
         AND ($6::uuid IS NULL OR card_status_id = $6)
         AND ($7::uuid IS NULL OR EXISTS (
           SELECT 1 FROM kanban_card_tag_links tl WHERE tl.card_id = kanban_cards.id AND tl.tag_id = $7
         ))
         AND ($8::text IS NULL OR title ILIKE '%' || $8 || '%' OR description ILIKE '%' || $8 || '%')
       ORDER BY board_column_id, position
       LIMIT $3 OFFSET $4`,
      [
        clientId,
        boardId,
        query.limit,
        query.offset,
        query.boardColumnId ?? null,
        query.cardStatusId ?? null,
        query.tagId ?? null,
        query.search ?? null,
        ...scope.params
      ]
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

  // Agregados (responsaveis, comentarios, anexos) para todos os cards do board de uma vez,
  // evitando N+1 quando o board renderiza a lista de cards. Os LEFT JOINs multiplicam linhas
  // por card (assignee x activity x attachment), mas os agregados usam DISTINCT no id de cada
  // dimensao, entao a contagem fica correta independente da multiplicacao.
  async listSummaries(
    databaseRef: string,
    clientId: string,
    boardId: string,
    viewer: KanbanViewer
  ): Promise<Map<string, CardSummary>> {
    const scope = visibleCardScope(viewer, 'c', 3);
    const result = await this.database.queryForDatabaseRef<{
      cardId: string;
      assigneeIds: string[];
      commentCount: string;
      attachmentCount: string;
    }>(
      databaseRef,
      `SELECT c.id AS "cardId",
              COALESCE(array_agg(DISTINCT ca.identity_id) FILTER (WHERE ca.identity_id IS NOT NULL), ARRAY[]::uuid[]) AS "assigneeIds",
              count(DISTINCT act.id) FILTER (WHERE act.type = 'comment') AS "commentCount",
              count(DISTINCT att.id) AS "attachmentCount"
       FROM kanban_cards c
       LEFT JOIN kanban_card_assignees ca ON ca.card_id = c.id AND ca.client_id = c.client_id
       LEFT JOIN kanban_card_activities act ON act.card_id = c.id AND act.client_id = c.client_id
       LEFT JOIN kanban_card_attachments att ON att.activity_id = act.id AND att.client_id = c.client_id
       WHERE c.client_id = $1 AND c.board_id = $2 AND ${scope.sql}
       GROUP BY c.id`,
      [clientId, boardId, ...scope.params]
    );
    return new Map(
      result.rows.map((row) => [
        row.cardId,
        {
          assigneeIds: row.assigneeIds,
          commentCount: Number(row.commentCount),
          attachmentCount: Number(row.attachmentCount)
        }
      ])
    );
  }

  async findById(
    databaseRef: string,
    clientId: string,
    boardId: string,
    cardId: string
  ): Promise<Omit<CardRow, 'total'> | null> {
    const result = await this.database.queryForDatabaseRef<Omit<CardRow, 'total'>>(
      databaseRef,
      `SELECT ${CARD_SELECT} FROM kanban_cards
       WHERE client_id = $1 AND board_id = $2 AND id = $3 AND status <> 'deleted'`,
      [clientId, boardId, cardId]
    );
    return result.rows[0] ?? null;
  }

  async findByIdForClient(
    databaseRef: string,
    clientId: string,
    cardId: string
  ): Promise<Omit<CardRow, 'total'> | null> {
    const result = await this.database.queryForDatabaseRef<Omit<CardRow, 'total'>>(
      databaseRef,
      `SELECT ${CARD_SELECT} FROM kanban_cards
       WHERE client_id = $1 AND id = $2 AND status <> 'deleted'`,
      [clientId, cardId]
    );
    return result.rows[0] ?? null;
  }

  async create(
    databaseRef: string,
    clientId: string,
    boardId: string,
    dto: CreateCardDto,
    createdByIdentityId: string,
    officeId: string | null = null
  ): Promise<Omit<CardRow, 'total'>> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      const nextPosition = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM kanban_cards
         WHERE client_id = $1 AND board_column_id = $2 AND status = 'active'`,
        [clientId, dto.boardColumnId]
      );
      const position = nextPosition.rows[0]?.next ?? 0;
      const result = await client.query<Omit<CardRow, 'total'>>(
        `INSERT INTO kanban_cards (client_id, board_id, board_column_id, title, description, due_date, position, created_by_identity_id, office_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${CARD_SELECT}`,
        [
          clientId,
          boardId,
          dto.boardColumnId,
          dto.title,
          dto.description ?? null,
          dto.dueDate ?? null,
          position,
          createdByIdentityId,
          officeId
        ]
      );
      return ensureOne(result);
    });
  }

  async createFromSource(
    databaseRef: string,
    clientId: string,
    boardId: string,
    input: CreateCardFromSourceInput,
    createdByIdentityId: string
  ): Promise<{ card: Omit<CardRow, 'total'>; created: boolean }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      const existing = await client.query<Omit<CardRow, 'total'>>(
        `SELECT ${CARD_SELECT}
         FROM kanban_cards
         WHERE client_id = $1
           AND board_id = $2
           AND source_module = $3
           AND source_type = $4
           AND source_id = $5
           AND status NOT IN ('archived', 'deleted')
         LIMIT 1`,
        [clientId, boardId, input.sourceModule, input.sourceType, input.sourceId]
      );
      if (existing.rows[0]) {
        return { card: existing.rows[0], created: false };
      }
      const nextPosition = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM kanban_cards
         WHERE client_id = $1 AND board_column_id = $2 AND status = 'active'`,
        [clientId, input.boardColumnId]
      );
      const position = nextPosition.rows[0]?.next ?? 0;
      const result = await client.query<Omit<CardRow, 'total'>>(
        `INSERT INTO kanban_cards
           (client_id, board_id, board_column_id, title, description, due_date, source_module, source_type, source_id, source_payload, source_url, position, created_by_identity_id, office_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
         RETURNING ${CARD_SELECT}`,
        [
          clientId,
          boardId,
          input.boardColumnId,
          input.title,
          input.description ?? null,
          input.dueDate ?? null,
          input.sourceModule,
          input.sourceType,
          input.sourceId,
          JSON.stringify(input.sourcePayload),
          input.sourceUrl ?? null,
          position,
          createdByIdentityId,
          input.officeId ?? null
        ]
      );
      return { card: ensureOne(result), created: true };
    });
  }

  async update(
    databaseRef: string,
    clientId: string,
    boardId: string,
    cardId: string,
    dto: UpdateCardDto
  ): Promise<Omit<CardRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardRow, 'total'>>(
        databaseRef,
        `UPDATE kanban_cards
         SET title = COALESCE($4, title),
             description = COALESCE($5, description),
             status = COALESCE($6, status),
             due_date = CASE WHEN $7::boolean THEN $8::date ELSE due_date END,
             updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${CARD_SELECT}`,
        [clientId, boardId, cardId, dto.title ?? null, dto.description ?? null, dto.status ?? null, dto.dueDate !== undefined, dto.dueDate ?? null]
      )
    );
  }

  async updateStatus(
    databaseRef: string,
    clientId: string,
    boardId: string,
    cardId: string,
    cardStatusId: string | null
  ): Promise<Omit<CardRow, 'total'>> {
    return ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardRow, 'total'>>(
        databaseRef,
        `UPDATE kanban_cards
         SET card_status_id = $4, updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${CARD_SELECT}`,
        [clientId, boardId, cardId, cardStatusId]
      )
    );
  }

  /**
   * Exclusao logica. O Flow e o registro permanente do cliente, entao card
   * excluido sai das listagens mas permanece no banco — decisao do usuario em
   * 2026-09-09, ver JUR-003. Ate aqui esta operacao era `DELETE`, o que apagava
   * de vez inclusive card de origem juridica exportado do DataJud.
   */
  async softDelete(databaseRef: string, clientId: string, boardId: string, cardId: string): Promise<boolean> {
    const result = await this.database.queryForDatabaseRef(
      databaseRef,
      `UPDATE kanban_cards SET status = 'deleted', updated_at = now()
       WHERE client_id = $1 AND board_id = $2 AND id = $3 AND status = 'archived'`,
      [clientId, boardId, cardId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async countActiveInColumn(
    databaseRef: string,
    clientId: string,
    boardColumnId: string,
    excludeCardId?: string
  ): Promise<number> {
    const result = await this.database.queryForDatabaseRef<{ count: string }>(
      databaseRef,
      `SELECT count(*)::text AS count FROM kanban_cards
       WHERE client_id = $1 AND board_column_id = $2 AND status = 'active' AND ($3::uuid IS NULL OR id <> $3)`,
      [clientId, boardColumnId, excludeCardId ?? null]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async move(
    databaseRef: string,
    clientId: string,
    boardId: string,
    cardId: string,
    fromColumnId: string,
    fromPosition: number,
    toColumnId: string,
    toPosition: number,
    movedByIdentityId: string,
    // Movimento por regra `move_card` (flow-ai-completion-sprints.md): reconfere o card e o destino com
    // trava, grava a profundidade da cadeia no evento e confirma o recibo na mesma transacao.
    automation?: { depth: number; rootActivityId: string | null; commit: (client: PoolClient) => Promise<void> }
  ): Promise<{ card: Omit<CardRow, 'total'>; movedActivityId: string | null }> {
    return this.database.transactionForDatabaseRef(databaseRef, async (client) => {
      if (automation) {
        const current = await client.query<{ boardColumnId: string; position: number }>(
          `SELECT board_column_id AS "boardColumnId",position FROM kanban_cards
           WHERE client_id=$1 AND board_id=$2 AND id=$3 AND status='active' FOR UPDATE`, [clientId,boardId,cardId]);
        if (current.rows[0]?.boardColumnId !== fromColumnId || current.rows[0]?.position !== fromPosition) {
          throw new ConflictException({ code: 'automation_card_changed' });
        }
        const column = await client.query<{ wipLimit: number | null }>(
          `SELECT wip_limit AS "wipLimit" FROM kanban_board_columns
           WHERE client_id=$1 AND board_id=$2 AND id=$3 AND status='active' FOR UPDATE`, [clientId,boardId,toColumnId]);
        if (!column.rows[0]) throw new ConflictException({ code: 'automation_destination_unavailable' });
        if (column.rows[0].wipLimit !== null) {
          const count = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM kanban_cards
            WHERE client_id=$1 AND board_column_id=$2 AND status='active' AND id<>$3`,[clientId,toColumnId,cardId]);
          if (Number(count.rows[0].count) >= column.rows[0].wipLimit) throw new ConflictException({ code: 'wip_limit_exceeded' });
        }
      }
      if (fromColumnId === toColumnId) {
        if (toPosition > fromPosition) {
          await client.query(
            `UPDATE kanban_cards SET position = position - 1, updated_at = now()
             WHERE client_id = $1 AND board_column_id = $2 AND position > $3 AND position <= $4 AND id <> $5`,
            [clientId, fromColumnId, fromPosition, toPosition, cardId]
          );
        } else if (toPosition < fromPosition) {
          await client.query(
            `UPDATE kanban_cards SET position = position + 1, updated_at = now()
             WHERE client_id = $1 AND board_column_id = $2 AND position >= $3 AND position < $4 AND id <> $5`,
            [clientId, fromColumnId, toPosition, fromPosition, cardId]
          );
        }
      } else {
        await client.query(
          `UPDATE kanban_cards SET position = position - 1, updated_at = now()
           WHERE client_id = $1 AND board_column_id = $2 AND position > $3`,
          [clientId, fromColumnId, fromPosition]
        );
        await client.query(
          `UPDATE kanban_cards SET position = position + 1, updated_at = now()
           WHERE client_id = $1 AND board_column_id = $2 AND position >= $3`,
          [clientId, toColumnId, toPosition]
        );
      }

      const result = await client.query<Omit<CardRow, 'total'>>(
        `UPDATE kanban_cards
         SET board_column_id = $4, position = $5, updated_at = now()
         WHERE client_id = $1 AND board_id = $2 AND id = $3
         RETURNING ${CARD_SELECT}`,
        [clientId, boardId, cardId, toColumnId, toPosition]
      );
      const card = ensureOne(result);
      if (fromColumnId === toColumnId) {
        if (automation) await automation.commit(client);
        return { card, movedActivityId: null };
      }
      // Sprint 13: o evento canonico nasce na mesma transacao da movimentacao. As
      // automacoes (e-mail, IA e movimento) derivam dele; movimentacao gravada implica evento.
      const activity = await client.query<{ id: string }>(
        `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, event_payload)
         VALUES ($1, $2, 'system_event', $3, $4::jsonb)
         RETURNING id`,
        [
          clientId,
          cardId,
          movedByIdentityId,
          JSON.stringify({
            kind: 'card.moved',
            fromBoardColumnId: fromColumnId,
            toBoardColumnId: toColumnId,
            ...(automation ? { automationDepth: automation.depth, automationRootActivityId: automation.rootActivityId } : {})
          })
        ]
      );
      if (automation) await automation.commit(client);
      return { card, movedActivityId: ensureOne(activity).id };
    });
  }
}
