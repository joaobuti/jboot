import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { GenerationCandidateRow, TemplateVersionStorageRow } from './document-templates.repository';

/**
 * Modelo que a geracao (S6) usa para um tipo de caso. Regra unica, testada na
 * S5 e chamada pela S6 antes de ler o objeto:
 *
 * 1. tipo de caso do tenant (404 `case_type_not_found`) e ativo (422
 *    `case_type_inactive`: inativo nao aparece para classificacao nem geracao);
 * 2. modelo = o informado pelo gestor (precisa estar vinculado ao tipo, 422
 *    `template_not_linked`) ou o padrao do tipo (422
 *    `case_type_without_default_template` quando nao ha);
 * 3. modelo ativo (422 `template_inactive`) com versao atual (422
 *    `template_without_version`);
 * 4. versao atual `valid` (422 `template_version_not_usable`, com as variaveis
 *    desconhecidas): versao com variavel desconhecida nao gera ate o gestor
 *    enviar versao corrigida. Nao ha fallback para versao anterior.
 *
 * A S6 le o objeto por `version.storageKey`, confere `version.sha256` antes de
 * renderizar e grava `template_version_id` + `sha256` no documento gerado
 * (ADR 014, Decisao 4).
 */
export interface GenerationTemplate {
  caseTypeId: string;
  caseTypeName: string;
  templateId: string;
  templateName: string;
  version: TemplateVersionStorageRow;
}

export function resolveGenerationTemplate(
  candidate: GenerationCandidateRow | null,
  requestedTemplateId: string | null
): GenerationTemplate {
  if (!candidate) {
    throw new NotFoundException({ code: 'case_type_not_found', message: 'Case type not found' });
  }
  if (!candidate.caseTypeActive) {
    throw new UnprocessableEntityException({ code: 'case_type_inactive', message: 'Case type is inactive' });
  }
  if (requestedTemplateId && !candidate.linkedTemplateIds.includes(requestedTemplateId)) {
    throw new UnprocessableEntityException({ code: 'template_not_linked', message: 'Template is not linked to this case type' });
  }
  if (!requestedTemplateId && !candidate.defaultTemplateId) {
    throw new UnprocessableEntityException({
      code: 'case_type_without_default_template',
      message: 'Case type has no default template'
    });
  }
  const template = candidate.template;
  if (!template) {
    throw new UnprocessableEntityException({ code: 'template_not_linked', message: 'Template is not linked to this case type' });
  }
  if (!template.active) {
    throw new UnprocessableEntityException({ code: 'template_inactive', message: 'Template is inactive' });
  }
  const version = template.currentVersion;
  if (!version) {
    throw new UnprocessableEntityException({ code: 'template_without_version', message: 'Template has no uploaded version' });
  }
  if (version.validationStatus !== 'valid') {
    const unknown = (version.validationReport as { unknownVariables?: unknown }).unknownVariables;
    throw new UnprocessableEntityException({
      code: 'template_version_not_usable',
      message: 'Current template version has unknown variables',
      unknownVariables: Array.isArray(unknown) ? unknown : []
    });
  }
  return {
    caseTypeId: candidate.caseTypeId,
    caseTypeName: candidate.caseTypeName,
    templateId: template.id,
    templateName: template.name,
    version
  };
}
