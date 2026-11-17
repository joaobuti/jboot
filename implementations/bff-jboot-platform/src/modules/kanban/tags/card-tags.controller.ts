import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { AttachCardTagDto } from './dto/tag.dto';
import { TagsService } from './tags.service';

@ApiTags('kanban-card-tags')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/tags')
export class CardTagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@Param('boardId') boardId: string, @Param('cardId') cardId: string, @Req() request: KanbanRequest) {
    return this.tags.listForCard(request.kanbanContext, boardId, cardId);
  }

  @Post()
  @HttpCode(204)
  @RequireScopes('flow:write')
  async attach(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: AttachCardTagDto,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.tags.attach(request.kanbanContext, boardId, cardId, dto.tagId, buildMutateContext(request));
  }

  @Delete(':tagId')
  @HttpCode(204)
  @RequireScopes('flow:write')
  async detach(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Param('tagId') tagId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.tags.detach(request.kanbanContext, boardId, cardId, tagId, buildMutateContext(request));
  }
}
