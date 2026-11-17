import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnprocessableEntityException
} from '@nestjs/common';
import { CustomerJuridicoService } from '../../establishment-customers/customer-juridico.service';
import { CustomersService } from '../../establishment-customers/customers.service';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { CardCustomersRepository } from '../customers/card-customers.repository';
import { buildChecklist } from '../documents/card-documents.service';
import { CardDocumentsRepository } from '../documents/card-documents.repository';
import { DocumentTypesRepository } from '../documents/document-types.repository';
import { KanbanRequestContext, MutateContext, PageResult } from '../kanban.types';
import { MembersRepository } from '../members/members.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { BoardAccessService } from '../shared/board-access.service';
import { FLOW_ADMIN_SCOPE } from '../shared/card-visibility';
import { CardVisibilityService, VisibleCard } from '../shared/card-visibility.service';
import { FlowAdminDirectory } from '../shared/flow-admin-directory.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import {
  CardLeadResponse,
  LeadIncompleteError,
  LeadPendingDocument,
  LeadQueueItemResponse,
  LeadReadiness,
  LeadSubmissionResponse,
  ListLeadQueueQueryDto,
  ReturnLeadDto
} from './dto/lead.dto';
import { changedLeadFields, flattenLeadCustomer, leadSnapshotHash, missingLeadFields } from './lead-fields';
import { LeadSettingsRepository } from './lead-settings.repository';
import { isLeadEditable, LeadStatus, nextLeadStatus } from './lead-state';
import { LeadSubmissionRow, LeadsRepository, SubmissionDocumentSnapshot } from './leads.repository';

export const LEAD_ADMIN_REQUIRED = {
  code: 'lead_admin_required',
  message: 'Only a Flow tenant admin (flow:admin) can manage the lead queue'
} as const;

export const LEAD_INTAKE_DISABLED = {
  code: 'lead_intake_disabled',
  message: 'Lead intake is not enabled on this board'
} as const;

interface ReadinessCheck {
  readiness: LeadReadiness;
  customerId: string | null;
  flatCustomer: Record<string, unknown> | null;
  requiredFields: string[];
  documentsSnapshot: SubmissionDocumentSnapshot[];
}

/**
 * Envio do lead, devolucao, estado e fila do gestor (CRM de leads, Sprint 4;
 * ADR 014, Decisao 3). Regras:
 * - toda rota de card passa por `requireVisibleCard` (invisivel = 404);
 * - envio (R1, P13, P16): captacao ligada no quadro (PE1), mesma regra das
 *   mutacoes de card (papel + coluna editavel), cliente vinculado, campos
 *   obrigatorios do tenant preenchidos e todo documento obrigatorio ativo com
 *   envio mais recente `enviado` ou `aceito` (aceite nao e exigido);
 * - devolucao e fila: somente `flow:admin`; devolucao exige motivo;
 * - evento, auditoria e notificacao so com ids, estado e o motivo digitado;
 *   cadastro e CPF nunca saem do snapshot no banco do tenant.
 */
