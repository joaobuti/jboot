import { Injectable, NotFoundException } from '@nestjs/common';
import { KanbanRequestContext, MutateContext, PageQuery } from '../kanban.types';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { BoardAccessService } from '../shared/board-access.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { AssignMemberProfileDto, CreateBoardMemberDto, UpdateBoardMemberDto } from './dto/member.dto';
import { MembersRepository } from './members.repository';

@Injectable()
export class MembersService {
  constructor(
    private readonly repository: MembersRepository,
    private readonly profiles: ProfilesRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, query: PageQuery) {
    await this.access.requireMember(context, boardId);
    const page = await this.repository.list(context.databaseRef, context.clientId, boardId, query);
    const identities = await this.repository.resolveDisplayNames(page.data.map((member) => member.identityId));
    return {
      ...page,
      data: page.data.map((member) => ({
        ...member,
        displayName: identities.get(member.identityId)?.displayName ?? null,
        documentNumber: identities.get(member.identityId)?.documentNumber ?? null
      }))
    };
  }

  async candidates(context: KanbanRequestContext, boardId: string) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    return this.repository.findCandidates(context.databaseRef, context.clientId, boardId);
  }

  async create(context: KanbanRequestContext, boardId: string, dto: CreateBoardMemberDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    const member = await this.repository.create(context.databaseRef, context.clientId, boardId, dto);
    await this.audit.record('kanban_board_member_added', mutate, boardId, { identityId: dto.identityId, role: dto.role });
    return member;
  }

  async update(
    context: KanbanRequestContext,
    boardId: string,
    memberId: string,
    dto: UpdateBoardMemberDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    const member = await this.repository.update(context.databaseRef, context.clientId, boardId, memberId, dto);
    await this.audit.record('kanban_board_member_updated', mutate, boardId, { memberId, ...dto });
    return member;
  }

  async remove(context: KanbanRequestContext, boardId: string, memberId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
    await this.repository.remove(context.databaseRef, context.clientId, boardId, memberId);
    await this.audit.record('kanban_board_member_removed', mutate, boardId, { memberId });
  }

  async assignProfile(
    context: KanbanRequestContext,
    boardId: string,
    memberId: string,
    dto: AssignMemberProfileDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);

    if (dto.profileId) {
      const profile = await this.profiles.findById(context.databaseRef, context.clientId, boardId, dto.profileId);
      if (!profile) {
        throw new NotFoundException('Member profile not found');
      }
    }

    const member = await this.repository.assignProfile(context.databaseRef, context.clientId, boardId, memberId, dto.profileId);
    await this.audit.record('kanban_board_member_profile_assigned', mutate, boardId, { memberId, profileId: dto.profileId });
    return member;
  }
}
