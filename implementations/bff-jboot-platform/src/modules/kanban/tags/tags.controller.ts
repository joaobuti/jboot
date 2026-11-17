import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CreateCardTagDto, UpdateCardTagDto } from './dto/tag.dto';
import { TagsService } from './tags.service';

@ApiTags('kanban-card-tags')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@Param('boardId') boardId: string, @Query() query: PageQueryDto, @Req() request: KanbanRequest) {
    return this.tags.list(request.kanbanContext, boardId, query);
  }

  @Post()
  @RequireScopes('flow:write')
  create(@Param('boardId') boardId: string, @Body() dto: CreateCardTagDto, @Req() request: KanbanRequest) {
    return this.tags.create(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Patch(':tagId')
  @RequireScopes('flow:write')
  update(
    @Param('boardId') boardId: string,
    @Param('tagId') tagId: string,
    @Body() dto: UpdateCardTagDto,
    @Req() request: KanbanRequest
  ) {
    return this.tags.update(request.kanbanContext, boardId, tagId, dto, buildMutateContext(request));
  }

  @Delete(':tagId')
  @HttpCode(204)
  @RequireScopes('flow:write')
  async remove(@Param('boardId') boardId: string, @Param('tagId') tagId: string, @Req() request: KanbanRequest): Promise<void> {
    await this.tags.remove(request.kanbanContext, boardId, tagId, buildMutateContext(request));
  }
}
