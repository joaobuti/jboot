import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { AssignMemberProfileDto, CreateBoardMemberDto, UpdateBoardMemberDto } from './dto/member.dto';
import { MembersService } from './members.service';

@ApiTags('kanban-board-members')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequireScopes('flow:admin')
  list(@Param('boardId') boardId: string, @Query() query: PageQueryDto, @Req() request: KanbanRequest) {
    return this.members.list(request.kanbanContext, boardId, query);
  }

  @Get('candidates')
  @RequireScopes('flow:admin')
  candidates(@Param('boardId') boardId: string, @Req() request: KanbanRequest) {
    return this.members.candidates(request.kanbanContext, boardId);
  }

  @Post()
  @RequireScopes('flow:admin')
  create(@Param('boardId') boardId: string, @Body() dto: CreateBoardMemberDto, @Req() request: KanbanRequest) {
    return this.members.create(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Patch(':memberId')
  @RequireScopes('flow:admin')
  update(
    @Param('boardId') boardId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateBoardMemberDto,
    @Req() request: KanbanRequest
  ) {
    return this.members.update(request.kanbanContext, boardId, memberId, dto, buildMutateContext(request));
  }

  @Delete(':memberId')
  @HttpCode(204)
  @RequireScopes('flow:admin')
  async remove(
    @Param('boardId') boardId: string,
    @Param('memberId') memberId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.members.remove(request.kanbanContext, boardId, memberId, buildMutateContext(request));
  }

  @Patch(':memberId/profile')
  @RequireScopes('flow:admin')
  assignProfile(
    @Param('boardId') boardId: string,
    @Param('memberId') memberId: string,
    @Body() dto: AssignMemberProfileDto,
    @Req() request: KanbanRequest
  ) {
    return this.members.assignProfile(request.kanbanContext, boardId, memberId, dto, buildMutateContext(request));
  }
}
