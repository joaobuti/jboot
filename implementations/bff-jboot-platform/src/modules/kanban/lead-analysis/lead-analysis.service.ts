import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { UploadedFile } from '../attachments/attachments.service';
import { StorageService } from '../attachments/storage.service';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { CaseTypesRepository } from '../case-types/case-types.repository';
import { DocumentTemplatesRepository } from '../document-templates/document-templates.repository';
import { DocumentTemplatesService } from '../document-templates/document-templates.service';
import { DOCX_CONTENT_TYPE } from '../document-templates/docx-package';
import { TemplateValidationRunner } from '../document-templates/template-validation-runner.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { CardLeadRow, LeadsRepository } from '../leads/leads.repository';
import { MembersRepository } from '../members/members.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { OfficesRepository } from '../offices/offices.repository';
import { DocumentPdfQueueService } from '../pdf/document-pdf-queue.service';
import { BoardAccessService } from '../shared/board-access.service';
import { FLOW_ADMIN_SCOPE } from '../shared/card-visibility';
import { CardVisibilityService, VisibleCard } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import {
  AddLeadCaseDto,
  AnalysisCaseTypeOption,
  ChangeLeadCaseDto,
  DocumentFormat,
  EditedVersionResponse,
  GenerateLeadDocumentDto,
  GeneratedDocumentDownloadResponse,
  GeneratedDocumentResponse,
  LeadAnalysisResponse,
  LeadCaseResponse,
  LeadDeliveredDocumentsResponse,
  RemoveLeadCaseDto
} from './dto/lead-analysis.dto';
import { assertEditedDocumentFileAllowed, generatedDocumentFileName } from './generated-document-file';
import { resolveGeneration, sourceFromSubmission, variableLabel } from './generation-data';
import { isAnalysisOpen } from './lead-analysis-state';
import {
  AnalysisRejection,
  GeneratedDocumentRow,
  GeneratedDocumentStorageRow,
  LeadAnalysisRepository,
  LeadCaseRow
} from './lead-analysis.repository';

export const ANALYSIS_ADMIN_REQUIRED = {
  code: 'lead_admin_required',
  message: 'Only a Flow tenant admin (flow:admin) can manage the lead analysis'
} as const;

const GENERATED_DOCUMENT_NOT_FOUND = { code: 'generated_document_not_found', message: 'Generated document not found' } as const;
const LEAD_CASE_NOT_FOUND = { code: 'lead_case_not_found', message: 'Lead case not found' } as const;

type CurrentSubmission = NonNullable<CardLeadRow['currentSubmission']>;

interface AnalysisTarget {
  card: VisibleCard;
  lead: CardLeadRow;
}

/**
 * Analise manual do lead pelo gestor (CRM de leads, Sprint 6; ADR 014,
 * Decisoes 1, 2 e 4): classificacao (N casos, P3), geracao do `.docx` a partir
 * do modelo, revisao (aprovar ou substituir por versao editada), PDF do
 * aprovado e entrega ao escritorio.
 *
 * Autorizacao: toda rota de gestao exige `flow:admin` (scope no controller +
 * `requireAdmin` aqui) e card visivel (`requireVisibleCard`: com a chave de
 * escritorio desligada o admin precisa ser membro, como na devolucao da S4).
 * O escritorio so le os documentos APROVADOS do ciclo atual (P11), por rotas
 * proprias que exigem apenas o card visivel.
 *
 * Evento, auditoria, notificacao e log: so ids, versao, estado, sha256 e o
 * motivo digitado. Valores das variaveis (dado pessoal) ficam so em
 * `filled_variables` no banco do tenant e nunca saem pela API.
 */
@Injectable()
export class LeadAnalysisService {
  private readonly logger = new Logger(LeadAnalysisService.name);

  constructor(
    private readonly analysis: LeadAnalysisRepository,
    private readonly leads: LeadsRepository,
    private readonly visibility: CardVisibilityService,
    private readonly access: BoardAccessService,
    private readonly templates: DocumentTemplatesService,
    private readonly templatesRepository: DocumentTemplatesRepository,
    private readonly caseTypes: CaseTypesRepository,
    private readonly offices: OfficesRepository,
    private readonly storage: StorageService,
    private readonly runner: TemplateValidationRunner,
    private readonly pdfQueue: DocumentPdfQueueService,
    private readonly notifications: NotificationsService,
    private readonly assignees: AssigneesRepository,
    private readonly members: MembersRepository,
    private readonly audit: KanbanAuditService
  ) {}

