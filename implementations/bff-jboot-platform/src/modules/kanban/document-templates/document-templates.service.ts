import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException
} from '@nestjs/common';
import { assertAttachmentFileAllowed, UploadedFile } from '../attachments/attachments.service';
import { StorageService } from '../attachments/storage.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { FLOW_ADMIN_SCOPE } from '../shared/card-visibility';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { DOCX_CONTENT_TYPE, TEMPLATE_LIMITS, TemplateWarning } from './docx-package';
import {
  DocumentTemplateRow,
  DocumentTemplatesRepository,
  TEMPLATE_NOT_FOUND,
  TEMPLATE_VERSION_NOT_FOUND,
  TemplateVersionRow
} from './document-templates.repository';
import {
  CreateDocumentTemplateDto,
  DocumentTemplateDetailResponse,
  DocumentTemplateResponse,
  TemplateDownloadResponse,
  TemplateVersionDetailResponse,
  TemplateVersionResponse,
  UpdateDocumentTemplateDto,
  UpdateTemplateVariablesDto
} from './dto/document-template.dto';
import { GenerationTemplate, resolveGenerationTemplate } from './generation-template';
import { findCatalogVariable, templateCatalogResponse, TemplateCatalogResponse } from './template-variable-catalog';
import { TemplateValidationRunner } from './template-validation-runner.service';

export const TEMPLATE_ADMIN_REQUIRED = {
  code: 'template_admin_required',
  message: 'Only a Flow tenant admin (flow:admin) can manage case types and document templates'
} as const;

export function requireFlowAdmin(context: KanbanRequestContext): void {
  if (!context.scopes.includes(FLOW_ADMIN_SCOPE)) {
    throw new ForbiddenException(TEMPLATE_ADMIN_REQUIRED);
  }
}

/**
 * Arquivo de modelo: mesmas regras dos anexos (tamanho, allowlist e assinatura,
 * `assertAttachmentFileAllowed`) e, alem delas, so `.docx` (tipo e extensao) e
 * no maximo 10 MB compactado (ADR 014). Mensagens sem o nome do arquivo.
 */
export function assertTemplateFileAllowed(file: UploadedFile | undefined): UploadedFile {
  const allowed = assertAttachmentFileAllowed(file);
  if (allowed.mimetype !== DOCX_CONTENT_TYPE || !/\.docx$/i.test(allowed.originalname)) {
    throw new UnsupportedMediaTypeException({
      code: 'template_content_type_not_allowed',
      message: 'Only Word documents (.docx) are accepted as templates'
    });
  }
  if (allowed.size > TEMPLATE_LIMITS.maxCompressedBytes) {
    throw new PayloadTooLargeException({
      code: 'template_too_large',
      message: 'Template file exceeds the allowed size',
      max: TEMPLATE_LIMITS.maxCompressedBytes
    });
  }
  return allowed;
}

/** Texto opcional: aparado; vazio vira `null`; `undefined` mantem (PATCH). Mesmo efeito do DTO, sem depender do transporte. */
export function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

interface StoredReport {
  unknownVariables?: string[];
  warnings?: TemplateWarning[];
}

/** Nome do arquivo baixado: nome do modelo + versao (a chave do objeto nao tem nome). */
export function templateDownloadFileName(templateName: string, version: number): string {
  const base = templateName.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'modelo';
  return `${base} - v${version}.docx`;
}

/**
 * Modelos de documento do tenant (CRM de leads, Sprint 5; ADR 014, Decisoes 1
 * e 4). Tudo e do administrador (`flow:admin`). Versao enviada e imutavel; o
 * upload valida o pacote em worker thread antes de gravar qualquer coisa.
 */
@Injectable()
export class DocumentTemplatesService {
  private readonly logger = new Logger(DocumentTemplatesService.name);

  constructor(
    private readonly templates: DocumentTemplatesRepository,
    private readonly storage: StorageService,
    private readonly runner: TemplateValidationRunner,
    private readonly audit: KanbanAuditService
  ) {}

  catalog(context: KanbanRequestContext): TemplateCatalogResponse {
    requireFlowAdmin(context);
    return templateCatalogResponse();
  }

