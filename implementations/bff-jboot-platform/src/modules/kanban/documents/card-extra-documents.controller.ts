import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachments.service';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CardExtraDocumentsService } from './card-extra-documents.service';
import { CardExtraDocumentResponse, CardExtraDocumentsResponse, UploadCardExtraDocumentDto } from './dto/card-extra-document.dto';

/** Documentos avulsos no bloco Documentos do card (docs/product/flow-card-extra-documents-sprints.md, D1). */
@ApiTags('kanban-card-extra-documents')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/extra-documents')
export class CardExtraDocumentsController {
  constructor(private readonly documents: CardExtraDocumentsService) {}

  @Get()
  list(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ): Promise<CardExtraDocumentsResponse> {
    return this.documents.list(request.kanbanContext, boardId, cardId);
  }

  // Mesmo limite de tamanho do multer dos anexos (MAX_ATTACHMENT_SIZE_BYTES); tipo validado no servico.
  @Post()
  @RequireScopes('flow:write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES } }))
  upload(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: UploadCardExtraDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ): Promise<CardExtraDocumentResponse> {
    return this.documents.upload(request.kanbanContext, boardId, cardId, dto.description, file, buildMutateContext(request));
  }

  @Delete(':documentId')
  @HttpCode(204)
  @RequireScopes('flow:write')
  remove(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: KanbanRequest
  ): Promise<void> {
    return this.documents.remove(request.kanbanContext, boardId, cardId, documentId, buildMutateContext(request));
  }
}
