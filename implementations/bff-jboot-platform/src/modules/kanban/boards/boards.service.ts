import { Injectable } from '@nestjs/common';
import { KanbanRequestContext, MutateContext, PageQuery } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { BoardsRepository } from './boards.repository';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto';

@Injectable()
export class BoardsService {
  constructor(
    private readonly repository: BoardsRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, query: PageQuery) {
    const page = await this.repository.list(context.databaseRef, context.clientId, context.identityId, query);
    // Sprint 3.5 (P24): com a visibilidade por escritorio ligada, `flow:admin` e `board_admin` efetivo.
    if (!(await this.access.isEffectiveTenantAdmin(context))) {
      return page;
    }
    return { ...page, data: page.data.map((board) => ({ ...board, currentUserRole: 'board_admin' as const })) };
  }

  async get(context: KanbanRequestContext, boardId: string) {
    const board = await this.access.requireBoard(context, boardId);
    const [effective, currentUserCapabilities] = await Promise.all([
      this.access.resolveEffectiveRole(context, boardId),
      this.access.resolveCapabilities(context, boardId)
    ]);
    return { ...board, currentUserRole: effective?.role ?? null, currentUserCapabilities };
  }

  async create(context: KanbanRequestContext, dto: CreateBoardDto, mutate: MutateContext) {
    const board = await this.repository.createWithOwner(context.databaseRef, context.clientId, dto, context.identityId);
    await this.audit.record('kanban_board_created', mutate, board.id, { name: board.name });
    return { ...board, currentUserRole: 'board_admin' as const };
  }

  async update(context: KanbanRequestContext, boardId: string, dto: UpdateBoardDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    const board = await this.repository.update(context.databaseRef, context.clientId, boardId, dto);
    await this.audit.record('kanban_board_updated', mutate, boardId, { ...dto });
    return { ...board, currentUserRole: 'board_admin' as const };
  }

  async archive(context: KanbanRequestContext, boardId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.repository.archive(context.databaseRef, context.clientId, boardId);
    await this.audit.record('kanban_board_archived', mutate, boardId, {});
  }
}
