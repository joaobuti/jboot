import { randomUUID } from 'node:crypto';
import { ConflictException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ActivitiesRepository } from '../activities/activities.repository';
import { ActionAnalysisRepository } from '../action-analysis/action-analysis.repository';
import { UploadedFile } from '../attachments/attachments.service';
import { StorageService } from '../attachments/storage.service';
import { AiAutomationOutboxRepository, DispatchedRun } from '../automation/ai-automation-outbox.repository';
import { expectedResultOf } from '../automation/expected-result';
import { AutomationCustomerService } from '../customer-validation/automation-customer.service';
import { ValidationToolError } from '../customer-validation/customer-validation.service';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { TemplateValidationRunner } from '../document-templates/template-validation-runner.service';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { assertEditedDocumentFileAllowed } from '../lead-analysis/generated-document-file';
import { DocumentPdfQueueService } from '../pdf/document-pdf-queue.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { HisconPrintRequest, HisconPrintService, printRegionProblems } from './document/hiscon-print';
import { PetitionClosingLine, petitionClosingLines } from './document/petition-closing';
import { PetitionContent } from './document/petition-content';
import { buildPetitionDocx, PetitionFigure } from './document/petition-docx';
import { petitionFileName, validatePetitionContent } from './document/petition-validation';
import { FinishPetitionsInput, finishProblems } from './initial-petitions.input';
import { ClosingPetition, InitialPetitionsRepository, PetitionRunRow } from './initial-petitions.repository';
import { PetitionClosingContext, PetitionPreconditionsService } from './petition-preconditions.service';

const UNRESOLVED_CLOSING: PetitionClosingContext = { place: null, signer: null, gaps: ['no_assignee_lawyer_for_uf'] };
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const HISCON = 'extrato_beneficio';

