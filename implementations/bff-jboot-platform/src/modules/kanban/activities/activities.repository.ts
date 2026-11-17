import { Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { FlowLiveEvents } from '../realtime/flow-live-events';
import { PageQuery, PageResult } from '../kanban.types';
import { ensureOne } from '../shared/repository-result';

export type CardActivityType = 'comment' | 'system_event';

export interface CardActivityRow {
  id: string;
  cardId: string;
  type: CardActivityType;
  authorIdentityId: string;
  textContent: string | null;
  eventPayload: Record<string, unknown> | null;
  createdAt: string;
  total?: string;
}

const ACTIVITY_SELECT = `id, card_id AS "cardId", type, author_identity_id AS "authorIdentityId",
                          text_content AS "textContent", event_payload AS "eventPayload",
                          created_at AS "createdAt"`;

@Injectable()
export class ActivitiesRepository {
  // Opcional: specs constroem o repositorio so com o banco. Toda atividade gravada vira aviso
  // `card.updated` (docs/product/flow-realtime-card-updates-sprints.md, R1).
  constructor(
    private readonly database: DatabaseService,
    @Optional() private readonly live?: FlowLiveEvents
  ) {}

  private announce<T extends { eventPayload: Record<string, unknown> | null; type: CardActivityType }>(
    databaseRef: string,
    clientId: string,
    cardId: string,
    row: T
  ): T {
    const kind = row.type === 'comment' ? 'comment' : String(row.eventPayload?.kind ?? 'system_event');
    this.live?.cardChanged(databaseRef, clientId, cardId, kind);
    return row;
  }

  /**
   * Historico do card. `hiddenEventKinds`: `system_event` cujo `kind` o leitor
   * nao pode ver (CRM de leads, Sprint 6, P11: classificacao e geracao so o
   * gestor). Filtrado no SQL para que paginacao e total nao revelem o evento.
   */
  async list(
    databaseRef: string,
    clientId: string,
    cardId: string,
    query: PageQuery,
    hiddenEventKinds: readonly string[] = []
  ): Promise<PageResult<Omit<CardActivityRow, 'total'>>> {
    const result = await this.database.queryForDatabaseRef<CardActivityRow>(
      databaseRef,
      `SELECT ${ACTIVITY_SELECT}, count(*) OVER() AS total
       FROM kanban_card_activities
       WHERE client_id = $1 AND card_id = $2
         AND NOT (type = 'system_event' AND COALESCE(event_payload->>'kind', '') = ANY($5::text[]))
       ORDER BY created_at ASC
       LIMIT $3 OFFSET $4`,
      [clientId, cardId, query.limit, query.offset, [...hiddenEventKinds]]
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
    cardId: string,
    activityId: string
  ): Promise<Omit<CardActivityRow, 'total'> | null> {
    const result = await this.database.queryForDatabaseRef<Omit<CardActivityRow, 'total'>>(
      databaseRef,
      `SELECT ${ACTIVITY_SELECT} FROM kanban_card_activities WHERE client_id = $1 AND card_id = $2 AND id = $3`,
      [clientId, cardId, activityId]
    );
    return result.rows[0] ?? null;
  }

  async createComment(
    databaseRef: string,
    clientId: string,
    cardId: string,
    authorIdentityId: string,
    textContent: string,
    // Metadado do comentario (ex.: `{ origin: 'claude_connector' }`); o texto continua do autor.
    eventPayload: Record<string, unknown> | null = null
  ): Promise<Omit<CardActivityRow, 'total'>> {
    return this.announce(databaseRef, clientId, cardId, ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardActivityRow, 'total'>>(
        databaseRef,
        `INSERT INTO kanban_card_activities (client_id, card_id, type, author_identity_id, text_content, event_payload)
         VALUES ($1, $2, 'comment', $3, $4, $5::jsonb)
         RETURNING ${ACTIVITY_SELECT}`,
        [clientId, cardId, authorIdentityId, textContent, eventPayload === null ? null : JSON.stringify(eventPayload)]
      )
    ));
  }

  /** Comentario identico do mesmo autor pelo conector Claude nos ultimos 2 minutos. */
  async findRecentConnectorComment(
    databaseRef: string,
    clientId: string,
    cardId: string,
    authorIdentityId: string,
    textContent: string
  ): Promise<{ id: string; createdAt: string } | null> {
    const result = await this.database.queryForDatabaseRef<{ id: string; createdAt: string }>(
      databaseRef,
      `SELECT id, created_at AS "createdAt" FROM kanban_card_activities
        WHERE client_id = $1 AND card_id = $2 AND author_identity_id = $3 AND type = 'comment'
          AND text_content = $4 AND event_payload->>'origin' = 'claude_connector'
          AND created_at > now() - interval '2 minutes'
        ORDER BY created_at DESC LIMIT 1`,
      [clientId, cardId, authorIdentityId, textContent]
    );
    return result.rows[0] ?? null;
  }

  async createSystemEvent(
    databaseRef: string,
    clientId: string,
    cardId: string,
    authorIdentityId: string,
    kind: string,
    payload: Record<string, unknown> = {},
    integrationKey: string | null = null
  ): Promise<Omit<CardActivityRow, 'total'>> {
    return this.announce(databaseRef, clientId, cardId, ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardActivityRow, 'total'>>(
        databaseRef,
        `INSERT INTO kanban_card_activities
           (client_id, card_id, type, author_identity_id, event_payload, integration_key)
         VALUES ($1, $2, 'system_event', $3, $4::jsonb, $5)
         ON CONFLICT (client_id, card_id, integration_key)
         DO UPDATE SET integration_key = EXCLUDED.integration_key
         RETURNING ${ACTIVITY_SELECT}`,
        [clientId, cardId, authorIdentityId, JSON.stringify({ kind, ...payload }), integrationKey]
      )
    ));
  }

  async createAiComment(
    databaseRef: string,
    clientId: string,
    cardId: string,
    authorIdentityId: string,
    textContent: string,
    executionId: string,
    toolCallId: string,
  ): Promise<Omit<CardActivityRow, 'total'>> {
    return this.announce(databaseRef, clientId, cardId, ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardActivityRow, 'total'>>(
        databaseRef,
        `INSERT INTO kanban_card_activities
           (client_id, card_id, type, author_identity_id, text_content, source_ai_execution_id, source_ai_tool_call_id)
         VALUES ($1, $2, 'comment', $3, $4, $5, $6)
         ON CONFLICT (client_id, card_id, source_ai_execution_id, source_ai_tool_call_id)
           WHERE source_ai_execution_id IS NOT NULL AND source_ai_tool_call_id IS NOT NULL
         DO UPDATE SET source_ai_execution_id = EXCLUDED.source_ai_execution_id
         RETURNING ${ACTIVITY_SELECT}`,
        [clientId, cardId, authorIdentityId, textContent, executionId, toolCallId],
      ),
    ));
  }

  async createAiReviewRequest(
    databaseRef: string,
    clientId: string,
    cardId: string,
    authorIdentityId: string,
    executionId: string,
    toolCallId: string,
    toolId: string,
  ): Promise<Omit<CardActivityRow, 'total'>> {
    return this.announce(databaseRef, clientId, cardId, ensureOne(
      await this.database.queryForDatabaseRef<Omit<CardActivityRow, 'total'>>(
        databaseRef,
        `INSERT INTO kanban_card_activities
           (client_id, card_id, type, author_identity_id, event_payload, source_ai_execution_id, source_ai_tool_call_id)
         VALUES ($1, $2, 'system_event', $3, $4::jsonb, $5, $6)
         ON CONFLICT (client_id, card_id, source_ai_execution_id, source_ai_tool_call_id)
           WHERE source_ai_execution_id IS NOT NULL AND source_ai_tool_call_id IS NOT NULL
         DO UPDATE SET source_ai_execution_id = EXCLUDED.source_ai_execution_id
         RETURNING ${ACTIVITY_SELECT}`,
        [
          clientId,
          cardId,
          authorIdentityId,
          JSON.stringify({ kind: 'ai.action_review_requested', executionId, toolId }),
          executionId,
          toolCallId,
        ],
      ),
    ));
  }
}
