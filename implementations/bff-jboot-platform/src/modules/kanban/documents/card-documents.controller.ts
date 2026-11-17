import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../attachments/attachments.service';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { CardDocumentsService } from './card-documents.service';
import { CardChecklistResponse, CardDocumentResponse, ReviewCardDocumentDto, UploadCardDocumentDto } from './dto/card-document.dto';

@ApiTags('kanban-card-documents')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/documents')
export class CardDocumentsController {
  constructor(private readonly documents: CardDocumentsService) {}

  @Get()
  getChecklist(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ): Promise<CardChecklistResponse> {
    return this.documents.getChecklist(request.kanbanContext, boardId, cardId);
  }

  // Mesmo limite de tamanho do multer dos anexos (MAX_ATTACHMENT_SIZE_BYTES); tipo validado no servico.
  @Post()
  @RequireScopes('flow:write')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES }
    })
  )
  upload(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: UploadCardDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ): Promise<CardDocumentResponse> {
    return this.documents.upload(request.kanbanContext, boardId, cardId, dto.documentTypeId, file, buildMutateContext(request));
  }

  @Post(':documentId/review')
  @RequireScopes('flow:write')
  review(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ReviewCardDocumentDto,
    @Req() request: KanbanRequest
  ): Promise<CardDocumentResponse> {
    return this.documents.review(request.kanbanContext, boardId, cardId, documentId, dto, buildMutateContext(request));
  }
}
