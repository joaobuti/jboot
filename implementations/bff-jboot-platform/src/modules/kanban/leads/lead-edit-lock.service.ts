import { ConflictException, Injectable } from '@nestjs/common';
import { KanbanRequestContext } from '../kanban.types';
import { isLeadEditable, LeadStatus } from './lead-state';
import { LeadsRepository } from './leads.repository';

export interface LeadFrozenError {
  code: 'lead_frozen';
  message: string;
  leadStatus: LeadStatus;
}

/**
 * Congelamento do lead apos o envio (P21, PE10; CRM de leads, Sprint 4).
 * Chamado DEPOIS de `requireVisibleCard` por toda mutacao que altera o que foi
 * enviado. Com o lead fora de `rascunho`/`devolvido`, recusa com 409
 * `lead_frozen` para QUALQUER usuario (inclusive `flow:admin`): o caminho para
 * corrigir e devolver o lead com motivo, preservando o snapshot do envio.
 *
 * Congela: PATCH do card (titulo, descricao, vencimento, arquivar), exclusao
 * definitiva do card, vinculo/troca do cliente pelo card (PUT customer),
 * edicao do cliente pelo card (PATCH customer) e envio de documento do
 * checklist. NAO congela: revisao de documento (PE10), mover entre colunas
 * (estado independe da coluna), comentario e anexo do historico, tags,
 * status, responsaveis e transferencia de escritorio pelo admin.
 */
@Injectable()
export class LeadEditLock {
  constructor(private readonly leads: LeadsRepository) {}

  async isEditable(context: KanbanRequestContext, cardId: string): Promise<boolean> {
    return isLeadEditable(await this.leads.findStatus(context.databaseRef, context.clientId, cardId));
  }

  async assertEditable(context: KanbanRequestContext, cardId: string): Promise<void> {
    const status = await this.leads.findStatus(context.databaseRef, context.clientId, cardId);
    if (!isLeadEditable(status)) {
      const body: LeadFrozenError = {
        code: 'lead_frozen',
        message: 'Lead was submitted for analysis and cannot be edited until it is returned',
        leadStatus: status
      };
      throw new ConflictException(body);
    }
  }
}
