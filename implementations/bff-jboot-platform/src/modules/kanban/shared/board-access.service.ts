import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardsRepository } from '../boards/boards.repository';
import { ActiveMembership, MembersRepository } from '../members/members.repository';
import { BoardMemberRole, KanbanRequestContext } from '../kanban.types';
import { ColumnPermissionsRepository } from '../profiles/column-permissions.repository';
import { ProfileTransitionsRepository } from '../profiles/profile-transitions.repository';
import { MemberProfileCapabilities, ProfilesRepository } from '../profiles/profiles.repository';
import { KanbanViewerResolver } from './kanban-viewer-resolver.service';

const NO_CAPABILITIES: MemberProfileCapabilities = {
  canDeleteArchivedCards: false,
  canManageTags: false,
  canManageStatuses: false,
  canReviewDocuments: false
};
const ALL_CAPABILITIES: MemberProfileCapabilities = {
  canDeleteArchivedCards: true,
  canManageTags: true,
  canManageStatuses: true,
  canReviewDocuments: true
};

@Injectable()
export class BoardAccessService {
  constructor(
    private readonly boards: BoardsRepository,
    private readonly members: MembersRepository,
    private readonly transitions: ProfileTransitionsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly columnPermissions: ColumnPermissionsRepository,
    private readonly viewers: KanbanViewerResolver
  ) {}

  async requireBoard(context: KanbanRequestContext, boardId: string) {
    const board = await this.boards.findById(context.databaseRef, context.clientId, boardId, context.identityId);
    if (!board) {
      throw new NotFoundException('Board not found');
    }
    return board;
  }

  /**
   * Leitura de conteudo do quadro (cards, colunas, historico, anexos, checklist,
   * tags, status, responsaveis, membros). `requireBoard` so garante que o quadro
   * existe no tenant (LEFT JOIN de membresia) e NAO autoriza leitura; aqui se
   * exige membresia ATIVA em qualquer papel, inclusive `board_viewer`.
   * Isolamento entre bases remotas e por quadro (decisao de 2026-10-09,
   * docs/product/flow-crm-leads-sprints.md). Outro tenant/quadro inexistente: 404.
   * `flow:admin` le sem ser membro
   * (`resolveEffectiveRole`, Sprint 3.5). Conteudo de CARD exige ainda o card
   * visivel (`CardVisibilityService.requireVisibleCard`).
   */
  async requireMember(context: KanbanRequestContext, boardId: string): Promise<ActiveMembership> {
    await this.requireBoard(context, boardId);
    const membership = await this.resolveEffectiveRole(context, boardId);
    if (!membership) {
      throw new ForbiddenException({
        code: 'board_membership_required',
        message: 'Active board membership is required to read board content'
      });
    }
    return membership;
  }

