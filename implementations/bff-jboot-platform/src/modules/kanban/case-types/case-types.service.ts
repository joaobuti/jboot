import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DocumentTemplateRow, DocumentTemplatesRepository } from '../document-templates/document-templates.repository';
import { optionalText, requireFlowAdmin } from '../document-templates/document-templates.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CASE_TYPE_NOT_FOUND, CaseTypeRow, CaseTypesRepository, CaseTypeWrite } from './case-types.repository';
import { CaseTypeResponse, CreateCaseTypeDto, UpdateCaseTypeDto } from './dto/case-type.dto';

export const TEMPLATE_NOT_ALLOWED = {
  code: 'template_not_allowed',
  message: 'Linked templates must exist in this tenant and new links must be active'
} as const;

export const DEFAULT_TEMPLATE_NOT_LINKED = {
  code: 'default_template_not_linked',
  message: 'The default template must be one of the linked templates'
} as const;

/**
 * Valida o estado FINAL de vinculos e padrao: modelo do tenant; vinculo NOVO so
 * com modelo ativo (vinculo existente a modelo inativo pode ficar); padrao entre
 * os vinculados. Funcao pura (sem I/O).
 */
export function validateCaseTypeTemplates(
  finalState: Pick<CaseTypeWrite, 'templateIds' | 'defaultTemplateId'>,
  currentTemplateIds: readonly string[],
  templates: readonly Pick<DocumentTemplateRow, 'id' | 'active'>[]
): void {
  const byId = new Map(templates.map((template) => [template.id, template]));
  for (const templateId of finalState.templateIds) {
    const template = byId.get(templateId);
    if (!template || (!template.active && !currentTemplateIds.includes(templateId))) {
      throw new UnprocessableEntityException(TEMPLATE_NOT_ALLOWED);
    }
  }
  if (finalState.defaultTemplateId && !finalState.templateIds.includes(finalState.defaultTemplateId)) {
    throw new UnprocessableEntityException(DEFAULT_TEMPLATE_NOT_LINKED);
  }
}

/**
 * Tipos de caso do tenant (CRM de leads, Sprint 5). Somente `flow:admin`;
 * cadastro comeca vazio (P1: a lista real e do cliente). Sem exclusao: inativo
 * nao aparece para classificacao nem geracao (S6/S8).
 */
@Injectable()
export class CaseTypesService {
  constructor(
    private readonly caseTypes: CaseTypesRepository,
    private readonly templates: DocumentTemplatesRepository,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext): Promise<{ data: CaseTypeResponse[] }> {
    requireFlowAdmin(context);
    const rows = await this.caseTypes.list(context.databaseRef, context.clientId);
    const names = await this.templateNames(context, rows.flatMap((row) => row.templateIds));
    return { data: rows.map((row) => toResponse(row, names)) };
  }

  async get(context: KanbanRequestContext, caseTypeId: string): Promise<CaseTypeResponse> {
    requireFlowAdmin(context);
    const row = await this.requireCaseType(context, caseTypeId);
    return toResponse(row, await this.templateNames(context, row.templateIds));
  }

  async create(context: KanbanRequestContext, dto: CreateCaseTypeDto, mutate: MutateContext): Promise<CaseTypeResponse> {
    requireFlowAdmin(context);
    const finalState: CaseTypeWrite = {
      name: dto.name.trim(),
      description: optionalText(dto.description) ?? null,
      classificationCriteria: optionalText(dto.classificationCriteria) ?? null,
      expectedEvidence: optionalText(dto.expectedEvidence) ?? null,
      active: true,
      templateIds: [...new Set(dto.templateIds ?? [])],
      defaultTemplateId: dto.defaultTemplateId ?? null
    };
    await this.validateTemplates(context, finalState, []);
    const row = await this.caseTypes.create(context.databaseRef, context.clientId, finalState, context.identityId);
    await this.audit.record('kanban_case_type_created', mutate, null, {
      caseTypeId: row.id,
      name: row.name,
      templateIds: row.templateIds,
      defaultTemplateId: row.defaultTemplateId
    });
    return toResponse(row, await this.templateNames(context, row.templateIds));
  }

  async update(
    context: KanbanRequestContext,
    caseTypeId: string,
    dto: UpdateCaseTypeDto,
    mutate: MutateContext
  ): Promise<CaseTypeResponse> {
    requireFlowAdmin(context);
    const current = await this.requireCaseType(context, caseTypeId);
    const keep = (value: string | null | undefined, previous: string | null) => {
      const normalized = optionalText(value);
      return normalized === undefined ? previous : normalized;
    };
    const finalState: CaseTypeWrite = {
      name: dto.name?.trim() || current.name,
      description: keep(dto.description, current.description),
      classificationCriteria: keep(dto.classificationCriteria, current.classificationCriteria),
      expectedEvidence: keep(dto.expectedEvidence, current.expectedEvidence),
      active: dto.active ?? current.active,
      templateIds: dto.templateIds ? [...new Set(dto.templateIds)] : current.templateIds,
      defaultTemplateId: dto.defaultTemplateId !== undefined ? dto.defaultTemplateId : current.defaultTemplateId
    };
    await this.validateTemplates(context, finalState, current.templateIds);
    const row = await this.caseTypes.update(context.databaseRef, context.clientId, caseTypeId, finalState, context.identityId);
    await this.audit.record('kanban_case_type_updated', mutate, null, {
      caseTypeId,
      fields: Object.keys(dto).filter((key) => (dto as Record<string, unknown>)[key] !== undefined).sort(),
      active: row.active,
      templateIds: row.templateIds,
      defaultTemplateId: row.defaultTemplateId
    });
    return toResponse(row, await this.templateNames(context, row.templateIds));
  }

  private async validateTemplates(context: KanbanRequestContext, finalState: CaseTypeWrite, currentTemplateIds: string[]) {
    const templates =
      finalState.templateIds.length > 0
        ? await this.templates.listByIds(context.databaseRef, context.clientId, finalState.templateIds)
        : [];
    validateCaseTypeTemplates(finalState, currentTemplateIds, templates);
  }

  private async requireCaseType(context: KanbanRequestContext, caseTypeId: string): Promise<CaseTypeRow> {
    const row = await this.caseTypes.findById(context.databaseRef, context.clientId, caseTypeId);
    if (!row) {
      throw new NotFoundException(CASE_TYPE_NOT_FOUND);
    }
    return row;
  }

  private async templateNames(context: KanbanRequestContext, ids: string[]): Promise<Map<string, DocumentTemplateRow>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await this.templates.listByIds(context.databaseRef, context.clientId, unique);
    return new Map(rows.map((row) => [row.id, row]));
  }
}

function toResponse(row: CaseTypeRow, templates: Map<string, DocumentTemplateRow>): CaseTypeResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    classificationCriteria: row.classificationCriteria,
    expectedEvidence: row.expectedEvidence,
    active: row.active,
    defaultTemplateId: row.defaultTemplateId,
    templates: row.templateIds
      .map((id) => templates.get(id))
      .filter((template): template is DocumentTemplateRow => Boolean(template))
      .map((template) => ({ id: template.id, name: template.name, active: template.active }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
