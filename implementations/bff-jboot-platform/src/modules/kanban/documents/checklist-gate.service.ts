import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { KanbanRequestContext } from '../kanban.types';
import { CardDocumentsRepository } from './card-documents.repository';
import { PendingDocumentType } from './dto/card-document.dto';

export interface ChecklistIncompleteError {
  code: 'checklist_incomplete';
  message: string;
  boardColumnId: string;
  pendingDocumentTypes: PendingDocumentType[];
}

/**
 * Bloqueio de entrada em coluna com `requires_complete_checklist` (CRM de leads,
 * Sprint 2). Chamado por todo caminho MANUAL que coloca card numa coluna: criar
 * card na coluna e mover card. A importacao de dominio na coluna padrao NAO
 * passa por aqui (decisao de 2026-10-11, Sprint 3): entra e fica sinalizada por
 * `isChecklistPending`. Vale para qualquer papel (inclusive `board_admin`) e
 * nao e retroativo: so e avaliado na entrada, nunca sobre card que ja esta na
 * coluna. Quadro sem tipo obrigatorio ativo nao bloqueia (nada pendente).
 */
@Injectable()
export class ChecklistGateService {
  constructor(private readonly documents: CardDocumentsRepository) {}

  async assertCanEnterColumn(
    context: KanbanRequestContext,
    boardId: string,
    column: { id: string; requiresCompleteChecklist: boolean },
    cardId: string | null
  ): Promise<void> {
    if (!column.requiresCompleteChecklist) {
      return;
    }
    const pending = await this.documents.listPendingRequired(context.databaseRef, context.clientId, boardId, cardId);
    if (pending.length > 0) {
      const body: ChecklistIncompleteError = {
        code: 'checklist_incomplete',
        message: 'Card cannot enter this column until every required document is accepted',
        boardColumnId: column.id,
        pendingDocumentTypes: pending
      };
      throw new UnprocessableEntityException(body);
    }
  }
}
