import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { AssigneesService } from './assignees.service';
import { CreateCardAssigneeDto } from './dto/assignee.dto';

@ApiTags('kanban-card-assignees')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/assignees')
export class AssigneesController {
  constructor(private readonly assignees: AssigneesService) {}

  @Get()
  list(@Param('boardId') boardId: string, @Param('cardId') cardId: string, @Req() request: KanbanRequest) {
    return this.assignees.list(request.kanbanContext, boardId, cardId);
  }

  // Seletor de responsaveis (Sprint 3.5): so quem ve o card. Rota literal antes de ':identityId'.
  @Get('candidates')
  candidates(@Param('boardId') boardId: string, @Param('cardId') cardId: string, @Req() request: KanbanRequest) {
    return this.assignees.candidates(request.kanbanContext, boardId, cardId);
  }

  @Post()
  @RequireScopes('flow:write')
  create(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: CreateCardAssigneeDto,
    @Req() request: KanbanRequest
  ) {
    return this.assignees.create(request.kanbanContext, boardId, cardId, dto, buildMutateContext(request));
  }

  @Delete(':identityId')
  @HttpCode(204)
  @RequireScopes('flow:write')
  async remove(
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Param('identityId') identityId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.assignees.remove(request.kanbanContext, boardId, cardId, identityId, buildMutateContext(request));
  }
}
