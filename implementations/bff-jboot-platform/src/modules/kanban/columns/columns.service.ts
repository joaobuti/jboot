import { ConflictException, Injectable } from '@nestjs/common';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { ColumnPermissionsRepository } from '../profiles/column-permissions.repository';
import { BoardAccessService } from '../shared/board-access.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { ColumnsRepository } from './columns.repository';
import { CreateBoardColumnDto, UpdateBoardColumnDto } from './dto/column.dto';

@Injectable()
export class ColumnsService {
  constructor(
    private readonly repository: ColumnsRepository,
    private readonly columnPermissions: ColumnPermissionsRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, boardId: string) {
    await this.access.requireMember(context, boardId);
    const columns = await this.repository.list(context.databaseRef, context.clientId, boardId);
    const data = await this.filterViewable(context, boardId, columns);
    return { data, meta: { limit: data.length, offset: 0, total: data.length } };
  }

  private async filterViewable<T extends { id: string }>(
    context: KanbanRequestContext,
    boardId: string,
    columns: T[]
  ): Promise<T[]> {
    const membership = await this.access.resolveMembership(context, boardId);
    if (membership.role === 'board_admin') {
      return columns;
    }
    const access = await this.columnPermissions.resolveForColumns(
      context.databaseRef,
      context.clientId,
      membership.profileId,
      columns.map((column) => column.id)
    );
    return columns.filter((column) => access.get(column.id)?.canView !== false);
  }

  async create(context: KanbanRequestContext, boardId: string, dto: CreateBoardColumnDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    const column = await this.repository.create(context.databaseRef, context.clientId, boardId, dto);
    await this.audit.record('kanban_column_created', mutate, boardId, { columnId: column.id, name: column.name });
    return column;
  }

  async update(
    context: KanbanRequestContext,
    boardId: string,
    columnId: string,
    dto: UpdateBoardColumnDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    const column = await this.repository.update(context.databaseRef, context.clientId, boardId, columnId, dto);
    await this.audit.record('kanban_column_updated', mutate, boardId, { columnId, ...dto });
    return column;
  }

  async archive(context: KanbanRequestContext, boardId: string, columnId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    const column = await this.repository.findById(context.databaseRef, context.clientId, boardId, columnId);
    if (column?.isDefault) {
      throw new ConflictException({ code: 'default_column_required', message: 'Default board column cannot be archived' });
    }
    await this.repository.archive(context.databaseRef, context.clientId, boardId, columnId);
    await this.audit.record('kanban_column_archived', mutate, boardId, { columnId });
  }
}
