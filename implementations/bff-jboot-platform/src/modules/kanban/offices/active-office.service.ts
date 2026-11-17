import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { KanbanRequestContext } from '../kanban.types';
import { KanbanViewerResolver } from '../shared/kanban-viewer-resolver.service';
import { OFFICE_NOT_ALLOWED, USER_WITHOUT_OFFICE } from './card-office.policy';
import { pickActiveOffice } from './active-office';
import { OfficesRepository } from './offices.repository';

export const CUSTOMER_OFFICES_SCOPE = 'flow:customers:offices';

export interface ActiveOfficeState {
  /** Escritorio em que o usuario atua para cadastrar cliente e card; null sem escritorio ativo. */
  activeOfficeId: string | null;
  offices: Array<{ id: string; name: string; isPrincipal: boolean }>;
  /** Escolhe o escritorio da ficha do cliente (`flow:admin` ou `flow:customers:offices`). */
  canChooseCustomerOffices: boolean;
}

/**
 * Escritorio ativo do usuario (docs/product/flow-offices-sprints.md, Sprints 2 e 3): com mais de um
 * escritorio, ele escolhe em qual atua; cadastros de cliente e card vao para esse escritorio.
 */
@Injectable()
export class ActiveOfficeService {
  constructor(
    private readonly viewers: KanbanViewerResolver,
    private readonly offices: OfficesRepository
  ) {}

  async state(context: KanbanRequestContext): Promise<ActiveOfficeState> {
    const viewer = await this.viewers.resolve(context);
    const own = viewer.officeIds.length > 0 ? await this.offices.listByIds(context.databaseRef, context.clientId, viewer.officeIds) : [];
    const preference = await this.offices.getActiveOfficePreference(context.databaseRef, context.clientId, context.identityId);
    return {
      activeOfficeId: pickActiveOffice(own, preference),
      offices: own
        .filter((office) => office.active)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((office) => ({ id: office.id, name: office.name, isPrincipal: office.isPrincipal })),
      canChooseCustomerOffices: viewer.isAdmin || context.scopes.includes(CUSTOMER_OFFICES_SCOPE)
    };
  }

  async choose(context: KanbanRequestContext, officeId: string): Promise<ActiveOfficeState> {
    const current = await this.state(context);
    if (!current.offices.some((office) => office.id === officeId)) {
      throw new UnprocessableEntityException(OFFICE_NOT_ALLOWED);
    }
    await this.offices.setActiveOfficePreference(context.databaseRef, context.clientId, context.identityId, officeId);
    return { ...current, activeOfficeId: officeId };
  }

  /** Escritorio ativo obrigatorio (cadastro sem escolha): sem nenhum, 403. */
  async require(context: KanbanRequestContext): Promise<string> {
    const { activeOfficeId } = await this.state(context);
    if (!activeOfficeId) throw new ForbiddenException(USER_WITHOUT_OFFICE);
    return activeOfficeId;
  }
}
