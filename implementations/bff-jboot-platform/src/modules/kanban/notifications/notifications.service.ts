import { Injectable } from '@nestjs/common';
import { KanbanRequestContext } from '../kanban.types';
import { PlatformNotificationsService } from '../../notifications/platform-notifications.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { NotificationKind } from './notifications.repository';

export interface NotifyParams {
  boardId: string;
  cardId: string;
  recipientIdentityId: string;
  actorIdentityId: string;
  kind: NotificationKind;
  payload: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly platformNotifications: PlatformNotificationsService,
    private readonly visibility: CardVisibilityService
  ) {}

  // Nunca notifica o proprio autor da acao (ex.: voce se atribui, voce mesmo comenta).
  // Sprint 3.5: so notifica quem VE o card no momento do envio (escritorio); destinatario
  // de outro escritorio e ignorado sem erro. Chave desligada: sem filtro (comportamento anterior).
  async notify(context: KanbanRequestContext, params: NotifyParams): Promise<void> {
    if (params.recipientIdentityId === params.actorIdentityId) {
      return;
    }
    const allowed = await this.visibility.identitiesWhoSeeCard(context.databaseRef, context.clientId, params.boardId, params.cardId, [
      params.recipientIdentityId
    ]);
    if (allowed.length === 0) {
      return;
    }
    await this.platformNotifications.publish({
      clientId: context.clientId,
      applicationSlug: 'flow',
      moduleSlug: 'kanban',
      recipientIdentityId: params.recipientIdentityId,
      actorIdentityId: params.actorIdentityId,
      kind: this.toPlatformKind(params.kind),
      title: this.toTitle(params.kind),
      body: null,
      entityType: 'kanban.card',
      entityId: params.cardId,
      actionUrl: `/flow/boards/${params.boardId}?card=${params.cardId}`,
      severity: 'info',
      payload: {
        boardId: params.boardId,
        cardId: params.cardId,
        ...params.payload
      }
    });
  }

  async listForIdentity(context: KanbanRequestContext, unreadOnly: boolean) {
    return this.platformNotifications.list(context, { applicationSlug: 'flow', moduleSlug: 'kanban', unreadOnly });
  }

  async markRead(context: KanbanRequestContext, notificationId: string): Promise<void> {
    await this.platformNotifications.markRead(context, notificationId);
  }

  async markAllRead(context: KanbanRequestContext): Promise<void> {
    await this.platformNotifications.markAllRead(context, { applicationSlug: 'flow', moduleSlug: 'kanban' });
  }

  private toPlatformKind(kind: NotificationKind): string {
    return `kanban.${kind}`;
  }

  private toTitle(kind: NotificationKind): string {
    if (kind === 'card.assigned') {
      return 'Voce foi atribuido a um card';
    }
    if (kind === 'card.commented') {
      return 'Novo comentario em card atribuido a voce';
    }
    if (kind === 'card.document_rejected') {
      return 'Documento rejeitado em card seu';
    }
    if (kind === 'card.lead_submitted') {
      return 'Novo lead enviado para analise';
    }
    if (kind === 'card.lead_returned') {
      return 'Lead devolvido ao escritorio';
    }
    if (kind === 'card.lead_document_approved') {
      return 'Documento aprovado disponivel no lead';
    }
    return 'Card atribuido a voce foi movido';
  }
}