  async requireRole(
    context: KanbanRequestContext,
    boardId: string,
    allowed: BoardMemberRole[]
  ): Promise<BoardMemberRole> {
    const role = (await this.resolveEffectiveRole(context, boardId))?.role ?? null;
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException('Insufficient board role');
    }
    return role;
  }

  /**
   * Papel efetivo no quadro: `flow:admin` opera como `board_admin` em qualquer
   * quadro do tenant, mesmo sem ser membro, com a visibilidade por escritorio
   * ligada ou nao (regra de 2026-11-11; antes valia so com a chave ligada).
   * Demais usuarios: a membresia ativa. `null` = sem acesso.
   */
  async resolveEffectiveRole(context: KanbanRequestContext, boardId: string): Promise<ActiveMembership | null> {
    const membership = await this.members.findActiveMembership(
      context.databaseRef,
      context.clientId,
      boardId,
      context.identityId
    );
    if (membership?.role === 'board_admin') {
      return membership;
    }
    if ((await this.viewers.resolve(context)).isAdmin) {
      return { role: 'board_admin', profileId: membership?.profileId ?? null };
    }
    return membership;
  }

  /** `flow:admin`: `board_admin` efetivo em todo quadro do tenant, membro ou nao (regra de 2026-11-11). */
  async isEffectiveTenantAdmin(context: KanbanRequestContext): Promise<boolean> {
    return (await this.viewers.resolve(context)).isAdmin;
  }

  async resolveMembership(context: KanbanRequestContext, boardId: string): Promise<ActiveMembership> {
    const membership = await this.resolveEffectiveRole(context, boardId);
    if (!membership) {
      throw new ForbiddenException('Insufficient board role');
    }
    return membership;
  }

  async requireTransitionAllowed(
    context: KanbanRequestContext,
    boardId: string,
    fromBoardColumnId: string,
    toBoardColumnId: string
  ): Promise<void> {
    const membership = await this.resolveMembership(context, boardId);
    if (membership.role === 'board_admin') {
      return;
    }
    if (!membership.profileId) {
      throw new ForbiddenException({ code: 'no_profile_assigned', message: 'Member has no profile assigned' });
    }
    const allowed = await this.transitions.isAllowed(
      context.databaseRef,
      context.clientId,
      membership.profileId,
      fromBoardColumnId,
      toBoardColumnId
    );
    if (!allowed) {
      throw new ForbiddenException({ code: 'transition_not_allowed', message: 'Transition not allowed for this profile' });
    }
  }

  async requireColumnEditable(context: KanbanRequestContext, boardId: string, boardColumnId: string): Promise<void> {
    const membership = await this.resolveMembership(context, boardId);
    if (membership.role === 'board_admin') {
      return;
    }
    const access = await this.columnPermissions.resolveForColumn(
      context.databaseRef,
      context.clientId,
      membership.profileId,
      boardColumnId
    );
    if (!access.canEdit) {
      throw new ForbiddenException({ code: 'column_not_editable', message: 'Profile cannot edit this column' });
    }
  }

  async requireCanDeleteArchivedCard(
    context: KanbanRequestContext,
    boardId: string,
    cardCreatedByIdentityId: string
  ): Promise<void> {
    const membership = await this.resolveMembership(context, boardId);
    if (membership.role === 'board_admin' || context.identityId === cardCreatedByIdentityId) {
      return;
    }
    if (!membership.profileId) {
      throw new ForbiddenException({ code: 'no_profile_assigned', message: 'Member has no profile assigned' });
    }
    const capability = await this.profiles.findCapability(context.databaseRef, context.clientId, membership.profileId);
    if (!capability?.canDeleteArchivedCards) {
      throw new ForbiddenException({
        code: 'cannot_delete_archived_card',
        message: 'Not the card author, profile without can_delete_archived_cards, and not board_admin'
      });
    }
  }

  async requireCanManageTags(context: KanbanRequestContext, boardId: string): Promise<void> {
    await this.requireCapability(context, boardId, 'canManageTags');
  }

  async requireCanManageStatuses(context: KanbanRequestContext, boardId: string): Promise<void> {
    await this.requireCapability(context, boardId, 'canManageStatuses');
  }

  /**
   * Revisao de documento do checklist (CRM de leads, Sprint 2): `board_admin`
   * sempre; `board_member` so com perfil `can_review_documents`; `board_viewer`
   * nunca (papel somente leitura, mesmo com perfil revisor).
   */
  async canReviewDocuments(context: KanbanRequestContext, boardId: string): Promise<boolean> {
    const membership = await this.resolveEffectiveRole(context, boardId);
    if (!membership) {
      return false;
    }
    if (membership.role === 'board_admin') {
      return true;
    }
    if (membership.role !== 'board_member' || !membership.profileId) {
      return false;
    }
    const capabilities = await this.profiles.findCapability(context.databaseRef, context.clientId, membership.profileId);
    return capabilities?.canReviewDocuments === true;
  }

  async requireCanReviewDocuments(context: KanbanRequestContext, boardId: string): Promise<void> {
    if (!(await this.canReviewDocuments(context, boardId))) {
      throw new ForbiddenException({
        code: 'cannot_review_documents',
        message: 'Only board_admin or a member whose profile can review documents may change document status'
      });
    }
  }

  async resolveCapabilities(context: KanbanRequestContext, boardId: string): Promise<MemberProfileCapabilities> {
    const membership = await this.resolveEffectiveRole(context, boardId);
    if (!membership) {
      return NO_CAPABILITIES;
    }
    if (membership.role === 'board_admin') {
      return ALL_CAPABILITIES;
    }
    if (!membership.profileId) {
      return NO_CAPABILITIES;
    }
    const capability = await this.profiles.findCapability(context.databaseRef, context.clientId, membership.profileId);
    return capability ?? NO_CAPABILITIES;
  }

  private async requireCapability(
    context: KanbanRequestContext,
    boardId: string,
    capability: keyof MemberProfileCapabilities
  ): Promise<void> {
    const membership = await this.resolveMembership(context, boardId);
    if (membership.role === 'board_admin') {
      return;
    }
    if (!membership.profileId) {
      throw new ForbiddenException({ code: 'no_profile_assigned', message: 'Member has no profile assigned' });
    }
    const capabilities = await this.profiles.findCapability(context.databaseRef, context.clientId, membership.profileId);
    if (!capabilities?.[capability]) {
      throw new ForbiddenException({ code: `missing_capability_${capability}`, message: `Profile lacks ${capability}` });
    }
  }
}
