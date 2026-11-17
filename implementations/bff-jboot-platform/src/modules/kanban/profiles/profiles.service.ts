import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ColumnsRepository } from '../columns/columns.repository';
import { KanbanRequestContext, MutateContext, PageQuery } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { ColumnPermissionsRepository } from './column-permissions.repository';
import {
  CreateMemberProfileDto,
  ReplaceBoardColumnPermissionsDto,
  ReplaceMemberProfileTransitionsDto,
  UpdateMemberProfileDto
} from './dto/profile.dto';
import { ProfileTransitionsRepository } from './profile-transitions.repository';
import { ProfilesRepository } from './profiles.repository';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly transitions: ProfileTransitionsRepository,
    private readonly columnPermissions: ColumnPermissionsRepository,
    private readonly columns: ColumnsRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, query: PageQuery) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    return this.profiles.list(context.databaseRef, context.clientId, boardId, query);
  }

  async create(context: KanbanRequestContext, boardId: string, dto: CreateMemberProfileDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    const profile = await this.profiles.create(context.databaseRef, context.clientId, boardId, dto);
    await this.audit.record('kanban_member_profile_created', mutate, boardId, { profileId: profile.id, name: profile.name });
    return profile;
  }

  async update(
    context: KanbanRequestContext,
    boardId: string,
    profileId: string,
    dto: UpdateMemberProfileDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireProfile(context, boardId, profileId);
    const profile = await this.profiles.update(context.databaseRef, context.clientId, boardId, profileId, dto);
    await this.audit.record('kanban_member_profile_updated', mutate, boardId, { profileId, ...dto });
    return profile;
  }

  async remove(context: KanbanRequestContext, boardId: string, profileId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireProfile(context, boardId, profileId);
    await this.profiles.remove(context.databaseRef, context.clientId, boardId, profileId);
    await this.audit.record('kanban_member_profile_removed', mutate, boardId, { profileId });
  }

  async listTransitions(context: KanbanRequestContext, boardId: string, profileId: string) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireProfile(context, boardId, profileId);
    return this.transitions.list(context.databaseRef, context.clientId, profileId);
  }

  async replaceTransitions(
    context: KanbanRequestContext,
    boardId: string,
    profileId: string,
    dto: ReplaceMemberProfileTransitionsDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireProfile(context, boardId, profileId);

    const columnIds = await this.activeColumnIds(context, boardId);
    for (const transition of dto.transitions) {
      if (!columnIds.has(transition.fromBoardColumnId) || !columnIds.has(transition.toBoardColumnId)) {
        throw new BadRequestException('Transition references a column outside this board');
      }
    }

    const result = await this.transitions.replace(context.databaseRef, context.clientId, profileId, dto.transitions);
    await this.audit.record('kanban_member_profile_transitions_replaced', mutate, boardId, {
      profileId,
      count: result.length
    });
    return result;
  }

  async listColumnPermissions(context: KanbanRequestContext, boardId: string, profileId: string) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireProfile(context, boardId, profileId);
    return this.columnPermissions.list(context.databaseRef, context.clientId, profileId);
  }

  async replaceColumnPermissions(
    context: KanbanRequestContext,
    boardId: string,
    profileId: string,
    dto: ReplaceBoardColumnPermissionsDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.requireProfile(context, boardId, profileId);

    const columnIds = await this.activeColumnIds(context, boardId);
    for (const permission of dto.permissions) {
      if (!columnIds.has(permission.boardColumnId)) {
        throw new BadRequestException('Permission references a column outside this board');
      }
    }

    const result = await this.columnPermissions.replace(context.databaseRef, context.clientId, profileId, dto.permissions);
    await this.audit.record('kanban_board_column_permissions_replaced', mutate, boardId, {
      profileId,
      count: result.length
    });
    return result;
  }

  private async requireProfile(context: KanbanRequestContext, boardId: string, profileId: string) {
    const profile = await this.profiles.findById(context.databaseRef, context.clientId, boardId, profileId);
    if (!profile) {
      throw new NotFoundException('Member profile not found');
    }
    return profile;
  }

  private async activeColumnIds(context: KanbanRequestContext, boardId: string): Promise<Set<string>> {
    const columns = await this.columns.list(context.databaseRef, context.clientId, boardId);
    return new Set(columns.map((column) => column.id));
  }
}
