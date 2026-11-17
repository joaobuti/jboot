import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { OfficeKitEmailRepository } from '../office-kit-email/office-kit-email.repository';
import { StorageService } from '../attachments/storage.service';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CustomerValidationRepository } from './customer-validation.repository';

export interface CardOfficeKitDto {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  /** E-mail do kit ao cliente (S4): null quando nao houve envio (desligado no escritorio ou sem e-mail). */
  email: { status: 'pending' | 'sending' | 'sent' | 'failed'; to: string; sentAt: string | null } | null;
}

const KIT_NOT_FOUND = { code: 'office_kit_not_found', message: 'Office kit not found for this card' };

/**
 * Kit do escritorio no bloco Documentos do card (ADR 019, decisao 19 revisada em 2026-10-30): o kit
 * mais recente do cliente vinculado ao card, para baixar. Quem ve o card pode baixar; o download e
 * auditado. O arquivo e o mesmo gravado no storage do Flow na geracao, com ou sem Drive.
 */
@Injectable()
export class CardOfficeKitService {
  constructor(
    private readonly visibility: CardVisibilityService,
    private readonly cardCustomers: CardCustomersRepository,
    private readonly validations: CustomerValidationRepository,
    private readonly storage: StorageService,
    private readonly audit: KanbanAuditService,
    @Optional() private readonly kitEmails?: OfficeKitEmailRepository
  ) {}

  async latest(context: KanbanRequestContext, boardId: string, cardId: string): Promise<{ kit: CardOfficeKitDto | null }> {
    const customerId = await this.cardCustomerId(context, boardId, cardId);
    if (!customerId) return { kit: null };
    const kit = await this.validations.latestKitForCustomer(context.databaseRef, context.clientId, customerId);
    if (!kit) return { kit: null };
    const email = this.kitEmails ? await this.kitEmails.forKit(context.databaseRef, context.clientId, kit.id) : null;
    return {
      kit: {
        id: kit.id, fileName: kit.fileName, sizeBytes: kit.sizeBytes, createdAt: kit.createdAt,
        email: email ? { status: email.status, to: email.toEmail, sentAt: email.sentAt } : null
      }
    };
  }

  async download(context: KanbanRequestContext, boardId: string, cardId: string, kitId: string, mutate: MutateContext) {
    const customerId = await this.cardCustomerId(context, boardId, cardId);
    if (!customerId) throw new NotFoundException(KIT_NOT_FOUND);
    const kit = await this.validations.findKitForCustomer(context.databaseRef, context.clientId, customerId, kitId);
    if (!kit) throw new NotFoundException(KIT_NOT_FOUND);
    const signed = await this.storage.getSignedDownloadUrl(kit.storageKey, { downloadFileName: kit.fileName });
    await this.audit.record('kanban_customer_office_kit_downloaded', mutate, boardId, { cardId, customerId, kitId });
    return signed;
  }

  private async cardCustomerId(context: KanbanRequestContext, boardId: string, cardId: string): Promise<string | null> {
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    const link = await this.cardCustomers.findByCard(context.databaseRef, context.clientId, cardId);
    return link?.customerId ?? null;
  }
}
