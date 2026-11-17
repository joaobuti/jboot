import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { assertAttachmentFileAllowed, UploadedFile } from '../attachments/attachments.service';
import { StorageService } from '../attachments/storage.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { LeadEditLock } from '../leads/lead-edit-lock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CardDocumentsRepository } from './card-documents.repository';
import { isChecklistPending } from './checklist-pending';
import { DocumentTypesRepository } from './document-types.repository';
import {
  CardChecklistItemResponse,
  CardChecklistResponse,
  CardDocumentResponse,
  ReviewCardDocumentDto
} from './dto/card-document.dto';
import { BoardDocumentTypeResponse } from './dto/document-type.dto';

@Injectable()
export class CardDocumentsService {
  private readonly logger = new Logger(CardDocumentsService.name);

  constructor(
    private readonly documents: CardDocumentsRepository,
    private readonly documentTypes: DocumentTypesRepository,
    private readonly visibility: CardVisibilityService,
    private readonly assignees: AssigneesRepository,
    private readonly storage: StorageService,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService,
    private readonly notifications: NotificationsService,
    private readonly columns: ColumnsRepository,
    private readonly leadLock: LeadEditLock
  ) {}

  /** Checklist do card: qualquer membro ativo do quadro le; `canUpload`/`canReview` vem daqui. */
  async getChecklist(context: KanbanRequestContext, boardId: string, cardId: string): Promise<CardChecklistResponse> {
    await this.access.requireMember(context, boardId);
    const card = await this.requireCard(context, boardId, cardId);
    const [types, documents, canReview, canUpload, column] = await Promise.all([
      this.documentTypes.list(context.databaseRef, context.clientId, boardId),
      this.documents.listForCard(context.databaseRef, context.clientId, cardId),
      this.access.canReviewDocuments(context, boardId),
      this.canUpload(context, boardId, card.boardColumnId, cardId),
      this.columns.findById(context.databaseRef, context.clientId, boardId, card.boardColumnId)
    ]);
    const checklist = buildChecklist(types, documents);
    // Mesma regra do tile (`CardsService.list`); coluna arquivada nao sinaliza.
    const columnGated = column?.status === 'active' && column.requiresCompleteChecklist;
    return {
      ...checklist,
      checklistPending: isChecklistPending(columnGated, checklist.completeness),
      canUpload,
      canReview
    };
  }

  /**
   * Envio de documento: mesma regra das mutacoes de card (`flow:write` no
   * controller, `board_admin`/`board_member`, coluna editavel pelo perfil) e
   * mesmas validacoes de arquivo dos anexos. Ordem: valida -> sobe o objeto ->
   * grava activity + attachment + documento numa transacao. Falha do storage
   * nao deixa linha; falha da transacao remove o objeto recem-enviado.
   */
  async upload(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    documentTypeId: string,
    file: UploadedFile | undefined,
    mutate: MutateContext
  ): Promise<CardDocumentResponse> {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    const card = await this.requireCard(context, boardId, cardId);
    await this.access.requireColumnEditable(context, boardId, card.boardColumnId);
    // Lead enviado: envio de documento congelado ate a devolucao (P21); revisao segue permitida (PE10).
    await this.leadLock.assertEditable(context, cardId);

    const documentType = await this.documentTypes.findById(context.databaseRef, context.clientId, boardId, documentTypeId);
    if (!documentType) {
      throw new NotFoundException({ code: 'document_type_not_found', message: 'Document type not found' });
    }
    if (!documentType.active) {
      throw new UnprocessableEntityException({ code: 'document_type_inactive', message: 'Document type is inactive' });
    }
    const allowed = assertAttachmentFileAllowed(file);

    const documentId = randomUUID();
    const activityId = randomUUID();
    const attachmentId = randomUUID();
    const storageKey = this.storage.buildStorageKey({
      clientId: context.clientId,
      cardId,
      activityId,
      attachmentId,
      fileName: allowed.originalname
    });

    await this.storage.upload(storageKey, allowed.buffer, allowed.mimetype);

    let document: CardDocumentResponse;
    try {
      document = await this.documents.createUpload(context.databaseRef, context.clientId, {
        documentId,
        cardId,
        documentTypeId,
        activityId,
        attachmentId,
        fileName: allowed.originalname,
        contentType: allowed.mimetype,
        sizeBytes: allowed.size,
        storageBucket: this.storage.bucketName,
        storageKey,
        identityId: context.identityId
      });
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }

    await this.audit.record('kanban_card_document_uploaded', mutate, boardId, {
      cardId,
      documentId,
      documentTypeId,
      attachmentId,
      activityId
    });
    return document;
  }