  // ------------------------------------------------------------- gestor

  async getAnalysis(context: KanbanRequestContext, boardId: string, cardId: string): Promise<LeadAnalysisResponse> {
    const target = await this.requireAdminTarget(context, boardId, cardId);
    return this.buildAnalysis(context, target);
  }

  async addCase(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    dto: AddLeadCaseDto,
    mutate: MutateContext
  ): Promise<LeadAnalysisResponse> {
    const target = await this.requireAdminTarget(context, boardId, cardId);
    const submission = requireOpenAnalysis(target.lead);
    const result = await this.analysis.addCase(context.databaseRef, context.clientId, {
      cardId,
      submissionId: submission.id,
      caseTypeId: dto.caseTypeId,
      identityId: context.identityId
    });
    if (!result.ok) {
      throw rejection(result);
    }
    await this.audit.record('kanban_lead_case_classified', mutate, boardId, {
      cardId,
      submissionId: submission.id,
      caseId: result.caseId,
      caseTypeId: dto.caseTypeId,
      leadStatus: lastStatus(result.steps)
    });
    return this.buildAnalysis(context, await this.refresh(context, target));
  }

  async changeCase(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    caseId: string,
    dto: ChangeLeadCaseDto,
    mutate: MutateContext
  ): Promise<LeadAnalysisResponse> {
    const target = await this.requireAdminTarget(context, boardId, cardId);
    const submission = requireOpenAnalysis(target.lead);
    const reason = dto.reason.trim();
    const result = await this.analysis.changeCase(context.databaseRef, context.clientId, {
      cardId,
      submissionId: submission.id,
      caseId,
      caseTypeId: dto.caseTypeId,
      reason,
      identityId: context.identityId
    });
    if (!result.ok) {
      throw rejection(result);
    }
    await this.audit.record('kanban_lead_case_changed', mutate, boardId, {
      cardId,
      submissionId: submission.id,
      caseId: result.caseId,
      previousCaseId: result.previousCaseId,
      caseTypeId: dto.caseTypeId,
      reason,
      leadStatus: lastStatus(result.steps)
    });
    return this.buildAnalysis(context, await this.refresh(context, target));
  }

  async removeCase(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    caseId: string,
    dto: RemoveLeadCaseDto,
    mutate: MutateContext
  ): Promise<LeadAnalysisResponse> {
    const target = await this.requireAdminTarget(context, boardId, cardId);
    const submission = requireOpenAnalysis(target.lead);
    const reason = dto.reason.trim();
    const result = await this.analysis.removeCase(context.databaseRef, context.clientId, {
      cardId,
      submissionId: submission.id,
      caseId,
      reason,
      identityId: context.identityId
    });
    if (!result.ok) {
      throw rejection(result);
    }
    await this.audit.record('kanban_lead_case_removed', mutate, boardId, {
      cardId,
      submissionId: submission.id,
      caseId,
      reason,
      leadStatus: lastStatus(result.steps)
    });
    return this.buildAnalysis(context, await this.refresh(context, target));
  }