  async list(context: KanbanRequestContext): Promise<{ data: DocumentTemplateResponse[] }> {
    requireFlowAdmin(context);
    const rows = await this.templates.list(context.databaseRef, context.clientId);
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        active: row.active,
        currentVersion: row.currentVersion,
        caseTypeCount: row.caseTypeCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    };
  }

  async get(context: KanbanRequestContext, templateId: string): Promise<DocumentTemplateDetailResponse> {
    requireFlowAdmin(context);
    const template = await this.requireTemplate(context, templateId);
    const [versions, caseTypes] = await Promise.all([
      this.templates.listVersions(context.databaseRef, context.clientId, templateId),
      this.templates.listLinkedCaseTypes(context.databaseRef, context.clientId, templateId)
    ]);
    const currentRow = versions.find((version) => version.id === template.currentVersionId) ?? null;
    const current = currentRow ? await this.versionDetail(context, template, currentRow) : null;
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      active: template.active,
      currentVersion: currentRow
        ? { id: currentRow.id, version: currentRow.version, validationStatus: currentRow.validationStatus, createdAt: currentRow.createdAt }
        : null,
      caseTypeCount: caseTypes.length,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      versions: versions.map((version) => toVersionResponse(template, version)),
      current,
      caseTypes
    };
  }

  async create(context: KanbanRequestContext, dto: CreateDocumentTemplateDto, mutate: MutateContext): Promise<DocumentTemplateDetailResponse> {
    requireFlowAdmin(context);
    const template = await this.templates.create(
      context.databaseRef,
      context.clientId,
      { name: dto.name.trim(), description: optionalText(dto.description) ?? null },
      context.identityId
    );
    await this.audit.record('kanban_document_template_created', mutate, null, { templateId: template.id, name: template.name });
    return this.get(context, template.id);
  }

  async update(
    context: KanbanRequestContext,
    templateId: string,
    dto: UpdateDocumentTemplateDto,
    mutate: MutateContext
  ): Promise<DocumentTemplateDetailResponse> {
    requireFlowAdmin(context);
    await this.templates.update(
      context.databaseRef,
      context.clientId,
      templateId,
      { name: dto.name?.trim(), description: optionalText(dto.description), active: dto.active },
      context.identityId
    );
    await this.audit.record('kanban_document_template_updated', mutate, null, {
      templateId,
      fields: Object.keys(dto).filter((key) => (dto as Record<string, unknown>)[key] !== undefined).sort(),
      ...(dto.active !== undefined ? { active: dto.active } : {})
    });
    return this.get(context, templateId);
  }

  /**
   * Envio de versao nova. Ordem (falha fechada): permissao -> modelo do tenant ->
   * regras de arquivo -> validacao completa em worker (zip bomb, pacote,
   * compilacao, catalogo, render de prova) -> objeto no storage -> versao +
   * variaveis numa transacao (falha remove o objeto). Variavel desconhecida
   * salva a versao como `invalid_variables` (inutilizavel na geracao).
   */
  async uploadVersion(
    context: KanbanRequestContext,
    templateId: string,
    file: UploadedFile | undefined,
    mutate: MutateContext
  ): Promise<TemplateVersionDetailResponse> {
    requireFlowAdmin(context);
    const template = await this.requireTemplate(context, templateId);
    const allowed = assertTemplateFileAllowed(file);
    const outcome = await this.runner.validate(allowed.buffer);
    if (!outcome.ok) {
      this.logger.warn(`template_upload_rejected client=${context.clientId} template=${templateId} code=${outcome.code}`);
      throw new HttpException({ code: outcome.code, message: outcome.message, ...outcome.details }, outcome.status);
    }

    const versionId = randomUUID();
    const storageKey = this.storage.buildTemplateStorageKey({ clientId: context.clientId, templateId, versionId });
    await this.storage.upload(storageKey, allowed.buffer, DOCX_CONTENT_TYPE);
    let version: TemplateVersionRow;
    try {
      version = await this.templates.createVersion(context.databaseRef, context.clientId, {
        versionId,
        templateId,
        storageBucket: this.storage.bucketName,
        storageKey,
        fileName: allowed.originalname.slice(0, 255),
        contentType: DOCX_CONTENT_TYPE,
        sizeBytes: allowed.size,
        sha256: outcome.sha256,
        catalogVersion: outcome.catalogVersion,
        status: outcome.status,
        report: {
          unknownVariables: outcome.unknownVariables,
          warnings: outcome.warnings,
          proofRender: { bytes: outcome.proofRenderBytes }
        },
        variables: outcome.variables.map((variable) => ({ key: variable.key, known: variable.known, valueType: variable.valueType })),
        identityId: context.identityId
      });
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
    await this.audit.record('kanban_document_template_version_uploaded', mutate, null, {
      templateId,
      versionId,
      version: version.version,
      validationStatus: version.validationStatus,
      unknownVariableCount: outcome.unknownVariables.length,
      catalogVersion: outcome.catalogVersion,
      sha256: outcome.sha256
    });
    return this.versionDetail(context, { ...template, currentVersionId: versionId }, version);
  }

  async getVersion(context: KanbanRequestContext, templateId: string, versionId: string): Promise<TemplateVersionDetailResponse> {
    requireFlowAdmin(context);
    const template = await this.requireTemplate(context, templateId);
    const version = await this.requireVersion(context, templateId, versionId);
    return this.versionDetail(context, template, version);
  }

  /** Obrigatoria/opcional por variavel (default obrigatoria). Arquivo, status e variaveis da versao nao mudam. */
  async updateVariables(
    context: KanbanRequestContext,
    templateId: string,
    versionId: string,
    dto: UpdateTemplateVariablesDto,
    mutate: MutateContext
  ): Promise<TemplateVersionDetailResponse> {
    requireFlowAdmin(context);
    const template = await this.requireTemplate(context, templateId);
    const version = await this.requireVersion(context, templateId, versionId);
    const keys = dto.variables.map((variable) => variable.key);
    if (new Set(keys).size !== keys.length) {
      throw new HttpException({ code: 'template_variable_duplicated', message: 'Each variable can appear only once' }, 422);
    }
    const result = await this.templates.updateVariableRequirements(
      context.databaseRef,
      context.clientId,
      versionId,
      dto.variables,
      context.identityId
    );
    if (result.changed.length > 0) {
      await this.audit.record('kanban_template_variables_updated', mutate, null, {
        templateId,
        versionId,
        changed: dto.variables.filter((variable) => result.changed.includes(variable.key))
      });
    }
    return this.versionDetail(context, template, version);
  }

  async download(context: KanbanRequestContext, templateId: string, versionId: string): Promise<TemplateDownloadResponse> {
    requireFlowAdmin(context);
    const template = await this.requireTemplate(context, templateId);
    const version = await this.requireVersion(context, templateId, versionId);
    return this.storage.getSignedDownloadUrl(version.storageKey, {
      downloadFileName: templateDownloadFileName(template.name, version.version)
    });
  }

  /**
   * Ponto de entrada da geracao (S6): modelo e versao ATUAL utilizavel do tipo de
   * caso (ou do modelo escolhido pelo gestor entre os vinculados). Ver
   * `generation-template.ts`. Sem rota HTTP na S5.
   */
  async resolveForGeneration(
    context: KanbanRequestContext,
    caseTypeId: string,
    templateId: string | null = null
  ): Promise<GenerationTemplate> {
    requireFlowAdmin(context);
    const candidate = await this.templates.loadGenerationCandidate(context.databaseRef, context.clientId, caseTypeId, templateId);
    return resolveGenerationTemplate(candidate, templateId);
  }

  private async requireTemplate(context: KanbanRequestContext, templateId: string): Promise<DocumentTemplateRow> {
    const template = await this.templates.findById(context.databaseRef, context.clientId, templateId);
    if (!template) {
      throw new NotFoundException(TEMPLATE_NOT_FOUND);
    }
    return template;
  }

  private async requireVersion(context: KanbanRequestContext, templateId: string, versionId: string) {
    const version = await this.templates.findVersion(context.databaseRef, context.clientId, templateId, versionId);
    if (!version) {
      throw new NotFoundException(TEMPLATE_VERSION_NOT_FOUND);
    }
    return version;
  }

  private async versionDetail(
    context: KanbanRequestContext,
    template: DocumentTemplateRow,
    version: TemplateVersionRow
  ): Promise<TemplateVersionDetailResponse> {
    const variables = await this.templates.listVariables(context.databaseRef, context.clientId, version.id);
    return {
      ...toVersionResponse(template, version),
      variables: variables.map((variable) => ({
        key: variable.key,
        known: variable.known,
        valueType: variable.valueType,
        label: catalogLabel(variable.key),
        required: variable.required
      }))
    };
  }
}

