import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CreateCardStatusDto, UpdateCardStatusDto } from './dto/status.dto';
import { StatusesService } from './statuses.service';

@ApiTags('kanban-card-statuses')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/statuses')
export class StatusesController {
  constructor(private readonly statuses: StatusesService) {}

  @Get()
  list(@Param('boardId') boardId: string, @Query() query: PageQueryDto, @Req() request: KanbanRequest) {
    return this.statuses.list(request.kanbanContext, boardId, query);
  }

  @Post()
  @RequireScopes('flow:write')
  create(@Param('boardId') boardId: string, @Body() dto: CreateCardStatusDto, @Req() request: KanbanRequest) {
    return this.statuses.create(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Patch(':statusId')
  @RequireScopes('flow:write')
  update(
    @Param('boardId') boardId: string,
    @Param('statusId') statusId: string,
    @Body() dto: UpdateCardStatusDto,
    @Req() request: KanbanRequest
  ) {
    return this.statuses.update(request.kanbanContext, boardId, statusId, dto, buildMutateContext(request));
  }

  @Delete(':statusId')
  @HttpCode(204)
  @RequireScopes('flow:write')
  async remove(
    @Param('boardId') boardId: string,
    @Param('statusId') statusId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.statuses.remove(request.kanbanContext, boardId, statusId, buildMutateContext(request));
  }
}