  /**
   * Gera o rascunho do caso a partir da versao ATUAL utilizavel do modelo
   * (padrao do tipo ou o escolhido entre os vinculados). Obrigatoria sem valor
   * bloqueia antes de renderizar (422 com a lista); o `sha256` do modelo e
   * conferido antes de renderizar; o primeiro documento do ciclo leva o lead a
   * `aguardando_revisao` (PE14).
   */
  async generate(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    caseId: string,
    dto: GenerateLeadDocumentDto,
    mutate: MutateContext
  ): Promise<LeadAnalysisResponse> {
    const target = await this.requireAdminTarget(context, boardId, cardId);
    const submission = requireOpenAnalysis(target.lead);
    const leadCase = await this.analysis.findCase(context.databaseRef, context.clientId, cardId, caseId);
    if (!leadCase || leadCase.submissionId !== submission.id || leadCase.supersededAt) {
      throw new NotFoundException(LEAD_CASE_NOT_FOUND);
    }
    const generation = await this.templates.resolveForGeneration(context, leadCase.caseTypeId, dto.templateId ?? null);
    const [variables, cases, office] = await Promise.all([
      this.templatesRepository.listVariables(context.databaseRef, context.clientId, generation.version.id),
      this.analysis.listCases(context.databaseRef, context.clientId, cardId, submission.id),
      target.card.officeId ? this.offices.findById(context.databaseRef, context.clientId, target.card.officeId) : Promise.resolve(null)
    ]);
    const source = sourceFromSubmission({
      snapshot: submission.customerSnapshot,
      submittedAt: submission.submittedAt,
      officeName: office?.name ?? null,
      caseTypeNames: cases.filter((row) => !row.supersededAt).map((row) => row.caseTypeName),
      currentCaseTypeName: leadCase.caseTypeName,
      today: new Date()
    });
    const resolved = resolveGeneration(source, variables);
    if (resolved.missingRequired.length > 0) {
      throw new UnprocessableEntityException({
        code: 'document_required_variables_missing',
        message: 'Required template variables have no value for this lead',
        missingVariables: resolved.missingRequired.map((key) => ({ key, label: variableLabel(key) }))
      });
    }

    const templateFile = await this.storage.download(generation.version.storageKey);
    if (createHash('sha256').update(templateFile).digest('hex') !== generation.version.sha256) {
      this.logger.error(
        `template_integrity_mismatch client=${context.clientId} template=${generation.templateId} version=${generation.version.id}`
      );
      throw new ConflictException({
        code: 'template_integrity_mismatch',
        message: 'Stored template file does not match its recorded checksum'
      });
    }
    const rendered = await this.runner.render(templateFile, resolved.data);
    if (!rendered.ok) {
      this.logger.warn(`document_render_rejected client=${context.clientId} card=${cardId} code=${rendered.code}`);
      throw new HttpException({ code: rendered.code, message: rendered.message, ...rendered.details }, rendered.status);
    }

    const documentId = randomUUID();
    const storageKey = this.storage.buildGeneratedDocumentKey({ clientId: context.clientId, cardId, documentId, format: 'docx' });
    const file = Buffer.from(rendered.file);
    await this.storage.upload(storageKey, file, DOCX_CONTENT_TYPE);
    const result = await this.withCompensation(storageKey, () =>
      this.analysis.insertGenerated(context.databaseRef, context.clientId, {
        id: documentId,
        cardId,
        submissionId: submission.id,
        leadCaseId: caseId,
        templateId: generation.templateId,
        templateVersionId: generation.version.id,
        templateSha256: generation.version.sha256,
        catalogVersion: generation.version.catalogVersion,
        storageBucket: this.storage.bucketName,
        storageKey,
        sha256: rendered.sha256,
        sizeBytes: file.length,
        filledVariables: resolved.filledVariables,
        identityId: context.identityId
      })
    );
    await this.audit.record('kanban_lead_document_generated', mutate, boardId, {
      cardId,
      submissionId: submission.id,
      caseId,
      documentId,
      version: result.version,
      templateId: generation.templateId,
      templateVersionId: generation.version.id,
      templateSha256: generation.version.sha256,
      sha256: rendered.sha256,
      missingOptionalCount: resolved.missingOptional.length,
      leadStatus: lastStatus(result.steps)
    });
    return this.buildAnalysis(context, await this.refresh(context, target));
  }

  /** Aprova o rascunho: `pdf_status = 'pending'` na mesma transacao (outbox), PDF enfileirado, escritorio notificado. */
  async approve(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    documentId: string,
    mutate: MutateContext
  ): Promise<LeadAnalysisResponse> {
    const target = await this.requireAdminTarget(context, boardId, cardId);
    const submission = requireOpenAnalysis(target.lead);
    const result = await this.analysis.approve(context.databaseRef, context.clientId, {
      cardId,
      submissionId: submission.id,
      documentId,
      identityId: context.identityId
    });
    if (!result.ok) {
      throw rejection(result);
    }
    await this.pdfQueue.enqueue({ databaseRef: context.databaseRef, clientId: context.clientId, documentId });
    await this.audit.record('kanban_lead_document_approved', mutate, boardId, {
      cardId,
      submissionId: submission.id,
      caseId: result.leadCaseId,
      documentId,
      version: result.version,
      leadStatus: lastStatus(result.steps)
    });
    await this.notifyOffice(context, boardId, target.card, submission.submittedByIdentityId, documentId, submission.id);
    return this.buildAnalysis(context, await this.refresh(context, target));
  }

