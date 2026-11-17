import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { TEMPLATE_LIMITS } from '../document-templates/docx-package';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import {
  AddLeadCaseDto,
  ChangeLeadCaseDto,
  DocumentDownloadQueryDto,
  EditedVersionResponse,
  GenerateLeadDocumentDto,
  GeneratedDocumentDownloadResponse,
  LeadAnalysisResponse,
  RemoveLeadCaseDto
} from './dto/lead-analysis.dto';
import { LeadAnalysisService } from './lead-analysis.service';

// Analise do lead pelo gestor (CRM de leads, Sprint 6): somente flow:admin.
// Contrato: docs/api/flow-crm-leads-sprint-6-openapi.yaml.
@ApiTags('kanban-lead-analysis')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban/boards/:boardId/cards/:cardId/analysis')
export class LeadAnalysisController {
  constructor(private readonly analysis: LeadAnalysisService) {}

  @Get()
  @RequireScopes('flow:admin')
  get(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Req() request: KanbanRequest
  ): Promise<LeadAnalysisResponse> {
    return this.analysis.getAnalysis(request.kanbanContext, boardId, cardId);
  }

  @Post('cases')
  @RequireScopes('flow:admin')
  addCase(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: AddLeadCaseDto,
    @Req() request: KanbanRequest
  ): Promise<LeadAnalysisResponse> {
    return this.analysis.addCase(request.kanbanContext, boardId, cardId, dto, buildMutateContext(request));
  }

  @Patch('cases/:caseId')
  @RequireScopes('flow:admin')
  changeCase(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: ChangeLeadCaseDto,
    @Req() request: KanbanRequest
  ): Promise<LeadAnalysisResponse> {
    return this.analysis.changeCase(request.kanbanContext, boardId, cardId, caseId, dto, buildMutateContext(request));
  }

  @Post('cases/:caseId/remove')
  @HttpCode(200)
  @RequireScopes('flow:admin')
  removeCase(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: RemoveLeadCaseDto,
    @Req() request: KanbanRequest
  ): Promise<LeadAnalysisResponse> {
    return this.analysis.removeCase(request.kanbanContext, boardId, cardId, caseId, dto, buildMutateContext(request));
  }

  @Post('cases/:caseId/documents')
  @RequireScopes('flow:admin')
  generate(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: GenerateLeadDocumentDto,
    @Req() request: KanbanRequest
  ): Promise<LeadAnalysisResponse> {
    return this.analysis.generate(request.kanbanContext, boardId, cardId, caseId, dto, buildMutateContext(request));
  }

  @Post('documents/:documentId/approve')
  @HttpCode(200)
  @RequireScopes('flow:admin')
  approve(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: KanbanRequest
  ): Promise<LeadAnalysisResponse> {
    return this.analysis.approve(request.kanbanContext, boardId, cardId, documentId, buildMutateContext(request));
  }

  // Multer limitado ao teto do .docx (10 MB); tipo, extensao, assinatura e pacote validados no servico.
  @Post('documents/:documentId/edited-version')
  @RequireScopes('flow:admin')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: TEMPLATE_LIMITS.maxCompressedBytes, files: 1 }
    })
  )
  uploadEditedVersion(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ): Promise<EditedVersionResponse> {
    return this.analysis.uploadEditedVersion(request.kanbanContext, boardId, cardId, documentId, file, buildMutateContext(request));
  }

  @Post('documents/:documentId/pdf/retry')
  @HttpCode(202)
  @RequireScopes('flow:admin')
  retryPdf(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Req() request: KanbanRequest
  ): Promise<LeadAnalysisResponse> {
    return this.analysis.retryPdf(request.kanbanContext, boardId, cardId, documentId, buildMutateContext(request));
  }

  @Get('documents/:documentId/download')
  @RequireScopes('flow:admin')
  download(
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query() query: DocumentDownloadQueryDto,
    @Req() request: KanbanRequest
  ): Promise<GeneratedDocumentDownloadResponse> {
    return this.analysis.downloadForManager(request.kanbanContext, boardId, cardId, documentId, query.format ?? 'docx');
  }
}
