import { Injectable, NotFoundException } from '@nestjs/common';
import { KanbanRequestContext, MutateContext, PageQuery } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CreateCardStatusDto, UpdateCardStatusDto } from './dto/status.dto';
import { StatusesRepository } from './statuses.repository';

@Injectable()
export class StatusesService {
  constructor(
    private readonly repository: StatusesRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, query: PageQuery) {
    await this.access.requireMember(context, boardId);
    return this.repository.list(context.databaseRef, context.clientId, boardId, query);
  }

  async create(context: KanbanRequestContext, boardId: string, dto: CreateCardStatusDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanManageStatuses(context, boardId);
    const status = await this.repository.create(context.databaseRef, context.clientId, boardId, dto);
    await this.audit.record('kanban_card_status_created', mutate, boardId, { statusId: status.id, name: status.name });
    return status;
  }

  async update(context: KanbanRequestContext, boardId: string, statusId: string, dto: UpdateCardStatusDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanManageStatuses(context, boardId);
    await this.requireStatus(context, boardId, statusId);
    const status = await this.repository.update(context.databaseRef, context.clientId, boardId, statusId, dto);
    await this.audit.record('kanban_card_status_updated', mutate, boardId, { statusId, ...dto });
    return status;
  }

  async remove(context: KanbanRequestContext, boardId: string, statusId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanManageStatuses(context, boardId);
    await this.requireStatus(context, boardId, statusId);
    await this.repository.remove(context.databaseRef, context.clientId, boardId, statusId);
    await this.audit.record('kanban_card_status_removed', mutate, boardId, { statusId });
  }

  async requireStatus(context: KanbanRequestContext, boardId: string, statusId: string) {
    const status = await this.repository.findById(context.databaseRef, context.clientId, boardId, statusId);
    if (!status) {
      throw new NotFoundException('Card status not found');
    }
    return status;
  }
}