  /**
   * Substitui o documento (rascunho ou aprovado) pela versao editada no Word:
   * a versao enviada nasce APROVADA (o gestor e o revisor), com PDF novo.
   * Nao exige variaveis; marcador restante vira aviso.
   */
  async uploadEditedVersion(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    baseDocumentId: string,
    file: UploadedFile | undefined,
    mutate: MutateContext
  ): Promise<EditedVersionResponse> {
    const target = await this.requireAdminTarget(context, boardId, cardId);
    const submission = requireOpenAnalysis(target.lead);
    const allowed = assertEditedDocumentFileAllowed(file);
    const base = await this.analysis.findDocument(context.databaseRef, context.clientId, cardId, baseDocumentId);
    if (!base || base.submissionId !== submission.id) {
      throw new NotFoundException(GENERATED_DOCUMENT_NOT_FOUND);
    }
    const inspected = await this.runner.inspectEdited(allowed.buffer);
    if (!inspected.ok) {
      this.logger.warn(`edited_document_rejected client=${context.clientId} card=${cardId} code=${inspected.code}`);
      throw new HttpException({ code: inspected.code, message: inspected.message, ...inspected.details }, inspected.status);
    }
    const documentId = randomUUID();
    const storageKey = this.storage.buildGeneratedDocumentKey({ clientId: context.clientId, cardId, documentId, format: 'docx' });
    await this.storage.upload(storageKey, allowed.buffer, DOCX_CONTENT_TYPE);
    const result = await this.withCompensation(storageKey, () =>
      this.analysis.insertEdited(context.databaseRef, context.clientId, {
        id: documentId,
        cardId,
        submissionId: submission.id,
        baseDocumentId,
        storageBucket: this.storage.bucketName,
        storageKey,
        sha256: inspected.sha256,
        sizeBytes: allowed.size,
        identityId: context.identityId
      })
    );
    await this.pdfQueue.enqueue({ databaseRef: context.databaseRef, clientId: context.clientId, documentId });
    await this.audit.record('kanban_lead_document_replaced', mutate, boardId, {
      cardId,
      submissionId: submission.id,
      caseId: result.leadCaseId,
      documentId,
      replacedDocumentId: baseDocumentId,
      version: result.version,
      sha256: inspected.sha256,
      warningCodes: inspected.warnings.map((warning) => warning.code),
      leadStatus: lastStatus(result.steps)
    });
    await this.notifyOffice(context, boardId, target.card, submission.submittedByIdentityId, documentId, submission.id);
    return {
      analysis: await this.buildAnalysis(context, await this.refresh(context, target)),
      documentId,
      warnings: inspected.warnings
    };
  }

  /** "Gerar PDF novamente": `failed` volta a `pending` (tentativas zeradas) e e reenfileirado; `done` = 409. */
  async retryPdf(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    documentId: string,
    mutate: MutateContext
  ): Promise<LeadAnalysisResponse> {
    const target = await this.requireAdminTarget(context, boardId, cardId);
    const { outcome } = await this.analysis.requestPdfRetry(context.databaseRef, context.clientId, { cardId, documentId });
    if (outcome === 'not_found') {
      throw new NotFoundException(GENERATED_DOCUMENT_NOT_FOUND);
    }
    if (outcome === 'not_approved') {
      throw new ConflictException({ code: 'document_not_approved', message: 'Only an approved document has a PDF' });
    }
    if (outcome === 'already_done') {
      throw new ConflictException({ code: 'pdf_already_generated', message: 'The PDF of this document was already generated' });
    }
    await this.pdfQueue.enqueue({ databaseRef: context.databaseRef, clientId: context.clientId, documentId });
    if (outcome === 'requeued') {
      await this.audit.record('kanban_lead_document_pdf_retry', mutate, boardId, { cardId, documentId });
    }
    return this.buildAnalysis(context, target);
  }

