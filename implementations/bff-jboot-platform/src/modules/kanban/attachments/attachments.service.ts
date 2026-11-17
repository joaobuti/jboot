import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ActivitiesRepository } from '../activities/activities.repository';
import { KanbanRequestContext } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { AttachmentsRepository } from './attachments.repository';
import { contentMatchesDeclaredType } from './file-signature';
import { StorageService } from './storage.service';

// Limites confirmados pelo usuario em 2026-06-19 (docs/product/kanban-sprint-4-gate.md, secao "Pendencias").
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip'
]);

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Validacao unica de arquivo enviado ao Flow (anexo do historico e documento do
 * checklist): tamanho, allowlist de content-type e assinatura do conteudo
 * (`file-signature.ts`). Os limites sao os da Sprint 4; nao duplicar em outro lugar.
 */
export function assertAttachmentFileAllowed(file: UploadedFile | undefined): UploadedFile {
  if (!file) {
    throw new BadRequestException({ code: 'file_required', message: 'No file provided' });
  }
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new PayloadTooLargeException({
      code: 'file_too_large',
      message: `File exceeds the allowed size limit of ${MAX_ATTACHMENT_SIZE_BYTES} bytes`
    });
  }
  if (!ALLOWED_ATTACHMENT_CONTENT_TYPES.has(file.mimetype)) {
    throw new UnsupportedMediaTypeException({
      code: 'content_type_not_allowed',
      message: `Content type "${file.mimetype}" is not allowed`
    });
  }
  // Content-type vem do cliente: os primeiros bytes precisam condizer com ele (Backlog T5).
  // A mensagem nunca ecoa o nome do arquivo (dado pessoal em documento do checklist).
  if (!contentMatchesDeclaredType(file.mimetype, file.buffer)) {
    throw new UnsupportedMediaTypeException({
      code: 'content_signature_mismatch',
      message: 'File content does not match the declared content type'
    });
  }
  return file;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly repository: AttachmentsRepository,
    private readonly activities: ActivitiesRepository,
    private readonly visibility: CardVisibilityService,
    private readonly storage: StorageService,
    private readonly access: BoardAccessService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, cardId: string, activityId: string) {
    await this.access.requireMember(context, boardId);
    await this.requireCardAndActivity(context, boardId, cardId, activityId);
    return this.repository.list(context.databaseRef, context.clientId, activityId);
  }

  async upload(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    activityId: string,
    file: UploadedFile | undefined
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    await this.requireCardAndActivity(context, boardId, cardId, activityId);

    const allowed = assertAttachmentFileAllowed(file);

    const attachmentId = randomUUID();
    const storageKey = this.storage.buildStorageKey({
      clientId: context.clientId,
      cardId,
      activityId,
      attachmentId,
      fileName: allowed.originalname
    });

    await this.storage.upload(storageKey, allowed.buffer, allowed.mimetype);

    try {
      return await this.repository.create(context.databaseRef, context.clientId, {
        id: attachmentId,
        activityId,
        fileName: allowed.originalname,
        contentType: allowed.mimetype,
        sizeBytes: allowed.size,
        storageBucket: this.storage.bucketName,
        storageKey,
        uploadedByIdentityId: context.identityId
      });
    } catch (error) {
      // Sem a linha no banco o objeto fica inalcancavel: remove o que acabou de subir.
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
  }

  async getDownloadUrl(context: KanbanRequestContext, boardId: string, cardId: string, activityId: string, attachmentId: string) {
    await this.access.requireMember(context, boardId);
    await this.requireCardAndActivity(context, boardId, cardId, activityId);

    const attachment = await this.repository.findById(context.databaseRef, context.clientId, activityId, attachmentId);
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    return this.storage.getSignedDownloadUrl(attachment.storageKey);
  }

  private async requireCardAndActivity(context: KanbanRequestContext, boardId: string, cardId: string, activityId: string) {
    // Card visivel (Sprint 3.5): inexistente ou de outro escritorio = 404.
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    const activity = await this.activities.findById(context.databaseRef, context.clientId, cardId, activityId);
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return { card, activity };
  }
}
