import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ActivitiesRepository } from '../activities/activities.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { MembersRepository } from '../members/members.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { AssigneesRepository } from './assignees.repository';
import { CreateCardAssigneeDto } from './dto/assignee.dto';

@Injectable()
export class AssigneesService {
  constructor(
    private readonly repository: AssigneesRepository,
    private readonly visibility: CardVisibilityService,
    private readonly members: MembersRepository,
    private readonly activities: ActivitiesRepository,
    private readonly access: BoardAccessService,
    private readonly notifications: NotificationsService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, cardId: string) {
    await this.access.requireMember(context, boardId);
    await this.requireCard(context, boardId, cardId);
    return this.repository.list(context.databaseRef, context.clientId, cardId);
  }

  async create(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    dto: CreateCardAssigneeDto,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    await this.requireCard(context, boardId, cardId);

    const membership = await this.members.findActiveMembership(
      context.databaseRef,
      context.clientId,
      boardId,
      dto.identityId
    );
    if (!membership) {
      throw new UnprocessableEntityException({
        code: 'identity_not_active_member',
        message: 'identityId is not an active board_member of this board'
      });
    }
    // Com a visibilidade por escritorio ligada, o responsavel tambem precisa ver o card
    // (escritorio do card entre os seus, ou administrador). Chave desligada: sem filtro.
    const canSee = await this.visibility.identitiesWhoSeeCard(context.databaseRef, context.clientId, boardId, cardId, [dto.identityId]);
    if (canSee.length === 0) {
      throw new UnprocessableEntityException({
        code: 'identity_not_in_card_office',
        message: 'identityId does not belong to the office of this card'
      });
    }

    return this.attach(context, boardId, cardId, dto.identityId, mutate);
  }

  /**
   * Responsaveis definidos pelo sistema (card de entrada da validacao, ADR 019, decisao 16): sem exigir
   * papel de quem confirmou, mas cada responsavel precisa ser membro ativo do board e ver o card. Quem
   * nao cumpre fica de fora com o motivo; nunca lanca por causa de um deles.
   */
  async assignBySystem(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    identityIds: readonly string[],
    mutate: MutateContext
  ): Promise<{ assigned: string[]; skipped: Array<{ identityId: string; reason: 'not_board_member' | 'not_in_card_office' }> }> {
    const assigned: string[] = [];
    const skipped: Array<{ identityId: string; reason: 'not_board_member' | 'not_in_card_office' }> = [];
    for (const identityId of identityIds) {
      if (!(await this.members.findActiveMembership(context.databaseRef, context.clientId, boardId, identityId))) {
        skipped.push({ identityId, reason: 'not_board_member' });
        continue;
      }
      const canSee = await this.visibility.identitiesWhoSeeCard(context.databaseRef, context.clientId, boardId, cardId, [identityId]);
      if (canSee.length === 0) {
        skipped.push({ identityId, reason: 'not_in_card_office' });
        continue;
      }
      await this.attach(context, boardId, cardId, identityId, mutate);
      assigned.push(identityId);
    }
    return { assigned, skipped };
  }

  private async attach(context: KanbanRequestContext, boardId: string, cardId: string, identityId: string, mutate: MutateContext) {
    const assignee = await this.repository.create(context.databaseRef, context.clientId, cardId, identityId, context.identityId);
    await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, 'card.assignee_added', {
      identityId
    });
    await this.notifications.notify(context, {
      boardId,
      cardId,
      recipientIdentityId: identityId,
      actorIdentityId: mutate.identityId,
      kind: 'card.assigned',
      payload: {}
    });
    return assignee;
  }

  async remove(context: KanbanRequestContext, boardId: string, cardId: string, identityId: string, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    await this.requireCard(context, boardId, cardId);

    const removed = await this.repository.remove(context.databaseRef, context.clientId, cardId, identityId);
    if (!removed) {
      throw new NotFoundException('Assignee not found');
    }
    await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, 'card.assignee_removed', {
      identityId
    });
  }

  /**
   * Candidatos a responsavel do card: membros ATIVOS do quadro que veem o card
   * (Sprint 3.5: escritorio do card entre os seus, ou administrador; chave
   * desligada = todos os membros ativos). Leitura com card visivel.
   */
  async candidates(context: KanbanRequestContext, boardId: string, cardId: string) {
    await this.requireCard(context, boardId, cardId);
    const active = await this.members.listActiveMembers(context.databaseRef, context.clientId, boardId);
    const visibleIds = new Set(
      await this.visibility.identitiesWhoSeeCard(
        context.databaseRef,
        context.clientId,
        boardId,
        cardId,
        active.map((member) => member.identityId)
      )
    );
    const eligible = active.filter((member) => visibleIds.has(member.identityId));
    const names = await this.members.resolveDisplayNames(eligible.map((member) => member.identityId));
    return eligible.map((member) => ({
      identityId: member.identityId,
      role: member.role,
      displayName: names.get(member.identityId)?.displayName ?? null
    }));
  }

  /** Card visivel (Sprint 3.5): inexistente ou de outro escritorio = 404. */
  private async requireCard(context: KanbanRequestContext, boardId: string, cardId: string) {
    return this.visibility.requireVisibleCard(context, boardId, cardId);
  }
}