  /** Download pelo gestor: qualquer versao do card (rascunho so em `.docx`; PDF so quando gerado). */
  async downloadForManager(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    documentId: string,
    format: DocumentFormat
  ): Promise<GeneratedDocumentDownloadResponse> {
    await this.requireAdminTarget(context, boardId, cardId);
    const document = await this.analysis.findDocument(context.databaseRef, context.clientId, cardId, documentId);
    if (!document) {
      throw new NotFoundException(GENERATED_DOCUMENT_NOT_FOUND);
    }
    return this.signedDownload(document, format);
  }

  // ------------------------------------------------------------- escritorio (P11)

  /** Documentos entregues: aprovados dos casos ativos do ciclo atual. Qualquer leitor do card visivel. */
  async listDelivered(context: KanbanRequestContext, boardId: string, cardId: string): Promise<LeadDeliveredDocumentsResponse> {
    await this.access.requireBoard(context, boardId);
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    const lead = await this.leads.findByCard(context.databaseRef, context.clientId, cardId);
    const rows = lead.currentSubmission
      ? await this.analysis.listDelivered(context.databaseRef, context.clientId, cardId, lead.currentSubmission.id)
      : [];
    return {
      cardId,
      leadStatus: lead.status,
      documents: rows.map((row) => ({
        id: row.id,
        title: row.templateName,
        version: row.version,
        editedByManager: row.origin === 'uploaded_edit',
        approvedAt: row.approvedAt,
        pdfStatus: row.pdfStatus === 'done' ? 'ready' : 'pending'
      }))
    };
  }

  /** Download do documento ENTREGUE: so aprovado, de caso ativo, do ciclo atual; o resto responde 404. */
  async downloadDelivered(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    documentId: string,
    format: DocumentFormat
  ): Promise<GeneratedDocumentDownloadResponse> {
    await this.access.requireBoard(context, boardId);
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    const lead = await this.leads.findByCard(context.databaseRef, context.clientId, cardId);
    const document = await this.analysis.findDocument(context.databaseRef, context.clientId, cardId, documentId);
    if (
      !document ||
      document.status !== 'aprovado' ||
      !document.caseActive ||
      document.submissionId !== lead.currentSubmission?.id
    ) {
      throw new NotFoundException(GENERATED_DOCUMENT_NOT_FOUND);
    }
    return this.signedDownload(document, format);
  }

  // ------------------------------------------------------------- apoio

  private async requireAdminTarget(context: KanbanRequestContext, boardId: string, cardId: string): Promise<AnalysisTarget> {
    requireAdmin(context);
    await this.access.requireBoard(context, boardId);
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    const lead = await this.leads.findByCard(context.databaseRef, context.clientId, cardId);
    return { card, lead };
  }

  private async refresh(context: KanbanRequestContext, target: AnalysisTarget): Promise<AnalysisTarget> {
    return { card: target.card, lead: await this.leads.findByCard(context.databaseRef, context.clientId, target.card.id) };
  }

  private async withCompensation<T>(
    storageKey: string,
    write: () => Promise<({ ok: true } & T) | ({ ok: false } & AnalysisRejection)>
  ): Promise<{ ok: true } & T> {
    let result: ({ ok: true } & T) | ({ ok: false } & AnalysisRejection);
    try {
      result = await write();
    } catch (error) {
      await this.storage.deleteQuietly(storageKey);
      throw error;
    }
    if (!result.ok) {
      await this.storage.deleteQuietly(storageKey);
      throw rejection(result);
    }
    return result;
  }

  private async signedDownload(document: GeneratedDocumentStorageRow, format: DocumentFormat): Promise<GeneratedDocumentDownloadResponse> {
    if (format === 'pdf' && (document.pdfStatus !== 'done' || !document.pdfStorageKey)) {
      throw new ConflictException({ code: 'pdf_not_ready', message: 'The PDF of this document is not available', pdfStatus: document.pdfStatus });
    }
    const fileName = generatedDocumentFileName(document.templateName, document.version, document.approvedAt !== null, format);
    const key = format === 'pdf' ? (document.pdfStorageKey as string) : document.storageKey;
    const signed = await this.storage.getSignedDownloadUrl(key, { downloadFileName: fileName });
    return { ...signed, fileName };
  }

