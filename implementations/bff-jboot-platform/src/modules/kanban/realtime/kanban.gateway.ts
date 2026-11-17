import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import { AppConfigService } from '../../../config/app-config.service';
import { CardsRepository } from '../cards/cards.repository';
import { CardsService } from '../cards/cards.service';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { KanbanRequestContext } from '../kanban.types';
import { ColumnPermissionsRepository } from '../profiles/column-permissions.repository';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { verifyKanbanToken } from '../shared/token';
import { FlowLiveEvent, FlowLiveEvents } from './flow-live-events';

interface AuthenticatedSocket extends Socket {
  kanbanContext?: KanbanRequestContext;
}

interface CardMovedPayload {
  cardId: string;
  fromBoardColumnId: string;
  toBoardColumnId: string;
  toPosition: number;
  movedByIdentityId: string;
  occurredAt: string;
}

@WebSocketGateway({
  namespace: '/flow/ws',
  cors: { origin: true, credentials: true }
})
@Injectable()
export class KanbanGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KanbanGateway.name);
  private liveSubscription?: Subscription;

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly config: AppConfigService,
    private readonly access: BoardAccessService,
    private readonly columnPermissions: ColumnPermissionsRepository,
    // Resolvido via ModuleRef (nao injecao direta no construtor): CardsService depende de
    // NotificationsService, que depende deste Gateway (push de notification.created) — injetar
    // CardsService aqui de volta criaria dependencia circular entre os tres providers.
    private readonly moduleRef: ModuleRef,
    private readonly visibility: CardVisibilityService,
    private readonly live: FlowLiveEvents,
    private readonly cards: CardsRepository,
    private readonly cardCustomers: CardCustomersRepository
  ) {}

  onModuleInit(): void {
    this.liveSubscription = this.live.events$.subscribe((event) => {
      void this.relay(event).catch((error: Error) => this.logger.warn(`live_event_failed scope=${event.scope} code=${error.message}`));
    });
  }

  onModuleDestroy(): void {
    this.liveSubscription?.unsubscribe();
  }

  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      socket.disconnect(true);
      return;
    }
    try {
      socket.kanbanContext = await verifyKanbanToken(this.config, token);
      // Toda conexao autenticada entra na sua propria room de notificacoes (escopo por identidade,
      // nao por board) — nao precisa de join explicito do client, o token ja identifica quem e.
      await socket.join(this.userRoom(socket.kanbanContext.identityId));
      // Sala do tenant: so avisos sem conteudo (`customer.updated` leva o id); a tela busca pelo HTTP.
      await socket.join(this.tenantRoom(socket.kanbanContext.clientId));
    } catch (error) {
      this.logger.warn(`Rejected kanban websocket handshake: ${(error as Error).message}`);
      socket.disconnect(true);
    }
  }

  pushNotification(identityId: string, notification: unknown): void {
    this.server.to(this.userRoom(identityId)).emit('notification.created', notification);
  }

  /**
   * Avisos em tempo real do que foi gravado (docs/product/flow-realtime-card-updates-sprints.md, R1).
   * `card.updated` segue a mesma regra do `card.moved` (card e coluna visiveis); `customer.updated` vai
   * para a sala do tenant e para os cards vinculados ao cliente. So ids e o tipo do evento.
   */
  private async relay(event: FlowLiveEvent): Promise<void> {
    if (event.scope === 'customer') {
      this.server.to(this.tenantRoom(event.clientId)).emit('customer.updated', { customerId: event.customerId, kind: event.kind });
      const cardIds = await this.cardCustomers.cardIdsByCustomer(event.databaseRef, event.clientId, event.customerId);
      for (const cardId of cardIds) await this.relayCard(event.databaseRef, event.clientId, cardId, event.kind);
      return;
    }
    await this.relayCard(event.databaseRef, event.clientId, event.cardId, event.kind);
  }

  private async relayCard(databaseRef: string, clientId: string, cardId: string, kind: string): Promise<void> {
    const card = await this.cards.findByIdForClient(databaseRef, clientId, cardId);
    if (!card) return;
    const sockets = await this.server.in(this.roomName(card.boardId)).fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const context = (socket as unknown as AuthenticatedSocket).kanbanContext;
        if (!context || context.clientId !== clientId) return;
        const eventContext = { ...context };
        const canReceive =
          (await this.canSeeCard(eventContext, card.boardId, cardId)) &&
          (await this.canViewColumn(eventContext, card.boardId, card.boardColumnId));
        if (canReceive) socket.emit('card.updated', { boardId: card.boardId, cardId, kind });
      })
    );
  }

  private tenantRoom(clientId: string): string {
    return `tenant:${clientId}`;
  }

  private userRoom(identityId: string): string {
    return `user:${identityId}`;
  }

  @SubscribeMessage('board.join')
  async onBoardJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { boardId: string }
  ): Promise<void> {
    const context = socket.kanbanContext;
    if (!context) {
      socket.disconnect(true);
      return;
    }
    try {
      // Sala do quadro = canal de LEITURA: mesma regra do HTTP (`requireMember`, membro ativo em
      // qualquer papel, inclusive `board_viewer`; Backlog T6). Mutacao via socket (`card.move`)
      // nao depende da sala: passa por `CardsService`, que exige `board_admin`/`board_member`.
      // Copia por evento: o viewer (chave do tenant, escritorios, admin efetivo) e memoizado por
      // objeto de contexto; o contexto do socket vive a conexao inteira.
      await this.access.requireMember({ ...context }, body.boardId);
      await socket.join(this.roomName(body.boardId));
    } catch {
      socket.emit('error', { code: 'board_join_denied', message: 'Cannot join this board' });
    }
  }

  @SubscribeMessage('board.leave')
  async onBoardLeave(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { boardId: string }
  ): Promise<void> {
    await socket.leave(this.roomName(body.boardId));
  }

  @SubscribeMessage('card.move')
  async onCardMove(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { boardId: string; cardId: string; toBoardColumnId: string; toPosition: number }
  ): Promise<void> {
    const context = socket.kanbanContext;
    if (!context) {
      socket.disconnect(true);
      return;
    }
    try {
      const eventContext = { ...context };
      const mutateContext = {
        ...context,
        userAgent: socket.handshake.headers['user-agent'] as string | undefined,
        ip: socket.handshake.address
      };
      const cards = this.moduleRef.get(CardsService, { strict: false });
      const result = await cards.move(
        eventContext,
        body.boardId,
        body.cardId,
        { toBoardColumnId: body.toBoardColumnId, toPosition: body.toPosition },
        mutateContext
      );
      await this.broadcastCardMoved(body.boardId, {
        cardId: body.cardId,
        fromBoardColumnId: result.fromBoardColumnId,
        toBoardColumnId: body.toBoardColumnId,
        toPosition: body.toPosition,
        movedByIdentityId: context.identityId,
        occurredAt: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('error', {
        code: error instanceof Error ? error.name : 'card_move_failed',
        message: error instanceof Error ? error.message : 'Card move failed'
      });
    }
  }

  /**
   * Revalida por socket e por evento: card visivel (membresia ativa ou admin efetivo e, com a
   * visibilidade por escritorio ligada, escritorio do card entre os atuais do usuario — Sprint
   * 3.5; quem saiu do escritorio, do quadro ou foi inativado deixa de receber no evento seguinte)
   * e ACL de coluna do perfil, mesma regra de leitura do HTTP (`ColumnsService.list`):
   * `board_admin` ve tudo; `board_member`/`board_viewer` seguem o `can_view` do perfil, e sem
   * perfil ou sem linha de ACL a coluna e visivel.
   */
  async broadcastCardMoved(boardId: string, payload: CardMovedPayload): Promise<void> {
    const sockets = await this.server.in(this.roomName(boardId)).fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const context = (socket as unknown as AuthenticatedSocket).kanbanContext;
        if (!context) {
          return;
        }
        const eventContext = { ...context };
        const canReceive =
          (await this.canSeeCard(eventContext, boardId, payload.cardId)) &&
          (await this.canViewColumn(eventContext, boardId, payload.toBoardColumnId));
        if (canReceive) {
          socket.emit('card.moved', { boardId, ...payload });
        }
      })
    );
  }

  private async canSeeCard(context: KanbanRequestContext, boardId: string, cardId: string): Promise<boolean> {
    try {
      await this.visibility.requireVisibleCard(context, boardId, cardId);
      return true;
    } catch {
      return false;
    }
  }

  private async canViewColumn(context: KanbanRequestContext, boardId: string, boardColumnId: string): Promise<boolean> {
    try {
      const membership = await this.access.resolveMembership(context, boardId);
      if (membership.role === 'board_admin') {
        return true;
      }
      const access = await this.columnPermissions.resolveForColumn(
        context.databaseRef,
        context.clientId,
        membership.profileId,
        boardColumnId
      );
      return access.canView;
    } catch {
      return false;
    }
  }

  private roomName(boardId: string): string {
    return `board:${boardId}`;
  }

  private extractToken(socket: Socket): string | null {
    const fromAuth = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth;
    }
    const header = socket.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    return null;
  }
}
