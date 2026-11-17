import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { KanbanRequestContext } from '../kanban.types';
import { KanbanViewerResolver } from '../shared/kanban-viewer-resolver.service';
import { OfficesRepository } from './offices.repository';
import { pickActiveOffice } from './active-office';

export const USER_WITHOUT_OFFICE = {
  code: 'user_without_office',
  message: 'Your user is not linked to an active office. Contact the administrator.'
} as const;

export const OFFICE_REQUIRED = {
  code: 'office_required',
  message: 'Choose the office of the card'
} as const;

export const OFFICE_NOT_ALLOWED = {
  code: 'office_not_allowed',
  message: 'Office not found, inactive or not one of your offices'
} as const;

/**
 * Escritorio de um card NOVO (ADR 014, Decisao 6 "Escolha do escritorio na
 * criacao"). Vale para criar na tela, criar na coluna e importacao de dominio.
 *
 * - chave desligada: `null` (comportamento anterior; `officeId` enviado e ignorado);
 * - `flow:admin`: `officeId` obrigatorio (422 `office_required`), qualquer
 *   escritorio ATIVO do tenant (422 `office_not_allowed`);
 * - demais: so escritorios ATIVOS do proprio usuario; sem nenhum = 403
 *   `user_without_office`; um so = automatico; varios sem `officeId` = o
 *   escritorio ativo do usuario (flow-offices-sprints.md, S2); `officeId`
 *   fora dos seus = 422 `office_not_allowed`.
 */
@Injectable()
export class CardOfficePolicy {
  constructor(
    private readonly viewers: KanbanViewerResolver,
    private readonly offices: OfficesRepository
  ) {}

  async resolveForNewCard(context: KanbanRequestContext, requestedOfficeId?: string | null): Promise<string | null> {
    const viewer = await this.viewers.resolve(context);
    if (!viewer.officeVisibilityEnabled) {
      return null;
    }
    if (viewer.isAdmin) {
      if (!requestedOfficeId) {
        throw new UnprocessableEntityException(OFFICE_REQUIRED);
      }
      const office = await this.offices.findById(context.databaseRef, context.clientId, requestedOfficeId);
      if (!office?.active) {
        throw new UnprocessableEntityException(OFFICE_NOT_ALLOWED);
      }
      return office.id;
    }
    const own = viewer.officeIds.length > 0 ? await this.offices.listByIds(context.databaseRef, context.clientId, viewer.officeIds) : [];
    const activeOwn = own.filter((office) => office.active).map((office) => office.id);
    if (activeOwn.length === 0) {
      throw new ForbiddenException(USER_WITHOUT_OFFICE);
    }
    if (requestedOfficeId) {
      if (!activeOwn.includes(requestedOfficeId)) {
        throw new UnprocessableEntityException(OFFICE_NOT_ALLOWED);
      }
      return requestedOfficeId;
    }
    if (activeOwn.length === 1) {
      return activeOwn[0];
    }
    // Varios escritorios sem escolha: o escritorio ativo do usuario (flow-offices-sprints.md, S2).
    const preference = await this.offices.getActiveOfficePreference(context.databaseRef, context.clientId, context.identityId);
    const active = pickActiveOffice(own, preference);
    if (active) return active;
    throw new UnprocessableEntityException(OFFICE_REQUIRED);
  }
}
