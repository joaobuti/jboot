import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '../dto/common.dto';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import {
  CreateMemberProfileDto,
  ReplaceBoardColumnPermissionsDto,
  ReplaceMemberProfileTransitionsDto,
  UpdateMemberProfileDto
} from './dto/profile.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('kanban-member-profiles')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @RequireScopes('flow:admin')
  list(@Param('boardId') boardId: string, @Query() query: PageQueryDto, @Req() request: KanbanRequest) {
    return this.profiles.list(request.kanbanContext, boardId, query);
  }

  @Post()
  @RequireScopes('flow:admin')
  create(@Param('boardId') boardId: string, @Body() dto: CreateMemberProfileDto, @Req() request: KanbanRequest) {
    return this.profiles.create(request.kanbanContext, boardId, dto, buildMutateContext(request));
  }

  @Patch(':profileId')
  @RequireScopes('flow:admin')
  update(
    @Param('boardId') boardId: string,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateMemberProfileDto,
    @Req() request: KanbanRequest
  ) {
    return this.profiles.update(request.kanbanContext, boardId, profileId, dto, buildMutateContext(request));
  }

  @Delete(':profileId')
  @HttpCode(204)
  @RequireScopes('flow:admin')
  async remove(
    @Param('boardId') boardId: string,
    @Param('profileId') profileId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    await this.profiles.remove(request.kanbanContext, boardId, profileId, buildMutateContext(request));
  }

  @Get(':profileId/transitions')
  @RequireScopes('flow:admin')
  listTransitions(
    @Param('boardId') boardId: string,
    @Param('profileId') profileId: string,
    @Req() request: KanbanRequest
  ) {
    return this.profiles.listTransitions(request.kanbanContext, boardId, profileId);
  }

  @Put(':profileId/transitions')
  @RequireScopes('flow:admin')
  replaceTransitions(
    @Param('boardId') boardId: string,
    @Param('profileId') profileId: string,
    @Body() dto: ReplaceMemberProfileTransitionsDto,
    @Req() request: KanbanRequest
  ) {
    return this.profiles.replaceTransitions(request.kanbanContext, boardId, profileId, dto, buildMutateContext(request));
  }

  @Get(':profileId/column-permissions')
  @RequireScopes('flow:admin')
  listColumnPermissions(
    @Param('boardId') boardId: string,
    @Param('profileId') profileId: string,
    @Req() request: KanbanRequest
  ) {
    return this.profiles.listColumnPermissions(request.kanbanContext, boardId, profileId);
  }

  @Put(':profileId/column-permissions')
  @RequireScopes('flow:admin')
  replaceColumnPermissions(
    @Param('boardId') boardId: string,
    @Param('profileId') profileId: string,
    @Body() dto: ReplaceBoardColumnPermissionsDto,
    @Req() request: KanbanRequest
  ) {
    return this.profiles.replaceColumnPermissions(request.kanbanContext, boardId, profileId, dto, buildMutateContext(request));
  }
}
