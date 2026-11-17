import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { KanbanRequestContext, MutateContext } from '../kanban.types';
import { BoardAccessService } from '../shared/board-access.service';
import { CardVisibilityService } from '../shared/card-visibility.service';
import { KanbanAuditService } from '../shared/kanban-audit.service';
import { KanbanViewerResolver } from '../shared/kanban-viewer-resolver.service';
import { AutomationQueueService } from './automation-queue.service';
import { AutomationDispatchStatus, DispatchLogRepository, EMAIL_DISPATCH_MAX_ATTEMPTS } from './dispatch-log.repository';
import { EmailDispatchListDto, EmailDispatchListFilter, EmailDispatchRetryResponseDto } from './dto/email-dispatch.dto';

const FILTER_STATUSES: Record<EmailDispatchListFilter | 'all', AutomationDispatchStatus[]> = {
  failed: ['failed'],
  pending: ['pending', 'processing'],
  all: ['failed', 'pending', 'processing']
};

/**
 * Tela de envios das automacoes de e-mail (Sprint 13), `flow:admin`. Lista so
 * linhas de cards visiveis; o resumo e o backlog do tenant (so contagens).
 * Reprocessar exige ver o card e ser `board_admin` do quadro, como o CRUD de regra.
 */
@Injectable()
export class EmailDispatchesService {
  constructor(
    private readonly dispatchLog: DispatchLogRepository,
    private readonly viewers: KanbanViewerResolver,
    private readonly visibility: CardVisibilityService,
    private readonly access: BoardAccessService,
    private readonly queue: AutomationQueueService,
    private readonly audit: KanbanAuditService
  ) {}

  async list(context: KanbanRequestContext, filter?: EmailDispatchListFilter): Promise<EmailDispatchListDto> {
    const viewer = await this.viewers.resolve(context);
    const [items, summary] = await Promise.all([
      this.dispatchLog.listForAdmin(context.databaseRef, context.clientId, viewer, FILTER_STATUSES[filter ?? 'all']),
      this.dispatchLog.backlog(context.databaseRef, context.clientId)
    ]);
    return { summary, items, maxAttempts: EMAIL_DISPATCH_MAX_ATTEMPTS };
  }

  async retry(context: KanbanRequestContext, mutate: MutateContext, dispatchId: string): Promise<EmailDispatchRetryResponseDto> {
    const target = await this.dispatchLog.findTarget(context.databaseRef, context.clientId, dispatchId);
    if (!target) {
      throw new NotFoundException({ code: 'automation_dispatch_not_found', message: 'Automation dispatch not found' });
    }
    // Card fora do alcance responde 404, igual a rota por card.
    await this.visibility.requireVisibleCard(context, target.boardId, target.cardId);
    await this.access.requireRole(context, target.boardId, ['board_admin']);
    if (target.status !== 'failed' || !(await this.dispatchLog.requeueFailed(context.databaseRef, context.clientId, dispatchId))) {
      throw new ConflictException({ code: 'automation_dispatch_not_failed', message: 'Only failed dispatches can be retried' });
    }
    await this.audit.record('kanban_automation_dispatch_retried', mutate, target.boardId, {
      dispatchId,
      cardId: target.cardId
    });
    await this.queue.enqueueEmailDispatch(context.databaseRef, dispatchId);
    return { id: dispatchId, status: 'pending' };
  }
}
