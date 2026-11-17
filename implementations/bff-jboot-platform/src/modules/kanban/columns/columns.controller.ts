import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { ColumnsService } from './columns.service';
import { CreateBoardColumnDto, UpdateBoardColumnDto } from './dto/column.dto';

@ApiTags('kanban-board-columns')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/columns')
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Get()
  list(@Param('boardId') boardId: string, @Req() request: KanbanRequest) {
    return this.columns.list(request.kanbanContext, boardId);
  }

  @Post()
  @RequireScopes('flow:admin')
  create(@Param('boardId') boardId: string, @Body() dto: CreateBoardColumnDto, @Req() request: KanbanRequest) {
    return this.columns.create(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Patch(':columnId')
  @RequireScopes('flow:admin')
  update(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Body() dto: UpdateBoardColumnDto,
    @Req() request: KanbanRequest
  ) {
    return this.columns.update(request.kanbanContext, boardId, columnId, dto, buildMutateContext(request));
  }

  @Delete(':columnId')
  @HttpCode(204)
  @RequireScopes('flow:admin')
  async archive(
    @Param('boardId') boardId: string,
    @Param('columnId') columnId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.columns.archive(request.kanbanContext, boardId, columnId, buildMutateContext(request));
  }
}
