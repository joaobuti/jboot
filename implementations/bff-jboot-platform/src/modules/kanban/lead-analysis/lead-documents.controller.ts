import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { ScopeGuard } from '../guards/scope.guard';
import { DocumentDownloadQueryDto, GeneratedDocumentDownloadResponse, LeadDeliveredDocumentsResponse } from './dto/lead-analysis.dto';
import { LeadAnalysisService } from './lead-analysis.service';

// Documentos ENTREGUES do lead (CRM de leads, Sprint 6, P11): qualquer leitor do
// card visivel ve e baixa o documento aprovado (.docx e PDF); rascunho e
// classificacao nunca saem por aqui. Contrato: docs/api/flow-crm-leads-sprint-6-openapi.yaml.
@ApiTags('kanban-leads')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/lead/documents')
export class LeadDocumentsController {
  constructor(private readonly analysis: LeadAnalysisService) {}

  @Get()
  list(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ): Promise<LeadDeliveredDocumentsResponse> {
    return this.analysis.listDelivered(request.kanbanContext, boardId, cardId);
  }

  @Get(':documentId/download')
  download(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query() query: DocumentDownloadQueryDto,
    @Req() request: KanbanRequest
  ): Promise<GeneratedDocumentDownloadResponse> {
    return this.analysis.downloadDelivered(request.kanbanContext, boardId, cardId, documentId, query.format ?? 'docx');
  }
}
