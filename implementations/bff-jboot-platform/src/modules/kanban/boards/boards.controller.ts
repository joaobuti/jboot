import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { BoardsService } from './boards.service';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto';

@ApiTags('kanban-boards')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(@Query() query: PageQueryDto, @Req() request: KanbanRequest) {
    return this.boards.list(request.kanbanContext, query);
  }

  @Get(':boardId')
  get(@Param('boardId') boardId: string, @Req() request: KanbanRequest) {
    return this.boards.get(request.kanbanContext, boardId);
  }

  @Post()
  @RequireScopes('flow:admin')
  create(@Body() dto: CreateBoardDto, @Req() request: KanbanRequest) {
    return this.boards.create(request.kanbanContext, dto, buildMutateContext(request));
  }

  @Patch(':boardId')
  @RequireScopes('flow:admin')
  update(@Param('boardId') boardId: string, @Body() dto: UpdateBoardDto, @Req() request: KanbanRequest) {
    return this.boards.update(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Delete(':boardId')
  @HttpCode(204)
  @RequireScopes('flow:admin')
  async archive(@Param('boardId') boardId: string, @Req() request: KanbanRequest): Promise<void> {
    await this.boards.archive(request.kanbanContext, boardId, buildMutateContext(request));
  }
}
