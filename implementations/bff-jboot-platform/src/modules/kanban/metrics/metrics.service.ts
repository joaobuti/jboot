import { Injectable } from '@nestjs/common';
import { ColumnsRepository } from '../columns/columns.repository';
import { KanbanRequestContext } from '../kanban.types';
import { MembersRepository } from '../members/members.repository';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanViewer } from '../shared/card-visibility';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { CardForLeadTimeRow, MetricsFilters, MetricsRepository, MovedEventRow } from './metrics.repository';

export interface MetricsDto {
  totalCards: number;
  byStatus: Array<{ statusId: string | null; statusName: string; count: number }>;
  byAssignee: Array<{ identityId: string; displayName: string | null; count: number }>;
  unassignedCount: number;
  overdueCount: number;
  byColumn: Array<{ columnId: string; columnName: string; count: number; wipLimit: number | null }> | null;
  columnsOverWip: Array<{ columnId: string; columnName: string; count: number; wipLimit: number }>;
  throughput: { createdLast30Days: number; archivedLast30Days: number };
  leadTimeByColumn: Array<{ columnId: string; columnName: string; avgDurationSeconds: number; visitsCount: number }> | null;
}

interface Segment {
  columnId: string;
  durationMs: number;
}

@Injectable()
export class MetricsService {
  constructor(
    private readonly metrics: MetricsRepository,
    private readonly members: MembersRepository,
    private readonly columns: ColumnsRepository,
    private readonly boardAccess: BoardAccessService,
    private readonly visibility: CardVisibilityService
  ) {}

  async getMetrics(context: KanbanRequestContext, query: MetricsQueryDto): Promise<MetricsDto> {
    const filters: MetricsFilters = { boardId: query.boardId, assigneeId: query.assigneeId, statusId: query.statusId };

    if (filters.boardId) {
      await this.boardAccess.resolveMembership(context, filters.boardId);
    }

    const { databaseRef, clientId } = context;
    // Metricas contam so cards visiveis (escopo unico, Sprint 3.5).
    const viewer = await this.visibility.resolveViewer(context);

    const [totalCards, byStatusRows, byAssigneeRows, unassignedCount, overdueCount, throughputRow] = await Promise.all([
      this.metrics.getTotalCards(databaseRef, clientId, viewer, filters),
      this.metrics.getByStatus(databaseRef, clientId, viewer, filters),
      this.metrics.getByAssignee(databaseRef, clientId, viewer, filters),
      this.metrics.getUnassignedCount(databaseRef, clientId, viewer, filters),
      this.metrics.getOverdueCount(databaseRef, clientId, viewer, filters),
      this.metrics.getThroughput(databaseRef, clientId, viewer, filters)
    ]);

    const displayNames = await this.members.resolveDisplayNames(byAssigneeRows.map((row) => row.identityId));
    const byAssignee = byAssigneeRows.map((row) => ({
      identityId: row.identityId,
      displayName: displayNames.get(row.identityId)?.displayName ?? null,
      count: Number(row.count)
    }));

    let byColumn: MetricsDto['byColumn'] = null;
    let columnsOverWip: MetricsDto['columnsOverWip'] = [];
    let leadTimeByColumn: MetricsDto['leadTimeByColumn'] = null;

    if (filters.boardId) {
      const byColumnRows = await this.metrics.getByColumn(databaseRef, clientId, viewer, filters);
      byColumn = byColumnRows.map((row) => ({
        columnId: row.columnId,
        columnName: row.columnName,
        count: Number(row.count),
        wipLimit: row.wipLimit
      }));
      columnsOverWip = byColumn
        .filter((column) => column.wipLimit !== null && column.count >= column.wipLimit)
        .map((column) => ({ ...column, wipLimit: column.wipLimit as number }));

      // Ultimo bloco, mais custoso (reconstrucao em codigo da aplicacao), conforme decisao da Sprint 6.
      leadTimeByColumn = await this.computeLeadTimeByColumn(databaseRef, clientId, viewer, filters);
    }

    return {
      totalCards,
      byStatus: byStatusRows.map((row) => ({ statusId: row.statusId, statusName: row.statusName, count: Number(row.count) })),
      byAssignee,
      unassignedCount,
      overdueCount,
      byColumn,
      columnsOverWip,
      throughput: {
        createdLast30Days: Number(throughputRow.createdLast30Days),
        archivedLast30Days: Number(throughputRow.archivedLast30Days)
      },
      leadTimeByColumn
    };
  }

  private async computeLeadTimeByColumn(
    databaseRef: string,
    clientId: string,
    viewer: KanbanViewer,
    filters: MetricsFilters
  ): Promise<Array<{ columnId: string; columnName: string; avgDurationSeconds: number; visitsCount: number }>> {
    const cards = await this.metrics.getCardsForLeadTime(databaseRef, clientId, viewer, filters);
    const events = await this.metrics.getMovedEventsForCards(
      databaseRef,
      clientId,
      cards.map((card) => card.id)
    );

    const eventsByCard = new Map<string, MovedEventRow[]>();
    for (const event of events) {
      const list = eventsByCard.get(event.cardId) ?? [];
      list.push(event);
      eventsByCard.set(event.cardId, list);
    }

    const segments: Segment[] = [];
    const now = Date.now();
    for (const card of cards) {
      segments.push(...this.reconstructTimeline(card, eventsByCard.get(card.id) ?? [], now));
    }

    const durationByColumn = new Map<string, { totalMs: number; visits: number }>();
    for (const segment of segments) {
      const aggregate = durationByColumn.get(segment.columnId) ?? { totalMs: 0, visits: 0 };
      aggregate.totalMs += segment.durationMs;
      aggregate.visits += 1;
      durationByColumn.set(segment.columnId, aggregate);
    }

    const boardColumns = await this.columns.list(databaseRef, clientId, filters.boardId as string);
    return boardColumns.map((column) => {
      const aggregate = durationByColumn.get(column.id);
      return {
        columnId: column.id,
        columnName: column.name,
        avgDurationSeconds: aggregate ? Math.round(aggregate.totalMs / aggregate.visits / 1000) : 0,
        visitsCount: aggregate?.visits ?? 0
      };
    });
  }

  // Reconstroi a linha do tempo de colunas de um card a partir dos eventos 'card.moved' (ordenados asc)
  // mais created_at/updated_at. Ver Regra 8 da Sprint 6 (docs/product/kanban-sprint-6-gate.md).
  private reconstructTimeline(card: CardForLeadTimeRow, events: MovedEventRow[], nowMs: number): Segment[] {
    const segments: Segment[] = [];
    let currentColumnId = events[0]?.fromBoardColumnId ?? card.boardColumnId;
    let segmentStartMs = new Date(card.createdAt).getTime();

    for (const event of events) {
      const eventMs = new Date(event.createdAt).getTime();
      segments.push({ columnId: currentColumnId, durationMs: Math.max(0, eventMs - segmentStartMs) });
      currentColumnId = event.toBoardColumnId;
      segmentStartMs = eventMs;
    }

    const endMs = card.status === 'archived' ? new Date(card.updatedAt).getTime() : nowMs;
    segments.push({ columnId: currentColumnId, durationMs: Math.max(0, endMs - segmentStartMs) });

    return segments;
  }
}