  /**
   * Aceite/rejeicao: somente `board_admin` ou `board_member` com perfil
   * `can_review_documents`; so sobre o envio mais recente do item e ainda
   * `enviado`. Rejeicao exige motivo e notifica responsaveis e criador do card
   * (nunca o proprio revisor). Payload de evento/notificacao sem dado pessoal.
   */
  async review(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    documentId: string,
    dto: ReviewCardDocumentDto,
    mutate: MutateContext
  ): Promise<CardDocumentResponse> {
    await this.access.requireBoard(context, boardId);
    await this.access.requireCanReviewDocuments(context, boardId);
    const card = await this.requireCard(context, boardId, cardId);

    const rejectionReason = dto.status === 'rejeitado' ? (dto.rejectionReason ?? '').trim() : null;
    if (dto.status === 'rejeitado' && !rejectionReason) {
      throw new BadRequestException({ code: 'rejection_reason_required', message: 'A rejection reason is required' });
    }

    const existing = await this.documents.findById(context.databaseRef, context.clientId, cardId, documentId);
    if (!existing) {
      throw new NotFoundException({ code: 'document_not_found', message: 'Document not found' });
    }
    if (existing.status !== 'enviado') {
      throw new ConflictException({ code: 'document_not_pending', message: 'Only documents with status enviado can be reviewed' });
    }
    const latestId = await this.documents.findLatestIdForType(
      context.databaseRef,
      context.clientId,
      cardId,
      existing.documentTypeId
    );
    if (latestId !== existing.id) {
      throw new ConflictException({
        code: 'document_superseded',
        message: 'A newer submission exists for this checklist item; review the latest one'
      });
    }
    const documentType = await this.documentTypes.findById(context.databaseRef, context.clientId, boardId, existing.documentTypeId);

    const eventPayload: Record<string, unknown> = {
      documentId,
      documentTypeId: existing.documentTypeId,
      documentTypeName: documentType?.name ?? null
    };
    if (rejectionReason) {
      eventPayload.rejectionReason = rejectionReason;
    }
    const reviewed = await this.documents.review(context.databaseRef, context.clientId, {
      cardId,
      documentId,
      status: dto.status,
      rejectionReason,
      reviewerIdentityId: context.identityId,
      eventPayload
    });
    if (!reviewed) {
      throw new ConflictException({ code: 'document_not_pending', message: 'Only documents with status enviado can be reviewed' });
    }

    await this.audit.record(
      dto.status === 'aceito' ? 'kanban_card_document_accepted' : 'kanban_card_document_rejected',
      mutate,
      boardId,
      { cardId, documentId, documentTypeId: existing.documentTypeId, activityId: reviewed.activityId }
    );

    if (dto.status === 'rejeitado') {
      await this.notifyRejection(context, boardId, card.id, card.createdByIdentityId, {
        documentId,
        documentTypeId: existing.documentTypeId,
        documentTypeName: documentType?.name ?? null
      });
    }
    return reviewed.document;
  }

  private async notifyRejection(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    creatorIdentityId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    // Notificacao e efeito colateral: falha nao desfaz a revisao ja gravada (so logada, so ids).
    try {
      const cardAssignees = await this.assignees.list(context.databaseRef, context.clientId, cardId);
      const recipients = new Set<string>([creatorIdentityId, ...cardAssignees.map((assignee) => assignee.identityId)]);
      await Promise.all(
        [...recipients].map((recipientIdentityId) =>
          this.notifications.notify(context, {
            boardId,
            cardId,
            recipientIdentityId,
            actorIdentityId: context.identityId,
            kind: 'card.document_rejected',
            payload
          })
        )
      );
    } catch (error) {
      this.logger.error(`document_rejection_notification_failed card=${cardId}: ${(error as Error).message}`);
    }
  }

  private async canUpload(context: KanbanRequestContext, boardId: string, boardColumnId: string, cardId: string): Promise<boolean> {
    try {
      await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
      await this.access.requireColumnEditable(context, boardId, boardColumnId);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
    return this.leadLock.isEditable(context, cardId);
  }

  /** Card visivel (Sprint 3.5): inexistente ou de outro escritorio = 404. */
  private async requireCard(context: KanbanRequestContext, boardId: string, cardId: string) {
    return this.visibility.requireVisibleCard(context, boardId, cardId);
  }
}

/**
 * Monta o checklist: tipos ativos na ordem configurada + tipos inativos que ja
 * tem envio no card (exibidos, fora da completude). Estado do item = envio mais
 * recente (`documents` chega do mais recente para o mais antigo).
 */
export function buildChecklist(
  types: BoardDocumentTypeResponse[],
  documents: CardDocumentResponse[]
): Pick<CardChecklistResponse, 'items' | 'completeness'> {
  const byType = new Map<string, CardDocumentResponse[]>();
  for (const document of documents) {
    const list = byType.get(document.documentTypeId) ?? [];
    list.push(document);
    byType.set(document.documentTypeId, list);
  }
  const items: CardChecklistItemResponse[] = types
    .filter((type) => type.active || byType.has(type.id))
    .map((type) => {
      const history = byType.get(type.id) ?? [];
      const current = history[0] ?? null;
      return {
        documentTypeId: type.id,
        name: type.name,
        required: type.required,
        sortOrder: type.sortOrder,
        active: type.active,
        state: current ? current.status : 'pendente',
        current,
        history
      };
    });
  const requiredItems = items.filter((item) => item.active && item.required);
  const acceptedRequired = requiredItems.filter((item) => item.state === 'aceito').length;
  return {
    items,
    completeness: {
      acceptedRequired,
      totalRequired: requiredItems.length,
      complete: acceptedRequired === requiredItems.length
    }
  };
}
