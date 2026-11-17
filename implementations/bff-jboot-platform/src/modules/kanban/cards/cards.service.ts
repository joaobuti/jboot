import { ConflictException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActivitiesRepository } from '../activities/activities.repository';
import { AssigneesRepository } from '../assignees/assignees.repository';
import { EmailAutomationOutboxService } from '../automation/email-automation-outbox.service';
import { ColumnsRepository } from '../columns/columns.repository';
import { CardDocumentsRepository } from '../documents/card-documents.repository';
import { ChecklistGateService } from '../documents/checklist-gate.service';
import { EntryRequirementsService } from '../automation/entry-requirements.service';
import { isChecklistPending } from '../documents/checklist-pending';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { NotificationsService } from '../notifications/notifications.service';
import { StatusesService } from '../statuses/statuses.service';
import { TagsRepository } from '../tags/tags.repository';
import { LeadEditLock } from '../leads/lead-edit-lock.service';
import { LeadsRepository } from '../leads/leads.repository';
import { CardOfficePolicy } from '../offices/card-office.policy';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { CardsRepository, CreateCardFromSourceInput } from './cards.repository';
import { CreateCardDto, ListCardsQueryDto, MoveCardDto, UpdateCardDto } from './dto/card.dto';

export interface MoveCardResult {
  card: Awaited<ReturnType<CardsRepository['move']>>['card'];
  fromBoardColumnId: string;
}

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly repository: CardsRepository,
    private readonly columns: ColumnsRepository,
    private readonly activities: ActivitiesRepository,
    private readonly tags: TagsRepository,
    private readonly statuses: StatusesService,
    private readonly access: BoardAccessService,
    private readonly audit: KanbanAuditService,
    private readonly assignees: AssigneesRepository,
    private readonly emailAutomations: EmailAutomationOutboxService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
    private readonly checklistGate: ChecklistGateService,
    private readonly cardDocuments: CardDocumentsRepository,
    private readonly visibility: CardVisibilityService,
    private readonly officePolicy: CardOfficePolicy,
    private readonly leads: LeadsRepository,
    private readonly leadLock: LeadEditLock,
    private readonly hiscon: EntryRequirementsService
  ) {}

  async list(context: KanbanRequestContext, boardId: string, query: ListCardsQueryDto) {
    await this.access.requireMember(context, boardId);
    // Lista, resumos, tags e completude so dos cards visiveis (escopo unico, Sprint 3.5).
    const viewer = await this.visibility.resolveViewer(context);
    const page = await this.repository.list(context.databaseRef, context.clientId, boardId, query, viewer);
    const summaries = await this.repository.listSummaries(context.databaseRef, context.clientId, boardId, viewer);
    const tagIdsByCard = await this.tags.listTagIdsForBoard(context.databaseRef, context.clientId, boardId, viewer);
    // Completude do checklist (CRM de leads, Sprint 2) agregada por quadro: uma consulta, sem N+1.
    // Sinalizacao `checklistPending` (Sprint 3): completude + flag da coluna, mais uma consulta por quadro.
    // Estado do lead (CRM de leads, Sprint 4) no tile: uma consulta por quadro, so cards visiveis.
    // Selo "SEM HISCON" (docs/product/flow-customer-promobank-sprints.md): uma consulta por quadro.
    const [checklist, columns, leadStatuses, withoutHiscon, signedKitPending] = await Promise.all([
      this.cardDocuments.completenessForBoard(context.databaseRef, context.clientId, boardId, viewer),
      this.columns.list(context.databaseRef, context.clientId, boardId),
      this.leads.statusByCardForBoard(context.databaseRef, context.clientId, boardId, viewer),
      this.hiscon.cardIdsWithoutHisconForBoard(context.databaseRef, context.clientId, boardId, viewer),
      this.hiscon.cardIdsWithSignedKitPendingForBoard(context.databaseRef, context.clientId, boardId, viewer)
    ]);
    const gatedColumnIds = new Set(columns.filter((column) => column.requiresCompleteChecklist).map((column) => column.id));
    return {
      ...page,
      data: page.data.map((card) => {
        const documentChecklist = {
          acceptedRequired: checklist.acceptedRequiredByCard.get(card.id) ?? 0,
          totalRequired: checklist.totalRequired
        };
        return {
          ...card,
          ...(summaries.get(card.id) ?? { assigneeIds: [], commentCount: 0, attachmentCount: 0 }),
          tagIds: tagIdsByCard.get(card.id) ?? [],
          documentChecklist,
          checklistPending: isChecklistPending(gatedColumnIds.has(card.boardColumnId), documentChecklist),
          // `null` = sem envio (rascunho); estado proprio, independente da coluna.
          leadStatus: leadStatuses.get(card.id) ?? null,
          customerWithoutHiscon: withoutHiscon.has(card.id),
          signedKitPending: signedKitPending.has(card.id)
        };
      })
    };
  }

  async setStatus(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    cardStatusId: string | null,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    const existing = await this.visibility.requireVisibleCard(context, boardId, cardId);
    await this.access.requireCanManageStatuses(context, boardId);
    if (cardStatusId) {
      await this.statuses.requireStatus(context, boardId, cardStatusId);
    }

    const card = await this.repository.updateStatus(context.databaseRef, context.clientId, boardId, cardId, cardStatusId);
    await this.audit.record('kanban_card_status_changed', mutate, boardId, { cardId, cardStatusId });
    if (cardStatusId !== existing.cardStatusId) {
      await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, 'card.status_changed', {
        cardStatusId
      });
    }
    return card;
  }

  async create(context: KanbanRequestContext, boardId: string, dto: CreateCardDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    const officeId = await this.officePolicy.resolveForNewCard(context, dto.officeId);
    const column = await this.columns.findById(context.databaseRef, context.clientId, boardId, dto.boardColumnId);
    if (!column || column.status !== 'active') {
      throw new NotFoundException('Board column not found');
    }
    await this.access.requireColumnEditable(context, boardId, dto.boardColumnId);
    await this.checklistGate.assertCanEnterColumn(context, boardId, column, null);
    const card = await this.repository.create(context.databaseRef, context.clientId, boardId, dto, context.identityId, officeId);
    await this.audit.record('kanban_card_created', mutate, boardId, {
      cardId: card.id,
      boardColumnId: card.boardColumnId,
      ...(officeId ? { officeId } : {})
    });
    return card;
  }

  async createInDefaultColumnFromSource(
    context: KanbanRequestContext,
    boardId: string,
    input: Omit<CreateCardFromSourceInput, 'boardColumnId'>,
    mutate: MutateContext
  ) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    // Mesma regra de escritorio da criacao manual (Sprint 3.5); `input.officeId` e o pedido do chamador.
    const officeId = await this.officePolicy.resolveForNewCard(context, input.officeId);
    const column = await this.columns.findDefault(context.databaseRef, context.clientId, boardId);
    if (!column) {
      throw new NotFoundException('Default board column not found');
    }
    await this.access.requireColumnEditable(context, boardId, column.id);
    // Importacao de dominio NAO passa pelo bloqueio de checklist (decisao de
    // 2026-10-11, Sprint 3 do CRM de leads): o card entra na coluna padrao mesmo
    // com `requires_complete_checklist` e fica sinalizado (`checklistPending`).
    // Criar card manualmente na coluna e mover continuam bloqueados (422).
    const result = await this.repository.createFromSource(
      context.databaseRef,
      context.clientId,
      boardId,
      { ...input, boardColumnId: column.id, officeId },
      context.identityId
    );
    if (result.created) {
      await this.audit.record('kanban_card_created_from_source', mutate, boardId, {
        cardId: result.card.id,
        boardColumnId: result.card.boardColumnId,
        sourceModule: input.sourceModule,
        sourceType: input.sourceType,
        sourceId: input.sourceId
      });
    }
    return result;
  }

  async update(context: KanbanRequestContext, boardId: string, cardId: string, dto: UpdateCardDto, mutate: MutateContext) {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);
    const existing = await this.visibility.requireVisibleCard(context, boardId, cardId);
    await this.access.requireColumnEditable(context, boardId, existing.boardColumnId);
    // Lead enviado: dados do card congelados ate a devolucao (P21).
    await this.leadLock.assertEditable(context, cardId);
    const card = await this.repository.update(context.databaseRef, context.clientId, boardId, cardId, dto);
    await this.audit.record('kanban_card_updated', mutate, boardId, { cardId, ...dto });

    if (dto.status === 'archived' && existing.status !== 'archived') {
      await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, 'card.archived');
    }
    if (dto.title !== undefined && dto.title !== existing.title) {
      await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, 'card.title_updated', {
        title: dto.title
      });
    }
    if (dto.description !== undefined && dto.description !== existing.description) {
      await this.activities.createSystemEvent(
        context.databaseRef,
        context.clientId,
        cardId,
        mutate.identityId,
        'card.description_updated',
        { description: dto.description }
      );
    }
    if (dto.dueDate !== undefined && dto.dueDate !== existing.dueDate) {
      await this.activities.createSystemEvent(context.databaseRef, context.clientId, cardId, mutate.identityId, 'card.due_date_changed', {
        dueDate: dto.dueDate
      });
    }

    return card;
  }

  async deletePermanently(context: KanbanRequestContext, boardId: string, cardId: string, mutate: MutateContext): Promise<void> {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);

    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);
    await this.leadLock.assertEditable(context, cardId);
    if (card.status !== 'archived') {
      throw new ConflictException({ code: 'card_not_archived', message: 'Card must be archived before permanent deletion' });
    }
    await this.access.requireCanDeleteArchivedCard(context, boardId, card.createdByIdentityId);

    const deleted = await this.repository.softDelete(context.databaseRef, context.clientId, boardId, cardId);
    if (!deleted) {
      throw new NotFoundException('Card not found');
    }
    await this.audit.record('kanban_card_deleted', mutate, boardId, { cardId });
  }

  async move(
    context: KanbanRequestContext,
    boardId: string,
    cardId: string,
    dto: MoveCardDto,
    mutate: MutateContext,
    automation?: { expectedColumnId: string; depth: number; rootActivityId: string | null;
      commit: NonNullable<Parameters<CardsRepository['move']>[9]>['commit'] }
  ): Promise<MoveCardResult> {
    await this.access.requireBoard(context, boardId);
    await this.access.requireRole(context, boardId, ['board_admin', 'board_member']);

    const card = await this.visibility.requireVisibleCard(context, boardId, cardId);

    if (automation && (card.status !== 'active' || card.boardColumnId !== automation.expectedColumnId)) {
      throw new ConflictException({ code: 'automation_card_changed' });
    }

    const destinationColumn = await this.columns.findById(
      context.databaseRef,
      context.clientId,
      boardId,
      dto.toBoardColumnId
    );
    if (!destinationColumn || destinationColumn.status !== 'active') {
      throw new NotFoundException('Board column not found');
    }

    if (card.boardColumnId !== dto.toBoardColumnId) {
      await this.access.requireTransitionAllowed(context, boardId, card.boardColumnId, dto.toBoardColumnId);
    }
    await this.access.requireColumnEditable(context, boardId, dto.toBoardColumnId);
    // Reordenar dentro da mesma coluna nao e entrada (sem efeito retroativo).
    if (card.boardColumnId !== dto.toBoardColumnId) {
      await this.checklistGate.assertCanEnterColumn(context, boardId, destinationColumn, cardId);
      await this.hiscon.assertCanEnterColumn(context, boardId, destinationColumn.id, cardId);
    }

    if (destinationColumn.wipLimit !== null) {
      const activeCount = await this.repository.countActiveInColumn(
        context.databaseRef,
        context.clientId,
        dto.toBoardColumnId,
        card.boardColumnId === dto.toBoardColumnId ? cardId : undefined
      );
      if (activeCount >= destinationColumn.wipLimit) {
        throw new ConflictException({ code: 'wip_limit_exceeded', message: 'Column WIP limit exceeded' });
      }
    }

    const { card: moved, movedActivityId } = await this.repository.move(
      context.databaseRef,
      context.clientId,
      boardId,
      cardId,
      card.boardColumnId,
      card.position,
      dto.toBoardColumnId,
      dto.toPosition,
      mutate.identityId,
      automation ? { depth: automation.depth, rootActivityId: automation.rootActivityId, commit: automation.commit } : undefined
    );

    await this.audit.record('kanban_card_moved', mutate, boardId, {
      cardId,
      fromBoardColumnId: card.boardColumnId,
      toBoardColumnId: dto.toBoardColumnId,
      toPosition: dto.toPosition
    });

    if (movedActivityId) {
      // column_entered (destino) e column_left (origem) derivam do mesmo evento card.moved.
      await this.emailAutomations.recordForActivity(context.databaseRef, context.clientId, movedActivityId);

      const cardAssignees = await this.assignees.list(context.databaseRef, context.clientId, cardId);
      await Promise.all(
        cardAssignees.map((assignee) =>
          this.notifications.notify(context, {
            boardId,
            cardId,
            recipientIdentityId: assignee.identityId,
            actorIdentityId: mutate.identityId,
            kind: 'card.moved',
            payload: { toBoardColumnName: destinationColumn.name }
          })
        )
      );
    }

    return { card: moved, fromBoardColumnId: card.boardColumnId };
  }
}