/** Data de hoje em Sao Paulo (AAAA-MM-DD): limite da data de acesso das notas. */
export function todayInBrazil(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Peticoes iniciais da rotina, modo Flow (ADR 020; S5 de docs/product/flow-initial-petitions-sprints.md).
 * A rotina recorta o print, envia cada peticao (provisoria, conferida e montada para achar erro cedo) e
 * fecha com o relatorio. No fechamento o Flow monta os .docx, grava tudo e encerra a execucao numa
 * transacao; com ao menos uma peticao grava `ai.automation_completed`, e o card anda pelas regras
 * `ai_completed -> move_card` da coluna. A IA nunca move card nem aprova documento.
 */
@Injectable()
export class InitialPetitionsService {
  private readonly logger = new Logger(InitialPetitionsService.name);

  constructor(
    private readonly repository: InitialPetitionsRepository,
    private readonly outbox: AiAutomationOutboxRepository,
    private readonly analyses: ActionAnalysisRepository,
    private readonly cardCustomers: CardCustomersRepository,
    private readonly automationCustomer: AutomationCustomerService,
    private readonly prints: HisconPrintService,
    private readonly preconditions: PetitionPreconditionsService,
    private readonly storage: StorageService,
    private readonly visibility: CardVisibilityService,
    private readonly activities: ActivitiesRepository,
    private readonly audit: KanbanAuditService,
    private readonly pdfQueue: DocumentPdfQueueService,
    private readonly database: DatabaseService,
    private readonly runner: TemplateValidationRunner
  ) {}

  /** Recorta o print do HISCON e devolve a imagem para a rotina conferir a moldura. */
  async connectorCreatePrint(context: KanbanRequestContext, runId: string, request: HisconPrintRequest, mutate: MutateContext) {
    const run = await this.requireRun(context, runId);
    const problems = printRegionProblems(request);
    if (problems.length > 0) throw new ValidationToolError('invalid_print', `Print recusado: ${problems.join('; ')}.`);
    const file = await this.automationCustomer.cardCustomerDocumentFile(context, runId, HISCON, mutate);
    const figure = await this.prints.render(file.body, file.contentType, request).catch((error: Error) => {
      if (error.message === 'document_page_out_of_range') throw new ValidationToolError('invalid_print', 'Pagina fora do HISCON.');
      throw error;
    });
    await this.repository.saveFigure(context.databaseRef, context.clientId, run.id, { figureId: request.figureId, ...figure });
    await this.audit.record('kanban_initial_petition_print_created', mutate, run.boardId, { runId: run.id, figureId: request.figureId, page: request.page });
    return { figureId: request.figureId, width: figure.width, height: figure.height, png: figure.png };
  }

  /** Uma peticao por chamada; recusa sem gravar. Reenvio com a mesma chave substitui. */
  async connectorSubmit(
    context: KanbanRequestContext,
    runId: string,
    input: { petitionKey: string; actionIds: string[]; content: PetitionContent },
    mutate: MutateContext
  ) {
    const run = await this.requireRun(context, runId);
    if (run.actionConfig.documentGenerator === 'ai') {
      throw new ValidationToolError('generator_is_ai', 'Nesta regra quem gera o documento e a IA; o envio estruturado nao se aplica.');
    }
    const [figureIds, analysis, drafts] = await Promise.all([
      this.repository.figureIds(context.databaseRef, context.clientId, run.id),
      this.analyses.latestConcludedForCard(context.databaseRef, context.clientId, run.cardId),
      this.repository.drafts(context.databaseRef, context.clientId, run.id)
    ]);
    const errors = validatePetitionContent(input.content, { figureIds, today: todayInBrazil() });
    const fileName = petitionFileName(input.content);
    const others = drafts.filter((draft) => draft.petitionKey !== input.petitionKey);
    if (others.some((draft) => draft.fileName === fileName)) errors.push(`Ja existe outra peticao com o arquivo ${fileName} nesta execucao.`);
    if (!analysis && input.actionIds.length > 0) errors.push('O card nao tem Analise de Acoes concluida: envie actionIds vazio.');
    if (analysis) {
      const known = new Set(analysis.actions.map((action) => action.id));
      for (const id of input.actionIds) {
        if (!known.has(id)) errors.push(`Acao ${id} nao e da Analise de Acoes do card.`);
        const owner = others.find((draft) => draft.actionIds.includes(id));
        if (owner) errors.push(`Acao ${id} ja esta na peticao "${owner.petitionKey}".`);
      }
    }
    if (errors.length === 0) {
      // Monta ja aqui: erro de montagem aparece enquanto a rotina ainda pode corrigir.
      await this.build(context, run.id, input.content).catch(() => {
        errors.push('A peca nao pode ser montada em Word com este conteudo.');
      });
    }
    if (errors.length > 0) {
      throw new ValidationToolError('invalid_petition', `Peticao recusada, nada foi gravado. Corrija e envie de novo: ${errors.join(' ')}`);
    }
    await this.repository.saveDraft(context.databaseRef, context.clientId, run.id, {
      petitionKey: input.petitionKey,
      court: input.content.court,
      bank: input.content.fileBank,
      fileName,
      actionIds: [...new Set(input.actionIds)],
      content: input.content
    });
    await this.audit.record('kanban_initial_petition_submitted', mutate, run.boardId, {
      runId: run.id,
      petitionKey: input.petitionKey,
      actionCount: input.actionIds.length
    });
    const saved = others.length + 1;
    return {
      petitionKey: input.petitionKey,
      fileName,
      petitionsInRun: saved,
      next: 'Envie as demais peticoes e termine com flow_finish_initial_petitions.'
    };
  }

  async connectorFinish(context: KanbanRequestContext, runId: string, input: FinishPetitionsInput, mutate: MutateContext) {
    const run = await this.requireRun(context, runId);
    const link = await this.cardCustomers.findByCard(context.databaseRef, context.clientId, run.cardId);
    if (!link) throw new ValidationToolError('card_without_customer', 'O card nao tem cliente vinculado.');
    const [drafts, analysis] = await Promise.all([
      this.repository.drafts(context.databaseRef, context.clientId, run.id),
      this.analyses.latestConcludedForCard(context.databaseRef, context.clientId, run.cardId)
    ]);
    const problems = finishProblems(input, drafts, analysis ? analysis.actions.map((action) => action.id) : null);
    if (problems.length > 0) {
      throw new ValidationToolError('invalid_finish', `Fechamento recusado, nada foi gravado. Corrija e envie de novo: ${problems.join(' ')}`);
    }
    const concluded = input.status === 'concluida';
    const generator = run.actionConfig.documentGenerator === 'ai' ? 'ai' : 'flow';
    const evaluation = await this.preconditions.evaluate(context.databaseRef, context.clientId, run.cardId);
    // Fecho do Flow (S7): local do escritorio, data da geracao e responsavel do card com OAB na UF.
    // Pre-condicao que deixou de valer durante a execucao: fecho todo em XXXX.
    const closing = evaluation.ok ? evaluation.context.closing : UNRESOLVED_CLOSING;
    const closingLines = petitionClosingLines(closing, todayInBrazil());
    const petitions: ClosingPetition[] = concluded ? await this.uploadAll(context, run, drafts, closingLines) : [];
    const created = await this.repository
      .createClosingRun(context.databaseRef, context.clientId, {
        runId: run.id,
        cardId: run.cardId,
        customerId: link.customerId,
        ownerIdentityId: context.identityId,
        generator,
        status: input.status,
        failureReason: concluded ? null : input.failureReason?.trim() ?? null,
        analysisId: analysis?.id ?? null,
        report: concluded && input.report ? { ...input.report, actionsWithoutPetition: input.actionsWithoutPetition ?? [] } : null,
        uf: evaluation.ok ? evaluation.context.uf : null,
        closingGaps: concluded ? closing.gaps : [],
        petitions
      })
      .catch(async (error: unknown) => {
        await this.removeUploads(petitions);
        throw error;
      });
    if (!created) {
      await this.removeUploads(petitions);
      throw new ValidationToolError('run_closed', 'Esta execucao ja foi encerrada; nada foi gravado.');
    }

    await this.activities.createSystemEvent(
      context.databaseRef,
      context.clientId,
      run.cardId,
      context.identityId,
      'card.initial_petitions_registered',
      { petitionRunId: created.id, status: input.status, petitionCount: petitions.length, completed: created.completedEvent },
      `initial-petitions:${created.id}`
    );
    await this.audit.record('kanban_initial_petitions_registered', mutate, run.boardId, {
      runId: run.id,
      cardId: run.cardId,
      petitionRunId: created.id,
      status: input.status,
      petitionCount: petitions.length,
      completed: created.completedEvent
    });
    return { petitionRunId: created.id, petitionCount: petitions.length, runCompleted: true, automationCompleted: created.completedEvent };
  }

  async latestForCard(context: KanbanRequestContext, boardId: string, cardId: string) {
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    const run = await this.repository.latestForCard(context.databaseRef, context.clientId, cardId);
    return { run: run ? await this.withNames(run) : null };
  }

  async download(context: KanbanRequestContext, boardId: string, cardId: string, documentId: string) {
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    const document = await this.repository.findDocument(context.databaseRef, context.clientId, cardId, documentId);
    if (!document) throw new NotFoundException({ code: 'petition_document_not_found', message: 'Documento nao encontrado.' });
    return this.storage.getSignedDownloadUrl(document.storageKey, { downloadFileName: document.fileName });
  }

  async approve(context: KanbanRequestContext, boardId: string, cardId: string, documentId: string, mutate: MutateContext) {
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    const document = await this.repository.findDocument(context.databaseRef, context.clientId, cardId, documentId);
    if (!document) throw new NotFoundException({ code: 'petition_document_not_found', message: 'Documento nao encontrado.' });
    if (!(await this.repository.approve(context.databaseRef, context.clientId, cardId, documentId, context.identityId))) {
      throw new ConflictException({ code: 'petition_document_not_reviewable', message: 'Este documento nao esta pendente de aprovacao.' });
    }
    await this.pdfQueue.enqueue({ databaseRef: context.databaseRef, clientId: context.clientId, documentId });
    await this.activities.createSystemEvent(
      context.databaseRef,
      context.clientId,
      cardId,
      context.identityId,
      'card.initial_petition_approved',
      { documentId, version: document.version },
      `initial-petition-approved:${documentId}`
    );
    await this.audit.record('kanban_initial_petition_approved', mutate, boardId, { cardId, documentId, version: document.version });
    return this.latestForCard(context, boardId, cardId);
  }

  /**
   * Versao corrigida (S8; ADR 020, emenda de 2026-10-29, decisoes 20 e 21): o `.docx` passa pela
   * conferencia da versao editada, entra pendente de aprovacao e substitui a versao atual. Peticao com
   * protocolo ou versao que ja nao e a atual respondem 409.
   */
  async uploadCorrected(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    baseDocumentId: string,
    file: UploadedFile | undefined,
    mutate: MutateContext
  ) {
    await this.visibility.requireVisibleCard(context, boardId, cardId);
    const allowed = assertEditedDocumentFileAllowed(file);
    const base = await this.repository.findDocument(context.databaseRef, context.clientId, cardId, baseDocumentId);
    if (!base) throw new NotFoundException({ code: 'petition_document_not_found', message: 'Documento nao encontrado.' });
    const inspected = await this.runner.inspectEdited(allowed.buffer);
    if (!inspected.ok) {
      this.logger.warn(`corrected_petition_rejected client=${context.clientId} card=${cardId} code=${inspected.code}`);
      throw new HttpException({ code: inspected.code, message: inspected.message, ...inspected.details }, inspected.status);
    }
    const documentId = randomUUID();
    const storageKey = this.storage.buildGeneratedDocumentKey({ clientId: context.clientId, cardId, documentId, format: 'docx' });
    await this.storage.upload(storageKey, allowed.buffer, DOCX_CONTENT_TYPE);
    const result = await this.repository
      .insertCorrected(context.databaseRef, context.clientId, {
        documentId,
        cardId,
        baseDocumentId,
        storageBucket: this.storage.bucketName,
        storageKey,
        sha256: inspected.sha256,
        sizeBytes: allowed.size,
        identityId: context.identityId
      })
      .catch(async (error: unknown) => {
        await this.storage.deleteQuietly(storageKey);
        throw error;
      });
    if (!result.ok) {
      await this.storage.deleteQuietly(storageKey);
      if (result.reason === 'not_found') throw new NotFoundException({ code: 'petition_document_not_found', message: 'Documento nao encontrado.' });
      throw new ConflictException(
        result.reason === 'protocoled'
          ? { code: 'petition_protocoled', message: 'A peticao ja tem protocolo; a versao corrigida nao e mais aceita.' }
          : { code: 'petition_document_not_current', message: 'Esta versao ja foi substituida; envie a correcao sobre a versao atual.' }
      );
    }
    await this.activities.createSystemEvent(
      context.databaseRef,
      context.clientId,
      cardId,
      context.identityId,
      'card.initial_petition_corrected',
      { documentId, replacedDocumentId: baseDocumentId, version: result.version, replacedStatus: result.replacedStatus },
      `initial-petition-corrected:${documentId}`
    );
    await this.audit.record('kanban_initial_petition_corrected', mutate, boardId, {
      cardId,
      petitionId: result.petitionId,
      documentId,
      replacedDocumentId: baseDocumentId,
      version: result.version,
      sha256: inspected.sha256,
      warningCodes: inspected.warnings.map((warning) => warning.code)
    });
    return { ...(await this.latestForCard(context, boardId, cardId)), documentId, warnings: inspected.warnings };
  }

  private async requireRun(context: KanbanRequestContext, runId: string): Promise<DispatchedRun> {
    const run = await this.outbox.findDispatchedForOwner(context.databaseRef, context.clientId, runId, context.identityId);
    if (!run) throw new ValidationToolError('not_found', 'Execucao de automacao nao encontrada, ja encerrada ou de outro usuario.');
    await this.outbox.touchDispatched(context.databaseRef, context.clientId, run.id);
    if (expectedResultOf(run.actionConfig) !== 'initial_petitions') {
      throw new ValidationToolError('wrong_expected_result', 'Esta automacao nao espera peticoes iniciais; nada foi gravado.');
    }
    await this.visibility.requireVisibleCard(context, run.boardId, run.cardId);
    return run;
  }

  private async build(context: KanbanRequestContext, runId: string, content: PetitionContent, closing: readonly PetitionClosingLine[] = []) {
    const ids = content.body.flatMap((block) => (block.type === 'figure' ? [block.figureId] : []));
    const rows = await this.repository.figures(context.databaseRef, context.clientId, runId, ids);
    const figures = new Map<string, PetitionFigure>(rows.map((row) => [row.figureId, { png: row.png, width: row.width, height: row.height }]));
    return buildPetitionDocx(content, figures, closing);
  }

  /** Monta e sobe cada .docx antes da transacao; falha remove o que ja subiu. */
  private async uploadAll(
    context: KanbanRequestContext,
    run: DispatchedRun,
    drafts: Awaited<ReturnType<InitialPetitionsRepository['drafts']>>,
    closing: readonly PetitionClosingLine[]
  ) {
    const uploaded: ClosingPetition[] = [];
    try {
      for (const draft of drafts) {
        const built = await this.build(context, run.id, draft.content, closing);
        const documentId = randomUUID();
        const storageKey = this.storage.buildGeneratedDocumentKey({ clientId: context.clientId, cardId: run.cardId, documentId, format: 'docx' });
        await this.storage.upload(storageKey, built.file, DOCX_CONTENT_TYPE);
        uploaded.push({
          petitionId: randomUUID(),
          documentId,
          petitionKey: draft.petitionKey,
          court: draft.court,
          bank: draft.bank,
          fileName: built.fileName,
          actionIds: draft.actionIds,
          content: draft.content,
          storageBucket: this.storage.bucketName,
          storageKey,
          sha256: built.sha256,
          sizeBytes: built.file.length
        });
      }
      return uploaded;
    } catch (error) {
      await this.removeUploads(uploaded);
      throw error;
    }
  }

  private async removeUploads(petitions: ClosingPetition[]) {
    for (const petition of petitions) await this.storage.deleteQuietly(petition.storageKey);
  }

  private async withNames(run: PetitionRunRow) {
    const ids = [...new Set(run.petitions.map((p) => p.document?.approvedByIdentityId).filter((id): id is string => Boolean(id)))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const result = await this.database.queryIdentity<{ id: string; displayName: string | null }>(
        `SELECT id, display_name AS "displayName" FROM identities WHERE id = ANY($1::uuid[])`,
        [ids]
      );
      for (const row of result.rows) if (row.displayName) names.set(row.id, row.displayName);
    }
    return {
      ...run,
      petitions: run.petitions.map((petition) => ({
        ...petition,
        document: petition.document
          ? {
              documentId: petition.document.documentId,
              version: petition.document.version,
              origin: petition.document.origin,
              status: petition.document.status,
              approvedAt: petition.document.approvedAt,
              approvedByName: petition.document.approvedByIdentityId ? names.get(petition.document.approvedByIdentityId) ?? null : null,
              pdfStatus: petition.document.pdfStatus,
              sizeBytes: petition.document.sizeBytes
            }
          : null
      }))
    };
  }
}
