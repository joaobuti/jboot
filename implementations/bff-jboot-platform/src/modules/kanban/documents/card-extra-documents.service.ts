import { createHash, randomUUID } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertAttachmentFileAllowed, UploadedFile } from '../attachments/attachments.service';
import { StorageService } from '../attachments/storage.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { LeadEditLock } from '../leads/lead-edit-lock.service';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CardExtraDocumentRow, CardExtraDocumentsRepository } from './card-extra-documents.repository';
import { CardExtraDocumentResponse, CardExtraDocumentsResponse } from './dto/card-extra-document.dto';

const NOT_FOUND = { code: 'extra_document_not_found', message: 'Extra document not found' };

function toResponse(row: CardExtraDocumentRow, canRemove: boolean): CardExtraDocumentResponse {
  return {
    id: row.id,
    description: row.description,
    createdByIdentityId: row.createdByIdentityId,
    createdAt: row.createdAt,
    attachment: { id: row.attachmentId, activityId: row.activityId, fileName: row.fileName, contentType: row.contentType, sizeBytes: row.sizeBytes },
    canRemove
  };
}

/**
 * Documentos avulsos do card (docs/product/flow-card-extra-documents-sprints.md, D1). Envio com as regras
 * do checklist (papel, coluna editavel, lead nao congelado, arquivo permitido). Remove quem enviou ou quem
 * revisa documentos no quadro; a remocao e logica e tambem tira o arquivo do Drive.
 */
@Injectable()
export class CardExtraDocumentsService {
  constructor(
    private readonly repository: CardExtraDocumentsRepository,
    private readonly visibility: CardVisibilityService,
    private readonly access: BoardAccessService,
    private readonly storage: StorageService,
    private readonly audit: KanbanAuditService,
    private readonly leadLock: LeadEditLock
  ) {}

  async list(context: KanbanRequestContext, boardId: string, cardId: string): Promise<CardExtraDocumentsResponse> {
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    const [rows, canUpload, canReview] = await Promise.all([
      this.repository.listActive(context.databaseRef, context.clientId, cardId),
      this.canUpload(context, boardId, card.boardColumnId, cardId),
      this.access.canReviewDocuments(context, boardId)
    ]);
    return {
      documents: rows.map((row) => toResponse(row, canUpload && (canReview || row.createdByIdentityId === context.identityId))),
      canUpload
    };
  }

  async upload(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    description: string | undefined,
    file: UploadedFile | undefined,
    mutate: MutateContext
  ): Promise<CardExtraDocumentResponse> {
    await this.requireCanUpload(context, boardId, cardId);
    const allowed = assertAttachmentFileAllowed(file);
    const documentId = randomUUID();
    const activityId = randomUUID();
    const attachmentId = randomUUID();
    const storageKey = this.storage.buildStorageKey({ clientId: context.clientId, cardId, activityId, attachmentId, fileName: allowed.originalname });
    await this.storage.upload(storageKey, allowed.buffer, allowed.mimetype);

    let created: { document: CardExtraDocumentRow; driveQueued: boolean };
    try {
      created = await this.repository.create(context.databaseRef, context.clientId, {
        documentId,
        cardId,
        description: description ? description : null,
        activityId,
        attachmentId,
        fileName: allowed.originalname,
        contentType: allowed.mimetype,
        sizeBytes: allowed.size,
        sha256: createHash('sha256').update(allowed.buffer).digest('hex'),
        storageBucket: this.storage.bucketName,
        storageKey,
        identityId: context.identityId
      });
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
    await this.audit.record('kanban_card_extra_document_added', mutate, boardId, {
      cardId,
      documentId,
      attachmentId,
      activityId,
      driveQueued: created.driveQueued
    });
    return toResponse(created.document, true);
  }

  async remove(context: KanbanRequestContext, boardId: string, cardId: string, documentId: string, mutate: MutateContext): Promise<void> {
    await this.requireCanUpload(context, boardId, cardId);
    const document = await this.repository.findActive(context.databaseRef, context.clientId, cardId, documentId);
    if (!document) throw new NotFoundException(NOT_FOUND);
    if (document.createdByIdentityId !== context.identityId && !(await this.access.canReviewDocuments(context, boardId))) {
      throw new ForbiddenException({
        code: 'cannot_remove_extra_document',
        message: 'Only who sent the document or who reviews documents on this board may remove it'
      });
    }
    const removed = await this.repository.remove(context.databaseRef, context.clientId, {
      cardId,
      documentId,
      identityId: context.identityId,
      activityId: randomUUID()
    });
    if (!removed) throw new NotFoundException(NOT_FOUND);
    await this.audit.record('kanban_card_extra_document_removed', mutate, boardId, {
      cardId,
      documentId,
      driveRemovalQueued: removed.driveRemovalQueued
    });
  }

  private async requireCanUpload(context: KanbanRequestContext, boardId: string, cardId: string): Promise<void> {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    await this.access.requireColumnEditable(context, boardId, card.boardColumnId);
    await this.leadLock.assertEditable(context, cardId);
  }

  private async canUpload(context: KanbanRequestContext, boardId: string, boardColumnId: string, cardId: string): Promise<boolean> {
    try {
      await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
      await this.access.requireColumnEditable(context, boardId, boardColumnId);
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
    return this.leadLock.isEditable(context, cardId);
  }
}
