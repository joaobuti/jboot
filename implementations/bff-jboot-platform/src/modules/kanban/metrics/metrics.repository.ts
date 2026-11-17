import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { KanbanViewer, visibleCardScope } from '../shared/card-visibility';

export interface MetricsFilters {
  boardId?: string;
  assigneeId?: string;
  statusId?: string;
}

export interface ByStatusRow {
  statusId: string | null;
  statusName: string;
  count: string;
}

export interface ByAssigneeRow {
  identityId: string;
  count: string;
}

export interface ByColumnRow {
  columnId: string;
  columnName: string;
  count: string;
  wipLimit: number | null;
}

export interface ThroughputRow {
  createdLast30Days: string;
  archivedLast30Days: string;
}

export interface CardForLeadTimeRow {
  id: string;
  boardColumnId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
}

export interface MovedEventRow {
  cardId: string;
  fromBoardColumnId: string;
  toBoardColumnId: string;
  createdAt: string;
}

// Filtro de acesso: escopo UNICO de visibilidade de card (Sprint 3.5; membresia ativa, escritorio e
// "admin ve tudo" com a chave ligada) + os 3 filtros opcionais (boardId/assigneeId/statusId), reutilizado
// por todas as queries de metricas. O escopo ocupa $2.. e os filtros vem depois dele. assigneeId usa
// EXISTS (nao JOIN) para nao multiplicar linhas de cards com varios responsaveis.
function baseWhere(viewer: KanbanViewer): { sql: string; scopeParams: unknown[]; next: number } {
  const scope = visibleCardScope(viewer, 'c', 2);
  const n = 2 + scope.params.length;
  return {
    sql: `
  c.client_id = $1
  AND ${scope.sql}
  AND ($${n}::uuid IS NULL OR c.board_id = $${n})
  AND ($${n + 1}::uuid IS NULL OR EXISTS (SELECT 1 FROM kanban_card_assignees ca WHERE ca.card_id = c.id AND ca.identity_id = $${n + 1}))
  AND ($${n + 2}::uuid IS NULL OR c.card_status_id = $${n + 2})
`,
    scopeParams: scope.params,
    next: n + 3
  };
}

@Injectable()
export class MetricsRepository {
  constructor(private readonly database: DatabaseService) {}

  private base(clientId: string, viewer: KanbanViewer, filters: MetricsFilters): { where: string; params: unknown[] } {
    const where = baseWhere(viewer);
    return {
      where: where.sql,
      params: [clientId, ...where.scopeParams, filters.boardId ?? null, filters.assigneeId ?? null, filters.statusId ?? null]
    };
  }