@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly leads: LeadsRepository,
    private readonly settings: LeadSettingsRepository,
    private readonly visibility: CardVisibilityService,
    private readonly access: BoardAccessService,
    private readonly cardCustomers: CardCustomersRepository,
    private readonly customers: CustomersService,
    private readonly juridico: CustomerJuridicoService,
    private readonly documentTypes: DocumentTypesRepository,
    private readonly cardDocuments: CardDocumentsRepository,
    private readonly assignees: AssigneesRepository,
    private readonly members: MembersRepository,
    private readonly notifications: NotificationsService,
    private readonly admins: FlowAdminDirectory,
    private readonly audit: KanbanAuditService
  ) {}

  /** Estado do lead no card: qualquer leitor do card visivel (P11: o escritorio ve estado e motivo da devolucao). */
  async getLead(context: KanbanRequestContext, boardId: string, cardId: string): Promise<CardLeadResponse> {
    const board = await this.access.requireBoard(context, boardId);
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    return this.buildResponse(context, boardId, card, board.leadIntakeEnabled === true);
  }

  async submit(context: KanbanRequestContext, boardId: string, cardId: string, mutate: MutateContext): Promise<CardLeadResponse> {
    const board = await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    await this.access.requireColumnEditable(context, boardId, card.boardColumnId);
    if (board.leadIntakeEnabled !== true) {
      throw new UnprocessableEntityException(LEAD_INTAKE_DISABLED);
    }
    const status = await this.leads.findStatus(context.databaseRef, context.clientId, cardId);
    if (!nextLeadStatus(status, 'submit')) {
      throw notSubmittable(status);
    }
    const check = await this.checkReadiness(context, boardId, cardId);
    if (!check.readiness.complete || !check.customerId || !check.flatCustomer) {
      const { complete: _complete, ...missing } = check.readiness;
      void _complete;
      const body: LeadIncompleteError = {
        code: 'lead_incomplete',
        message: 'Lead is missing required data or documents',
        ...missing
      };
      throw new UnprocessableEntityException(body);
    }

    const result = await this.leads.submit(context.databaseRef, context.clientId, {
      cardId,
      boardId,
      officeId: card.officeId,
      customerId: check.customerId,
      customerSnapshot: check.flatCustomer,
      customerSnapshotSha256: leadSnapshotHash(check.flatCustomer),
      documentsSnapshot: check.documentsSnapshot,
      requiredFields: check.requiredFields,
      identityId: context.identityId
    });
    if (!result.ok) {
      throw notSubmittable(result.currentStatus);
    }
    await this.audit.record('kanban_lead_submitted', mutate, boardId, {
      cardId,
      submissionId: result.submissionId,
      ...(card.officeId ? { officeId: card.officeId } : {})
    });
    await this.notifyAdmins(context, boardId, cardId, result.submissionId);
    return this.buildResponse(context, boardId, card, true);
  }

  async returnToOffice(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    dto: ReturnLeadDto,
    mutate: MutateContext
  ): Promise<CardLeadResponse> {
    requireAdmin(context);
    const board = await this.access.requireBoard(context, boardId);
    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    const reason = dto.reason.trim();
    const result = await this.leads.returnToOffice(context.databaseRef, context.clientId, {
      cardId,
      reason,
      identityId: context.identityId
    });
    if (!result.ok) {
      throw new ConflictException({
        code: 'lead_not_returnable',
        message: 'Only a submitted lead can be returned to the office',
        leadStatus: result.currentStatus
      });
    }
    await this.audit.record('kanban_lead_returned', mutate, boardId, { cardId, submissionId: result.submissionId, reason });
    await this.notifyReturn(context, boardId, card, result.submissionId, reason);
    return this.buildResponse(context, boardId, card, board.leadIntakeEnabled === true);
  }

  /** Fila do gestor (somente `flow:admin`): leads com envio do tenant, so cards visiveis, paginada. */
  async listQueue(context: KanbanRequestContext, query: ListLeadQueueQueryDto): Promise<PageResult<LeadQueueItemResponse>> {
    requireAdmin(context);
    const viewer = await this.visibility.resolveViewer(context);
    const page = await this.leads.listQueue(context.databaseRef, context.clientId, viewer, {
      officeId: query.officeId,
      boardId: query.boardId,
      status: query.status,
      submittedFrom: query.submittedFrom,
      submittedTo: query.submittedTo,
      limit: query.limit,
      offset: query.offset
    });
    const names = await this.displayNames(page.data.map((row) => row.submittedByIdentityId));
    return {
      ...page,
      data: page.data.map((row) => ({
        cardId: row.cardId,
        boardId: row.boardId,
        boardName: row.boardName,
        cardTitle: row.cardTitle,
        officeId: row.officeId,
        officeName: row.officeName,
        status: row.status,
        submissionId: row.submissionId,
        submittedByIdentityId: row.submittedByIdentityId,
        submittedByName: row.submittedByIdentityId ? (names.get(row.submittedByIdentityId) ?? null) : null,
        submittedAt: row.submittedAt,
        returnedAt: row.returnedAt,
        returnReason: row.returnReason
      }))
    };
  }

  private async buildResponse(
    context: KanbanRequestContext,
    boardId: string,
    card: VisibleCard,
    leadIntakeEnabled: boolean
  ): Promise<CardLeadResponse> {
    const [lead, history] = await Promise.all([
      this.leads.findByCard(context.databaseRef, context.clientId, card.id),
      this.leads.listSubmissions(context.databaseRef, context.clientId, card.id)
    ]);
    const editable = isLeadEditable(lead.status);
    const canMutate = editable && leadIntakeEnabled ? await this.canMutateCard(context, boardId, card) : false;
    const readiness = leadIntakeEnabled && editable ? (await this.checkReadiness(context, boardId, card.id)).readiness : null;
    const customerSnapshot =
      !editable && lead.currentSubmission ? await this.compareSnapshot(context, card.id, lead.currentSubmission) : null;
    const names = await this.displayNames(history.flatMap((row) => [row.submittedByIdentityId, row.returnedByIdentityId]));
    const toResponse = (row: LeadSubmissionRow): LeadSubmissionResponse => ({
      id: row.id,
      officeId: row.officeId,
      submittedByIdentityId: row.submittedByIdentityId,
      submittedByName: names.get(row.submittedByIdentityId) ?? null,
      submittedAt: row.submittedAt,
      returnedByIdentityId: row.returnedByIdentityId,
      returnedByName: row.returnedByIdentityId ? (names.get(row.returnedByIdentityId) ?? null) : null,
      returnedAt: row.returnedAt,
      returnReason: row.returnReason
    });
    const current = lead.currentSubmission ? history.find((row) => row.id === lead.currentSubmission?.id) : undefined;
    return {
      cardId: card.id,
      status: lead.status,
      leadIntakeEnabled,
      editable,
      canSubmit: canMutate,
      canReturn: isFlowAdmin(context) && nextLeadStatus(lead.status, 'return') !== null,
      readiness,
      currentSubmission: current ? toResponse(current) : null,
      customerSnapshot,
      history: history.map(toResponse)
    };
  }

  /**
   * O que falta para o envio (R1). Nunca le dado de cliente sem o card visivel
   * (chamado depois de `requireVisibleCard`). Documento obrigatorio conta como
   * presente com envio mais recente `enviado` ou `aceito` (P13).
   */
  private async checkReadiness(context: KanbanRequestContext, boardId: string, cardId: string): Promise<ReadinessCheck> {
    const [link, settings, types, documents] = await Promise.all([
      this.cardCustomers.findByCard(context.databaseRef, context.clientId, cardId),
      this.settings.getRequiredFields(context.databaseRef, context.clientId),
      this.documentTypes.list(context.databaseRef, context.clientId, boardId),
      this.cardDocuments.listForCard(context.databaseRef, context.clientId, cardId)
    ]);
    const flatCustomer = link ? await this.loadFlatCustomer(context.clientId, link.customerId) : null;
    const missingFields = flatCustomer ? missingLeadFields(flatCustomer, settings.requiredFields) : [];
    const required = buildChecklist(types, documents).items.filter((item) => item.active && item.required);
    const pendingDocumentTypes: LeadPendingDocument[] = required
      .filter((item) => item.state !== 'enviado' && item.state !== 'aceito')
      .map((item) => ({ id: item.documentTypeId, name: item.name, state: item.state === 'rejeitado' ? 'rejeitado' : 'pendente' }));
    const customerLinked = flatCustomer !== null;
    return {
      readiness: {
        complete: customerLinked && missingFields.length === 0 && pendingDocumentTypes.length === 0,
        customerLinked,
        missingFields,
        pendingDocumentTypes
      },
      customerId: customerLinked && link ? link.customerId : null,
      flatCustomer,
      requiredFields: settings.requiredFields,
      documentsSnapshot: required
        .filter((item) => item.current)
        .map((item) => ({
          documentTypeId: item.documentTypeId,
          documentId: item.current?.id as string,
          status: item.current?.status as string
        }))
    };
  }

  private async loadFlatCustomer(clientId: string, customerId: string): Promise<Record<string, unknown> | null> {
    const [core, juridico] = await Promise.all([
      this.customers.findById(clientId, customerId),
      this.juridico.get(clientId, customerId)
    ]);
    if (!core) {
      return null;
    }
    return flattenLeadCustomer({
      core: core as unknown as Record<string, unknown>,
      juridico: juridico as unknown as Record<string, unknown> | null
    });
  }

  /** Cadastro compartilhado (ADR 014, Decisao 6): marca "desatualizado" se o cliente mudou depois do envio. */
  private async compareSnapshot(
    context: KanbanRequestContext,
    cardId: string,
    submission: { customerId: string; customerSnapshot: Record<string, unknown> }
  ): Promise<{ outdated: boolean; changedFields: string[]; customerChanged: boolean }> {
    const link = await this.cardCustomers.findByCard(context.databaseRef, context.clientId, cardId);
    if (!link || link.customerId !== submission.customerId) {
      return { outdated: true, changedFields: [], customerChanged: true };
    }
    const current = await this.loadFlatCustomer(context.clientId, link.customerId);
    if (!current) {
      return { outdated: true, changedFields: [], customerChanged: true };
    }
    const outdated = leadSnapshotHash(current) !== leadSnapshotHash(submission.customerSnapshot);
    return {
      outdated,
      changedFields: outdated ? changedLeadFields(submission.customerSnapshot, current) : [],
      customerChanged: false
    };
  }

  /** Mesma regra das mutacoes de card (`flow:write`, admin/member, coluna editavel). */
  private async canMutateCard(context: KanbanRequestContext, boardId: string, card: VisibleCard): Promise<boolean> {
    if (!context.scopes.includes('flow:write')) {
      return false;
    }
    try {
      await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
      await this.access.requireColumnEditable(context, boardId, card.boardColumnId);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
  }

  /** Notificacao in-app aos administradores (ADR 014, Decisao 7); `notify` ainda filtra quem ve o card. */
  private async notifyAdmins(context: KanbanRequestContext, boardId: string, cardId: string, submissionId: string): Promise<void> {
    try {
      const adminIds = await this.admins.adminIdentityIds(context.clientId);
      await Promise.all(
        [...adminIds].map((recipientIdentityId) =>
          this.notifications.notify(context, {
            boardId,
            cardId,
            recipientIdentityId,
            actorIdentityId: context.identityId,
            kind: 'card.lead_submitted',
            payload: { submissionId }
          })
        )
      );
    } catch (error) {
      // Efeito colateral: o envio ja foi gravado; so ids no log.
      this.logger.error(`lead_submitted_notification_failed card=${cardId}: ${(error as Error).message}`);
    }
  }

  /** Devolucao: criador, responsaveis e quem enviou, somente os que ainda veem o card (filtro no `notify`). */
  private async notifyReturn(
    context: KanbanRequestContext,
    boardId: string,
    card: VisibleCard,
    submissionId: string,
    reason: string
  ): Promise<void> {
    try {
      const [cardAssignees, lead] = await Promise.all([
        this.assignees.list(context.databaseRef, context.clientId, card.id),
        this.leads.listSubmissions(context.databaseRef, context.clientId, card.id, 1)
      ]);
      const recipients = new Set<string>([
        card.createdByIdentityId,
        ...cardAssignees.map((assignee) => assignee.identityId),
        ...lead.map((row) => row.submittedByIdentityId)
      ]);
      await Promise.all(
        [...recipients].map((recipientIdentityId) =>
          this.notifications.notify(context, {
            boardId,
            cardId: card.id,
            recipientIdentityId,
            actorIdentityId: context.identityId,
            kind: 'card.lead_returned',
            payload: { submissionId, reason }
          })
        )
      );
    } catch (error) {
      this.logger.error(`lead_returned_notification_failed card=${card.id}: ${(error as Error).message}`);
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

function isFlowAdmin(context: KanbanRequestContext): boolean {
  return context.scopes.includes(FLOW_ADMIN_SCOPE);
}

function requireAdmin(context: KanbanRequestContext): void {
  if (!isFlowAdmin(context)) {
    throw new ForbiddenException(LEAD_ADMIN_REQUIRED);
  }
}

function notSubmittable(status: LeadStatus): ConflictException {
  return new ConflictException({
    code: 'lead_not_submittable',
    message: 'Lead was already submitted and waits for the manager',
    leadStatus: status
  });
}
