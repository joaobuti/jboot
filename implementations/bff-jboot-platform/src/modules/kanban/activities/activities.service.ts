import { Injectable } from '@nestjs/common';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { KanbanRequestContext } from '../kanban.types';
import { NotificationsService } from '../notifications/notifications.service';
import { ADMIN_ONLY_LEAD_EVENT_KINDS } from '../lead-analysis/lead-analysis-events';
import { BoardAccessService } from '../shared/board-access.service';
import { FLOW_ADMIN_SCOPE } from '../shared/card-visibility';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { ActivitiesRepository } from './activities.repository';
import { CreateCardCommentDto, ListCardActivitiesQueryDto } from './dto/activity.dto';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly repository: ActivitiesRepository,
    private readonly visibility: CardVisibilityService,
    private readonly access: BoardAccessService,
    private readonly assignees: AssigneesRepository,
    private readonly notifications: NotificationsService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, cardId: string, query: ListCardActivitiesQueryDto) {
    await this.access.requireMember(context, boardId);
    await this.requireCard(context, boardId, cardId);
    // P11 (CRM de leads, S6): eventos de classificacao e geracao so o gestor (`flow:admin`) ve.
    const hidden = context.scopes.includes(FLOW_ADMIN_SCOPE) ? [] : ADMIN_ONLY_LEAD_EVENT_KINDS;
    return this.repository.list(context.databaseRef, context.clientId, cardId, query, hidden);
  }

  /**
   * Escrita de `system_event` por integracao de dominio (nao por usuario). Nao
   * exige contexto de board nem papel: o chamador e um modulo interno que ja
   * validou o vinculo do card, e o evento e registro de historico, nao acao de
   * usuario. Existe para que integracoes nao acessem o repositorio direto.
   */
  async recordIntegrationEvent(input: {
    databaseRef: string;
    clientId: string;
    cardId: string;
    authorIdentityId: string;
    integrationKey: string;
    kind: string;
    payload: Record<string, unknown>;
  }) {
    return this.repository.createSystemEvent(
      input.databaseRef,
      input.clientId,
      input.cardId,
      input.authorIdentityId,
      input.kind,
      input.payload,
      input.integrationKey
    );
  }

  async createComment(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    dto: CreateCardCommentDto,
    origin: 'claude_connector' | null = null
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    await this.requireCard(context, boardId, cardId);
    const comment = await this.repository.createComment(
      context.databaseRef,
      context.clientId,
      cardId,
      context.identityId,
      dto.textContent,
      origin ? { origin } : null
    );

    // "Mencionado em comentario" (Sprint 7) e definido como assignee atual do card, nao @mencao
    // textual — comentario continua texto livre, sem sintaxe/picker de mencao nesta sprint.
    const assignees = await this.assignees.list(context.databaseRef, context.clientId, cardId);
    await Promise.all(
      assignees.map((assignee) =>
        this.notifications.notify(context, {
          boardId,
          cardId,
          recipientIdentityId: assignee.identityId,
          actorIdentityId: context.identityId,
          kind: 'card.commented',
          payload: {}
        })
      )
    );

    return comment;
  }

  /** Card visivel (Sprint 3.5): inexistente ou de outro escritorio = 404. */
  private async requireCard(context: KanbanRequestContext, boardId: string, cardId: string) {
    return this.visibility.requireVisibleCard(context, boardId, cardId);
  }
}
