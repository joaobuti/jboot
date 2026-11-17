import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { KanbanAuthGuard, KanbanRequest } from '../guards/kanban-auth.guard';
import { RequireScopes, ScopeGuard } from '../guards/scope.guard';
import { buildMutateContext } from '../shared/request-context';
import { TEMPLATE_LIMITS } from './docx-package';
import { DocumentTemplatesService } from './document-templates.service';
import {
  CreateDocumentTemplateDto,
  DocumentTemplateDetailResponse,
  DocumentTemplateResponse,
  TemplateDownloadResponse,
  TemplateVersionDetailResponse,
  UpdateDocumentTemplateDto,
  UpdateTemplateVariablesDto
} from './dto/document-template.dto';
import { TemplateCatalogResponse } from './template-variable-catalog';

// Modelos de documento e catalogo de variaveis (CRM de leads, Sprint 5; ADR 014).
// Contrato: docs/api/flow-crm-leads-sprint-5-openapi.yaml.
@ApiTags('kanban-document-templates')
@ApiBearerAuth()
@UseGuards(KanbanAuthGuard, ScopeGuard)
@Controller('kanban')
export class DocumentTemplatesController {
  constructor(private readonly templates: DocumentTemplatesService) {}

  @Get('template-variables')
  @RequireScopes('flow:admin')
  catalog(@Req() request: KanbanRequest): TemplateCatalogResponse {
    return this.templates.catalog(request.kanbanContext);
  }

  @Get('document-templates')
  @RequireScopes('flow:admin')
  list(@Req() request: KanbanRequest): Promise<{ data: DocumentTemplateResponse[] }> {
    return this.templates.list(request.kanbanContext);
  }

  @Post('document-templates')
  @RequireScopes('flow:admin')
  create(@Body() dto: CreateDocumentTemplateDto, @Req() request: KanbanRequest): Promise<DocumentTemplateDetailResponse> {
    return this.templates.create(request.kanbanContext, dto, buildMutateContext(request));
  }

  @Get('document-templates/:templateId')
  @RequireScopes('flow:admin')
  get(@Param('templateId', ParseUUIDPipe) templateId: string, @Req() request: KanbanRequest): Promise<DocumentTemplateDetailResponse> {
    return this.templates.get(request.kanbanContext, templateId);
  }

  @Patch('document-templates/:templateId')
  @RequireScopes('flow:admin')
  update(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: UpdateDocumentTemplateDto,
    @Req() request: KanbanRequest
  ): Promise<DocumentTemplateDetailResponse> {
    return this.templates.update(request.kanbanContext, templateId, dto, buildMutateContext(request));
  }

  // Multer limitado ao teto de modelo (10 MB); tipo, extensao, assinatura e pacote validados no servico.
  @Post('document-templates/:templateId/versions')
  @RequireScopes('flow:admin')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: TEMPLATE_LIMITS.maxCompressedBytes, files: 1 }
    })
  )
  uploadVersion(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: KanbanRequest
  ): Promise<TemplateVersionDetailResponse> {
    return this.templates.uploadVersion(request.kanbanContext, templateId, file, buildMutateContext(request));
  }

  @Get('document-templates/:templateId/versions/:versionId')
  @RequireScopes('flow:admin')
  getVersion(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Req() request: KanbanRequest
  ): Promise<TemplateVersionDetailResponse> {
    return this.templates.getVersion(request.kanbanContext, templateId, versionId);
  }

  @Patch('document-templates/:templateId/versions/:versionId/variables')
  @RequireScopes('flow:admin')
  updateVariables(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: UpdateTemplateVariablesDto,
    @Req() request: KanbanRequest
  ): Promise<TemplateVersionDetailResponse> {
    return this.templates.updateVariables(request.kanbanContext, templateId, versionId, dto, buildMutateContext(request));
  }

  @Get('document-templates/:templateId/versions/:versionId/download')
  @RequireScopes('flow:admin')
  download(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Req() request: KanbanRequest
  ): Promise<TemplateDownloadResponse> {
    return this.templates.download(request.kanbanContext, templateId, versionId);
  }
}
