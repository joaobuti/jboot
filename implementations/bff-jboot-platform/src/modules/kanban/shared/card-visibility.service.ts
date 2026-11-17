import { Injectable, NotFoundException } from '@nestjs/common';
import { CardRow, CardsRepository } from '../cards/cards.repository';
import { KanbanRequestContext } from '../kanban.types';
import { MembersRepository } from '../members/members.repository';
import { OfficesRepository } from '../offices/offices.repository';
import { BoardAccessService } from './board-access.service';
import { CardOfficeRef, canSeeCard, KanbanViewer, SqlFragment, visibleCardScope } from './card-visibility';
import { FlowAdminDirectory } from './flow-admin-directory.service';
import { KanbanViewerResolver } from './kanban-viewer-resolver.service';

export type VisibleCard = Omit<CardRow, 'total'>;

/**
 * Ponto UNICO de visibilidade de card (CRM de leads, Sprint 3.5; ADR 014,
 * Decisao 6). Toda rota com `:cardId` usa `requireVisibleCard`; toda consulta
 * de conjunto sobre `kanban_cards` usa `visibleCardScope`; realtime,
 * notificacao e e-mail usam `canSeeCard`/`identitiesWhoSeeCard`.
 * A regra em si esta em `card-visibility.ts` (funcoes puras).
 * Teste estatico `card-visibility.static.spec.ts` barra SQL sobre tabelas de
 * card fora deste filtro (allowlist comentada).
 */
@Injectable()
export class CardVisibilityService {
  constructor(
    private readonly viewers: KanbanViewerResolver,
    private readonly access: BoardAccessService,
    private readonly cards: CardsRepository,
    private readonly members: MembersRepository,
    private readonly offices: OfficesRepository,
    private readonly admins: FlowAdminDirectory
  ) {}

  resolveViewer(context: KanbanRequestContext): Promise<KanbanViewer> {
    return this.viewers.resolve(context);
  }

  visibleCardScope(viewer: KanbanViewer, alias: string, firstParam: number): SqlFragment {
    return visibleCardScope(viewer, alias, firstParam);
  }

  canSeeCard(viewer: KanbanViewer, card: CardOfficeRef, isActiveBoardMember: boolean): boolean {
    return canSeeCard(viewer, card, isActiveBoardMember);
  }

  /**
   * Card com `:cardId` em rota: exige leitura do quadro (membro ativo ou
   * admin efetivo; 403/404 como `requireMember`) e card visivel. Card
   * inexistente, excluido ou de escritorio que o usuario nao enxerga: 404
   * `Card not found` (nao revela que existe).
   */
  async requireVisibleCard(context: KanbanRequestContext, boardId: string, cardId: string): Promise<VisibleCard> {
    await this.access.requireMember(context, boardId);
    const card = await this.cards.findById(context.databaseRef, context.clientId, boardId, cardId);
    // requireMember ja garantiu membresia ativa ou admin efetivo.
    if (!card || !canSeeCard(await this.viewers.resolve(context), card, true)) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }

  /**
   * Destinatarios que VEEM o card agora (notificacao in-app, e-mail da
   * automacao, candidato/validacao de responsavel). Fora da requisicao, admin
   * vem do `FlowAdminDirectory`. Chave desligada: devolve os ids sem filtro
   * (comportamento anterior). Mantem a ordem de entrada.
   */
  async identitiesWhoSeeCard(
    databaseRef: string,
    clientId: string,
    boardId: string,
    cardId: string,
    identityIds: string[]
  ): Promise<string[]> {
    if (identityIds.length === 0) {
      return [];
    }
    if (!(await this.offices.isOfficeVisibilityEnabled(databaseRef, clientId))) {
      return identityIds;
    }
    const card = await this.cards.findById(databaseRef, clientId, boardId, cardId);
    if (!card) {
      return [];
    }
    const unique = [...new Set(identityIds)];
    const [admins, activeMembers, officesByIdentity] = await Promise.all([
      this.admins.adminIdentityIds(clientId),
      this.members.filterActiveMemberIds(databaseRef, clientId, boardId, unique),
      this.offices.listOfficeIdsByIdentity(databaseRef, clientId, unique)
    ]);
    return identityIds.filter((identityId) =>
      canSeeCard(
        {
          identityId,
          clientId,
          isAdmin: admins.has(identityId),
          officeIds: officesByIdentity.get(identityId) ?? [],
          officeVisibilityEnabled: true
        },
        card,
        activeMembers.has(identityId)
      )
    );
  }
}