  async getTotalCards(databaseRef: string, clientId: string, viewer: KanbanViewer, filters: MetricsFilters): Promise<number> {
    const base = this.base(clientId, viewer, filters);
    const result = await this.database.queryForDatabaseRef<{ count: string }>(
      databaseRef,
      `SELECT count(*)::text AS count FROM kanban_cards c WHERE ${base.where} AND c.status = 'active'`,
      base.params
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getByStatus(databaseRef: string, clientId: string, viewer: KanbanViewer, filters: MetricsFilters): Promise<ByStatusRow[]> {
    const base = this.base(clientId, viewer, filters);
    const result = await this.database.queryForDatabaseRef<ByStatusRow>(
      databaseRef,
      `SELECT c.card_status_id AS "statusId", COALESCE(s.name, 'Sem status') AS "statusName", count(*)::text AS count
       FROM kanban_cards c
       LEFT JOIN kanban_card_statuses s ON s.id = c.card_status_id AND s.client_id = c.client_id
       WHERE ${base.where} AND c.status = 'active'
       GROUP BY c.card_status_id, s.name`,
      base.params
    );
    return result.rows;
  }

  async getByAssignee(databaseRef: string, clientId: string, viewer: KanbanViewer, filters: MetricsFilters): Promise<ByAssigneeRow[]> {
    const base = this.base(clientId, viewer, filters);
    const result = await this.database.queryForDatabaseRef<ByAssigneeRow>(
      databaseRef,
      `SELECT ca.identity_id AS "identityId", count(*)::text AS count
       FROM kanban_cards c
       JOIN kanban_card_assignees ca ON ca.card_id = c.id AND ca.client_id = c.client_id
       WHERE ${base.where} AND c.status = 'active'
       GROUP BY ca.identity_id`,
      base.params
    );
    return result.rows;
  }

  async getUnassignedCount(databaseRef: string, clientId: string, viewer: KanbanViewer, filters: MetricsFilters): Promise<number> {
    const base = this.base(clientId, viewer, filters);
    const result = await this.database.queryForDatabaseRef<{ count: string }>(
      databaseRef,
      `SELECT count(*)::text AS count FROM kanban_cards c
       WHERE ${base.where} AND c.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM kanban_card_assignees ca WHERE ca.card_id = c.id AND ca.client_id = c.client_id)`,
      base.params
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async getOverdueCount(databaseRef: string, clientId: string, viewer: KanbanViewer, filters: MetricsFilters): Promise<number> {
    const base = this.base(clientId, viewer, filters);
    const result = await this.database.queryForDatabaseRef<{ count: string }>(
      databaseRef,
      `SELECT count(*)::text AS count FROM kanban_cards c
       WHERE ${base.where} AND c.status = 'active' AND c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE`,
      base.params
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  // boardId e obrigatorio aqui (so chamado pelo service quando filters.boardId esta setado; leitura do
  // quadro ja validada pelo BoardAccessService). O escopo unico de visibilidade (Sprint 3.5) entra no
  // LEFT JOIN: coluna sem card visivel continua listada com contagem 0.
  async getByColumn(databaseRef: string, clientId: string, viewer: KanbanViewer, filters: MetricsFilters): Promise<ByColumnRow[]> {
    const scope = visibleCardScope(viewer, 'c', 5);
    const result = await this.database.queryForDatabaseRef<ByColumnRow>(
      databaseRef,
      `SELECT bc.id AS "columnId", bc.name AS "columnName", count(c.id)::text AS count, bc.wip_limit AS "wipLimit"
       FROM kanban_board_columns bc
       LEFT JOIN kanban_cards c ON c.board_column_id = bc.id AND c.client_id = bc.client_id AND c.status = 'active'
         AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM kanban_card_assignees ca WHERE ca.card_id = c.id AND ca.identity_id = $3))
         AND ($4::uuid IS NULL OR c.card_status_id = $4)
         AND ${scope.sql}
       WHERE bc.client_id = $1 AND bc.board_id = $2 AND bc.status = 'active'
       GROUP BY bc.id, bc.name, bc.wip_limit, bc.position
       ORDER BY bc.position`,
      [clientId, filters.boardId, filters.assigneeId ?? null, filters.statusId ?? null, ...scope.params]
    );
    return result.rows;
  }

  async getThroughput(databaseRef: string, clientId: string, viewer: KanbanViewer, filters: MetricsFilters): Promise<ThroughputRow> {
    const base = this.base(clientId, viewer, filters);
    const result = await this.database.queryForDatabaseRef<ThroughputRow>(
      databaseRef,
      `SELECT
         count(*) FILTER (WHERE c.created_at >= now() - interval '30 days')::text AS "createdLast30Days",
         count(*) FILTER (WHERE c.status = 'archived' AND c.updated_at >= now() - interval '30 days')::text AS "archivedLast30Days"
       FROM kanban_cards c
       WHERE ${base.where}`,
      base.params
    );
    return result.rows[0] ?? { createdLast30Days: '0', archivedLast30Days: '0' };
  }

  // Lead time nunca filtra por status='active': o ultimo segmento de um card arquivado fecha em
  // updated_at, entao o card arquivado precisa estar no conjunto para esse ramo ser alcancavel.
  async getCardsForLeadTime(
    databaseRef: string,
    clientId: string,
    viewer: KanbanViewer,
    filters: MetricsFilters
  ): Promise<CardForLeadTimeRow[]> {
    const base = this.base(clientId, viewer, filters);
    const result = await this.database.queryForDatabaseRef<CardForLeadTimeRow>(
      databaseRef,
      `SELECT c.id, c.board_column_id AS "boardColumnId", c.created_at AS "createdAt",
              c.updated_at AS "updatedAt", c.status
       FROM kanban_cards c
       WHERE ${base.where}`,
      base.params
    );
    return result.rows;
  }

  async getMovedEventsForCards(databaseRef: string, clientId: string, cardIds: string[]): Promise<MovedEventRow[]> {
    if (cardIds.length === 0) {
      return [];
    }
    // cardIds vem SEMPRE de getCardsForLeadTime (ja no escopo unico); allowlist do teste estatico.
    const result = await this.database.queryForDatabaseRef<MovedEventRow>(
      databaseRef,
      `SELECT card_id AS "cardId",
              event_payload ->> 'fromBoardColumnId' AS "fromBoardColumnId",
              event_payload ->> 'toBoardColumnId' AS "toBoardColumnId",
              created_at AS "createdAt"
       FROM kanban_card_activities
       WHERE client_id = $1 AND card_id = ANY($2::uuid[]) AND type = 'system_event'
         AND event_payload ->> 'kind' = 'card.moved'
       ORDER BY created_at ASC`,
      [clientId, cardIds]
    );
    return result.rows;
  }
}
