import { Injectable } from '@nestjs/common';
import { KanbanRequestContext } from '../kanban.types';
import { OfficesRepository } from '../offices/offices.repository';
import { FLOW_ADMIN_SCOPE, KanbanViewer } from './card-visibility';

/**
 * Monta o `KanbanViewer` da requisicao: `isAdmin` vem do scope `flow:admin` do
 * JWT; chave do tenant e escritorios atuais vem do banco do Flow (uma consulta).
 *
 * Memoizado por OBJETO de contexto (um por requisicao HTTP, criado pelo
 * guard). Contexto de vida longa (socket) deve passar uma copia por evento
 * (`{ ...context }`) para que troca de escritorio valha no evento seguinte.
 */
@Injectable()
export class KanbanViewerResolver {
  private readonly memo = new WeakMap<KanbanRequestContext, Promise<KanbanViewer>>();

  constructor(private readonly offices: OfficesRepository) {}

  resolve(context: KanbanRequestContext): Promise<KanbanViewer> {
    const cached = this.memo.get(context);
    if (cached) {
      return cached;
    }
    const pending = this.load(context);
    this.memo.set(context, pending);
    // Falha nao fica memoizada.
    pending.catch(() => this.memo.delete(context));
    return pending;
  }

  private async load(context: KanbanRequestContext): Promise<KanbanViewer> {
    const state = await this.offices.loadViewerState(context.databaseRef, context.clientId, context.identityId);
    return {
      identityId: context.identityId,
      clientId: context.clientId,
      isAdmin: context.scopes.includes(FLOW_ADMIN_SCOPE),
      officeIds: state.officeIds,
      officeVisibilityEnabled: state.officeVisibilityEnabled
    };
  }
}
