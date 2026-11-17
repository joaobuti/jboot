import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { ActivitiesService } from './activities.service';
import { CreateCardCommentDto, ListCardActivitiesQueryDto } from './dto/activity.dto';

@ApiTags('kanban-card-activities')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Query() query: ListCardActivitiesQueryDto,
    @Req() request: KanbanRequest
  ) {
    return this.activities.list(request.kanbanContext, boardId, cardId, query);
  }

  @Post()
  @RequireScopes('flow:write')
  createComment(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: CreateCardCommentDto,
    @Req() request: KanbanRequest
  ) {
    return this.activities.createComment(request.kanbanContext, boardId, cardId, dto);
  }
}