  private async buildAnalysis(context: KanbanRequestContext, target: AnalysisTarget): Promise<LeadAnalysisResponse> {
    const submission = target.lead.currentSubmission;
    const [cases, documents, caseTypes] = await Promise.all([
      submission ? this.analysis.listCases(context.databaseRef, context.clientId, target.card.id, submission.id) : Promise.resolve([]),
      submission ? this.analysis.listDocuments(context.databaseRef, context.clientId, target.card.id, submission.id) : Promise.resolve([]),
      this.caseTypeOptions(context)
    ]);
    const names = await this.displayNames([
      ...cases.flatMap((row) => [row.decidedByIdentityId, row.supersededByIdentityId]),
      ...documents.flatMap((row) => [row.createdByIdentityId, row.approvedByIdentityId])
    ]);
    const toCase = (row: LeadCaseRow): LeadCaseResponse => ({
      id: row.id,
      caseTypeId: row.caseTypeId,
      caseTypeName: row.caseTypeName,
      caseTypeActive: row.caseTypeActive,
      source: row.source,
      decidedByIdentityId: row.decidedByIdentityId,
      decidedByName: names.get(row.decidedByIdentityId) ?? null,
      decidedAt: row.decidedAt,
      replacesCaseId: row.replacesCaseId,
      supersededAt: row.supersededAt,
      supersededByName: row.supersededByIdentityId ? (names.get(row.supersededByIdentityId) ?? null) : null,
      supersededReason: row.supersededReason,
      documents: documents.filter((document) => document.leadCaseId === row.id).map((document) => toDocument(document, names))
    });
    return {
      cardId: target.card.id,
      leadStatus: target.lead.status,
      submissionId: submission?.id ?? null,
      analysisOpen: submission !== null && isAnalysisOpen(target.lead.status),
      caseTypes,
      cases: cases.filter((row) => !row.supersededAt).map(toCase),
      removedCases: cases.filter((row) => row.supersededAt).map(toCase)
    };
  }

  /** Tipos de caso ATIVOS (inativo nao aparece para classificacao nem geracao) com os modelos vinculados. */
  private async caseTypeOptions(context: KanbanRequestContext): Promise<AnalysisCaseTypeOption[]> {
    const [types, templates] = await Promise.all([
      this.caseTypes.list(context.databaseRef, context.clientId),
      this.templatesRepository.list(context.databaseRef, context.clientId)
    ]);
    const byId = new Map(templates.map((template) => [template.id, template]));
    return types
      .filter((type) => type.active)
      .map((type) => ({
        id: type.id,
        name: type.name,
        templates: type.templateIds
          .map((templateId) => byId.get(templateId))
          .filter((template): template is NonNullable<typeof template> => Boolean(template))
          .map((template) => {
            const unusableReason = !template.active
              ? 'template_inactive'
              : !template.currentVersion
                ? 'template_without_version'
                : template.currentVersion.validationStatus !== 'valid'
                  ? 'template_version_not_usable'
                  : null;
            return {
              id: template.id,
              name: template.name,
              isDefault: template.id === type.defaultTemplateId,
              usable: unusableReason === null,
              unusableReason
            };
          })
      }));
  }

  /** Escritorio: criador, responsaveis e quem enviou, somente os que ainda veem o card (filtro do `notify`). */
  private async notifyOffice(
    context: KanbanRequestContext,
    boardId: string,
    card: VisibleCard,
    submittedBy: string,
    documentId: string,
    submissionId: string
  ): Promise<void> {
    try {
      const cardAssignees = await this.assignees.list(context.databaseRef, context.clientId, card.id);
      const recipients = new Set<string>([card.createdByIdentityId, submittedBy, ...cardAssignees.map((row) => row.identityId)]);
      await Promise.all(
        [...recipients].map((recipientIdentityId) =>
          this.notifications.notify(context, {
            boardId,
            cardId: card.id,
            recipientIdentityId,
            actorIdentityId: context.identityId,
            kind: 'card.lead_document_approved',
            payload: { submissionId, documentId }
          })
        )
      );
    } catch (error) {
      // Efeito colateral: a aprovacao ja foi gravada; so ids no log.
      this.logger.error(`lead_document_approved_notification_failed card=${card.id}: ${(error as Error).message}`);
    }
  }