function catalogLabel(key: string): string | null {
  const item = /^(.+)\[\]\.([a-z][a-z0-9_]*)$/.exec(key);
  if (item) {
    const collection = findCatalogVariable(item[1]);
    const field = collection?.valueType === 'collection' ? collection.items.find((entry) => entry.key === item[2]) : undefined;
    return field ? `${collection?.label}: ${field.label}` : null;
  }
  return findCatalogVariable(key)?.label ?? null;
}

function toVersionResponse(template: DocumentTemplateRow, version: TemplateVersionRow): TemplateVersionResponse {
  const report = version.validationReport as StoredReport;
  const isCurrent = template.currentVersionId === version.id;
  return {
    id: version.id,
    templateId: version.templateId,
    version: version.version,
    fileName: version.fileName,
    sizeBytes: version.sizeBytes,
    sha256: version.sha256,
    catalogVersion: version.catalogVersion,
    validationStatus: version.validationStatus,
    usableForGeneration: isCurrent && version.validationStatus === 'valid',
    isCurrent,
    unknownVariables: Array.isArray(report.unknownVariables) ? report.unknownVariables : [],
    warnings: Array.isArray(report.warnings) ? report.warnings : [],
    uploadedByIdentityId: version.uploadedByIdentityId,
    createdAt: version.createdAt
  };
}
