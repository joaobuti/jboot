import { Injectable, NotFoundException } from '@nestjs/common';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { DocumentTypesRepository } from './document-types.repository';
import {
  ApplyInitialDocumentTypesResponse,
  BoardDocumentTypeResponse,
  CreateBoardDocumentTypeDto,
  UpdateBoardDocumentTypeDto
} from './dto/document-type.dto';
import { INITIAL_DOCUMENT_TYPES } from './initial-document-types';

/** Checklist de documentos por quadro: configuracao exclusiva de `board_admin`. */
@Injectable()
export class DocumentTypesService {
  constructor(
    private readonly repository: DocumentTypesRepository,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, boardId: string): Promise<{ data: BoardDocumentTypeResponse[] }> {
    await this.requireAdmin(context, boardId);
    return { data: await this.repository.list(context.databaseRef, context.clientId, boardId) };
  }

  async create(context: KanbanRequestContext, boardId: string, dto: CreateBoardDocumentTypeDto, mutate: MutateContext) {
    await this.requireAdmin(context, boardId);
    const created = await this.repository.create(context.databaseRef, context.clientId, boardId, dto);
    await this.audit.record('kanban_document_type_created', mutate, boardId, {
      documentTypeId: created.id,
      name: created.name,
      required: created.required
    });
    return created;
  }

  async update(
    context: KanbanRequestContext,
    boardId: string,
    documentTypeId: string,
    dto: UpdateBoardDocumentTypeDto,
    mutate: MutateContext
  ) {
    await this.requireAdmin(context, boardId);
    const updated = await this.repository.update(context.databaseRef, context.clientId, boardId, documentTypeId, dto);
    if (!updated) {
      throw new NotFoundException({ code: 'document_type_not_found', message: 'Document type not found' });
    }
    await this.audit.record('kanban_document_type_updated', mutate, boardId, { documentTypeId, ...dto });
    return updated;
  }

  async applyInitialList(
    context: KanbanRequestContext,
    boardId: string,
    mutate: MutateContext
  ): Promise<ApplyInitialDocumentTypesResponse> {
    await this.requireAdmin(context, boardId);
    const result = await this.repository.applyInitialList(context.databaseRef, context.clientId, boardId, INITIAL_DOCUMENT_TYPES);
    if (result.created.length > 0) {
      await this.audit.record('kanban_document_types_initial_list_applied', mutate, boardId, {
        createdIds: result.created.map((type) => type.id),
        skippedNames: result.skippedNames
      });
    }
    const data = await this.repository.list(context.databaseRef, context.clientId, boardId);
    return { ...result, data };
  }

  private async requireAdmin(context: KanbanRequestContext, boardId: string): Promise<void> {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin']);
  }
}
