import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivitiesRepository } from '../activities/activities.repository';
import { KanbanRequestContext, MutateContext, PageQuery } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CreateCardTagDto, UpdateCardTagDto } from './dto/tag.dto';
import { TagsRepository } from './tags.repository';

@Injectable()
export class TagsService {
  constructor(
    private readonly repository: TagsRepository,
    private readonly visibility: CardVisibilityService,
    private readonly activities: ActivitiesRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, query: PageQuery) {
    await this.access.requireMember(context, boardId);
    return this.repository.list(context.databaseRef, context.clientId, boardId, query);
  }

  async create(context: KanbanRequestContext, boardId: string, dto: CreateCardTagDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanManageTags(context, boardId);
    const tag = await this.repository.create(context.databaseRef, context.clientId, boardId, dto);
    await this.audit.record('kanban_card_tag_created', mutate, boardId, { tagId: tag.id, name: tag.name });
    return tag;
  }

  async update(context: KanbanRequestContext, boardId: string, tagId: string, dto: UpdateCardTagDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanManageTags(context, boardId);
    await this.requireTag(context, boardId, tagId);
    const tag = await this.repository.update(context.databaseRef, context.clientId, boardId, tagId, dto);
    await this.audit.record('kanban_card_tag_updated', mutate, boardId, { tagId, ...dto });
    return tag;
  }

  async remove(context: KanbanRequestContext, boardId: string, tagId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanManageTags(context, boardId);
    await this.requireTag(context, boardId, tagId);
    await this.repository.remove(context.databaseRef, context.clientId, boardId, tagId);
    await this.audit.record('kanban_card_tag_removed', mutate, boardId, { tagId });
  }

  async listForCard(context: KanbanRequestContext, boardId: string, cardId: string) {
    await this.access.requireMember(context, boardId);
    await this.requireCard(context, boardId, cardId);
    return this.repository.listForCard(context.databaseRef, context.clientId, cardId);
  }

  async attach(context: KanbanRequestContext, boardId: string, cardId: string, tagId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanManageTags(context, boardId);
    await this.requireCard(context, boardId, cardId);
    await this.requireTag(context, boardId, tagId);
    await this.repository.attach(context.databaseRef, context.clientId, cardId, tagId);
    await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, 'card.tag_added', {
      tagId
    });
  }

  async detach(context: KanbanRequestContext, boardId: string, cardId: string, tagId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanManageTags(context, boardId);
    await this.requireCard(context, boardId, cardId);
    const removed = await this.repository.detach(context.databaseRef, context.clientId, cardId, tagId);
    if (!removed) {
      throw new NotFoundException('Tag link not found');
    }
    await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, 'card.tag_removed', {
      tagId
    });
  }

  /** Card visivel (Sprint 3.5): inexistente ou de outro escritorio = 404. */
  private async requireCard(context: KanbanRequestContext, boardId: string, cardId: string) {
    return this.visibility.requireVisibleCard(context, boardId, cardId);
  }

  private async requireTag(context: KanbanRequestContext, boardId: string, tagId: string) {
    const tag = await this.repository.findById(context.databaseRef, context.clientId, boardId, tagId);
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }
}
