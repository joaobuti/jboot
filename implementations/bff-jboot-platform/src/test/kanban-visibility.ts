import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { BoardsRepository } from '../modules/kanban/boards/boards.repository';
import { CardsRepository } from '../modules/kanban/cards/cards.repository';
import { LeadEditLock } from '../modules/kanban/leads/lead-edit-lock.service';
import { LeadsRepository } from '../modules/kanban/leads/leads.repository';
import { KanbanRequestContext } from '../modules/kanban/kanban.types';
import { MembersRepository } from '../modules/kanban/members/members.repository';
import { CardOfficePolicy } from '../modules/kanban/offices/card-office.policy';
import { OfficesRepository } from '../modules/kanban/offices/offices.repository';
import { ColumnPermissionsRepository } from '../modules/kanban/profiles/column-permissions.repository';
import { ProfileTransitionsRepository } from '../modules/kanban/profiles/profile-transitions.repository';
import { ProfilesRepository } from '../modules/kanban/profiles/profiles.repository';
import { BoardAccessService } from '../modules/kanban/shared/board-access.service';
import { canSeeCard, KanbanViewer, visibleCardScope } from '../modules/kanban/shared/card-visibility';
import { CardVisibilityService } from '../modules/kanban/shared/card-visibility.service';
import { FlowAdminDirectory } from '../modules/kanban/shared/flow-admin-directory.service';
import { KanbanViewerResolver } from '../modules/kanban/shared/kanban-viewer-resolver.service';

/**
 * Apoio de teste para a visibilidade por escritorio (CRM de leads, Sprint 3.5).
 * Specs anteriores a Sprint 3.5 usam o viewer com a chave DESLIGADA, que e
 * exatamente a regra anterior (so membresia).
 */

/** Chave do tenant desligada: regra anterior (membresia ativa). */
export function keyOffViewer(identityId: string, clientId: string): KanbanViewer {
  return { identityId, clientId, isAdmin: false, officeIds: [], officeVisibilityEnabled: false };
}

/**
 * Escopo neutro para specs de REPOSITORIO que testam outros filtros sem semear
 * membresia (admin com a chave ligada = `TRUE`). A regra de visibilidade tem
 * specs proprias.
 */
export function allCardsViewer(clientId: string): KanbanViewer {
  return { identityId: '00000000-0000-0000-0000-000000000000', clientId, isAdmin: true, officeIds: [], officeVisibilityEnabled: true };
}

/** Diretorio de admins sem Identity (specs em banco do Flow apenas). */
export function fakeAdminDirectory(adminIds: string[] = [], users: Array<{ identityId: string; displayName?: string | null }> = []) {
  return {
    adminIdentityIds: async () => new Set(adminIds),
    isAdmin: async (_clientId: string, identityId: string) => adminIds.includes(identityId),
    listFlowUsers: async () =>
      users.map((user) => ({
        identityId: user.identityId,
        displayName: user.displayName ?? null,
        email: null,
        isAdmin: adminIds.includes(user.identityId)
      }))
  } as unknown as FlowAdminDirectory;
}

/**
 * Stub de `CardVisibilityService` para specs UNITARIOS anteriores a Sprint 3.5:
 * chave desligada (todo destinatario passa, card visivel = card existente).
 */
export function keyOffVisibility(findCard: (boardId: string, cardId: string) => Promise<unknown>) {
  return {
    resolveViewer: async (context: KanbanRequestContext) => keyOffViewer(context.identityId, context.clientId),
    visibleCardScope,
    canSeeCard,
    requireVisibleCard: async (_context: KanbanRequestContext, boardId: string, cardId: string) => {
      const card = await findCard(boardId, cardId);
      if (!card) {
        throw new NotFoundException('Card not found');
      }
      return card;
    },
    identitiesWhoSeeCard: async (_ref: string, _client: string, _board: string, _card: string, ids: string[]) => ids
  } as unknown as CardVisibilityService;
}

/**
 * Lead sem envio (CRM de leads, Sprint 4) para specs UNITARIOS anteriores: nenhum
 * card tem estado de lead, nada congela.
 */
export const noLeadsRepository = { statusByCardForBoard: async () => new Map() } as unknown as LeadsRepository;
export const noLeadLock = { assertEditable: async () => undefined, isEditable: async () => true } as unknown as LeadEditLock;

/** Office policy com a chave desligada: card novo sem escritorio. */
export const keyOffOfficePolicy = { resolveForNewCard: async () => null } as unknown as CardOfficePolicy;

/** Stack real (banco de dev em transacao) de acesso + visibilidade. */
export function buildRealVisibility(db: DatabaseService, directory: FlowAdminDirectory = fakeAdminDirectory()) {
  const members = new MembersRepository(db);
  const offices = new OfficesRepository(db);
  const viewers = new KanbanViewerResolver(offices);
  const access = new BoardAccessService(
    new BoardsRepository(db),
    members,
    new ProfileTransitionsRepository(db),
    new ProfilesRepository(db),
    new ColumnPermissionsRepository(db),
    viewers
  );
  const cards = new CardsRepository(db);
  const visibility = new CardVisibilityService(viewers, access, cards, members, offices, directory);
  const officePolicy = new CardOfficePolicy(viewers, offices);
  const leads = new LeadsRepository(db);
  const leadLock = new LeadEditLock(leads);
  return { members, offices, viewers, access, cards, visibility, officePolicy, directory, leads, leadLock };
}