  private async displayNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) {
      return new Map();
    }
    const resolved = await this.members.resolveDisplayNames(unique);
    const names = new Map<string, string>();
    for (const [id, summary] of resolved) {
      if (summary.displayName) {
        names.set(id, summary.displayName);
      }
    }
    return names;
  }
}

function toDocument(row: GeneratedDocumentRow, names: Map<string, string>): GeneratedDocumentResponse {
  const variables = Object.entries(row.filledVariables ?? {}).map(([key, variable]) => ({
    key,
    label: variableLabel(key),
    origin: variable.origin,
    required: variable.required,
    filled: variable.filled
  }));
  return {
    id: row.id,
    caseId: row.leadCaseId,
    version: row.version,
    origin: row.origin,
    status: row.status,
    basedOnDocumentId: row.basedOnDocumentId,
    templateId: row.templateId,
    templateName: row.templateName,
    templateVersionId: row.templateVersionId,
    templateVersion: row.templateVersionNumber,
    templateSha256: row.templateSha256,
    catalogVersion: row.catalogVersion,
    sizeBytes: row.sizeBytes,
    createdByIdentityId: row.createdByIdentityId,
    createdByName: names.get(row.createdByIdentityId) ?? null,
    createdAt: row.createdAt,
    approvedByIdentityId: row.approvedByIdentityId,
    approvedByName: row.approvedByIdentityId ? (names.get(row.approvedByIdentityId) ?? null) : null,
    approvedAt: row.approvedAt,
    pdf: row.pdfStatus
      ? { status: row.pdfStatus, attempts: row.pdfAttempts, errorCode: row.pdfErrorCode, completedAt: row.pdfCompletedAt }
      : null,
    missingOptional: variables.filter((variable) => !variable.filled && !variable.required).map((variable) => variable.key),
    variables
  };
}

function isFlowAdmin(context: KanbanRequestContext): boolean {
  return context.scopes.includes(FLOW_ADMIN_SCOPE);
}

function requireAdmin(context: KanbanRequestContext): void {
  if (!isFlowAdmin(context)) {
    throw new ForbiddenException(ANALYSIS_ADMIN_REQUIRED);
  }
}

/** Analise aberta (enviado, aguardando_revisao, aprovado) e com ciclo de envio. */
function requireOpenAnalysis(lead: CardLeadRow): CurrentSubmission {
  if (!isAnalysisOpen(lead.status) || !lead.currentSubmission) {
    throw new ConflictException({
      code: 'lead_not_in_analysis',
      message: 'The lead is not waiting for the manager analysis',
      leadStatus: lead.status
    });
  }
  return lead.currentSubmission;
}

function lastStatus(steps: Array<{ to: string }>): string | null {
  return steps.length > 0 ? steps[steps.length - 1].to : null;
}

function rejection(result: AnalysisRejection): HttpException {
  switch (result.reason) {
    case 'lead_not_in_analysis':
      return new ConflictException({
        code: 'lead_not_in_analysis',
        message: 'The lead is not waiting for the manager analysis',
        leadStatus: result.leadStatus
      });
    case 'cycle_changed':
      return new ConflictException({
        code: 'lead_cycle_changed',
        message: 'The lead was returned or resubmitted meanwhile; reload the card',
        leadStatus: result.leadStatus
      });
    case 'case_not_found':
      return new NotFoundException(LEAD_CASE_NOT_FOUND);
    case 'case_type_not_found':
      return new NotFoundException({ code: 'case_type_not_found', message: 'Case type not found' });
    case 'case_type_inactive':
      return new UnprocessableEntityException({ code: 'case_type_inactive', message: 'Case type is inactive' });
    case 'case_type_already_classified':
      return new ConflictException({ code: 'case_type_already_classified', message: 'The lead already has an active case of this type' });
    case 'case_type_unchanged':
      return new UnprocessableEntityException({ code: 'case_type_unchanged', message: 'Choose a different case type' });
    case 'case_limit_reached':
      return new UnprocessableEntityException({ code: 'lead_case_limit_reached', message: 'The lead reached the maximum number of cases' });
    case 'document_not_found':
      return new NotFoundException(GENERATED_DOCUMENT_NOT_FOUND);
    case 'document_not_reviewable':
      return new ConflictException({
        code: 'document_not_reviewable',
        message: 'This document version can no longer be reviewed',
        documentStatus: result.documentStatus
      });
  }
}
