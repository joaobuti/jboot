import { ForbiddenException, HttpException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MutateContext } from '../../kanban/kanban.types';
import { CustomerMatch, ProcessImportCardsService } from '../../kanban/process-import/process-import-cards.service';
import { ImportRowInput, MAX_IMPORT_ROWS, RowProblem, RowWarning, validateRows } from '../../kanban/process-import/process-import-rows';
import { ProcessImportRepository } from '../../kanban/process-import/process-import.repository';
import { KanbanViewerResolver } from '../../kanban/shared/kanban-viewer-resolver.service';
import { ProcessMonitoringService } from '../../process-monitoring/process-monitoring.service';
import { ProcessMonitoringCaller } from '../../process-monitoring/process-monitoring.types';
import { formatCnj } from '../../shared/documents/cnj';
import { DomainApplicationContextService } from '../application-context.service';
import { DomainIntegrationRequestContext, ResolvedApplicationContext } from '../domain-integration.types';
import { ProcessImportQueueService, RunProcessImportPayload } from './process-import-queue.service';

export type PreviewStatus = 'ready' | 'invalid' | 'existing';

export interface PreviewRow {
  line: number;
  status: PreviewStatus;
  processNumber: string | null;
  tribunal: string | null;
  problems: RowProblem[];
  warnings: Array<RowWarning | 'customer_name_differs' | 'monitored_in_juridico'>;
  customer: CustomerMatch['kind'] | null;
  existingCardUrl: string | null;
}

/**
 * Importacao de processos em andamento por planilha (docs/product/flow-process-import-sprints.md):
 * conferencia sem gravar, lote em fila e, por linha, cliente/card (Kanban) + acompanhamento DataJud diario
 * na capacidade `monitoramento-processual` com destino no card (ADR 021, sem Juridico). Mesma regra da
 * acao Monitorar: um card por numero CNJ no tenant.
 */
@Injectable()
export class ProcessImportService {
  private readonly logger = new Logger(ProcessImportService.name);

  constructor(
    private readonly contexts: DomainApplicationContextService,
    private readonly cards: ProcessImportCardsService,
    private readonly lots: ProcessImportRepository,
    private readonly monitors: ProcessMonitoringService,
    private readonly viewers: KanbanViewerResolver,
    private readonly queue: ProcessImportQueueService
  ) {}

  async options(caller: DomainIntegrationRequestContext) {
    const flow = await this.flow(caller);
    const monitoringEnabled = await this.monitors.isEnabled(this.monitoringCaller(caller.clientId, caller.identityId));
    return { ...(await this.cards.options(flow)), monitoringEnabled, maxRows: MAX_IMPORT_ROWS };
  }

  async preview(caller: DomainIntegrationRequestContext, boardId: string, officeId: string, rows: ImportRowInput[]): Promise<{ rows: PreviewRow[] }> {
    const flow = await this.flow(caller);
    await this.requireMonitoring(caller);
    await this.cards.authorize(flow, boardId, officeId);
    return { rows: await this.classify(flow, rows) };
  }

  async create(
    caller: DomainIntegrationRequestContext,
    boardId: string,
    officeId: string,
    rows: ImportRowInput[],
    requestInfo: Pick<MutateContext, 'ip' | 'userAgent'>
  ): Promise<{ importId: string; queued: boolean; totalRows: number }> {
    const flow = await this.flow(caller);
    await this.requireMonitoring(caller);
    await this.cards.authorize(flow, boardId, officeId);
    // Revalida no servidor: so linhas prontas entram no lote, nunca o que o navegador marcou.
    const classified = await this.classify(flow, rows);
    const validated = new Map(validateRows(rows).map((row) => [row.line, row]));
    const ready = classified.filter((row) => row.status === 'ready').map((row) => validated.get(row.line)!);
    if (ready.length === 0) {
      throw new UnprocessableEntityException({ code: 'process_import_nothing_to_import', message: 'Nenhuma linha pronta para importar.' });
    }
    const importId = await this.cards.createLot(flow, { ...flow, ...requestInfo }, boardId, officeId, ready.map((row) => ({
      line: row.line,
      processNumber: row.processNumber!,
      tribunal: row.tribunal!,
      customerName: row.name!,
      customerCpf: row.cpf!,
      situation: row.situation
    })));
    const queued = await this.queue.enqueue({ flowDatabaseRef: flow.databaseRef, clientId: caller.clientId, importId });
    return { importId, queued, totalRows: ready.length };
  }

  async status(caller: DomainIntegrationRequestContext, importId: string) {
    const flow = await this.flow(caller);
    const lot = await this.requireOwnLot(flow, importId);
    const rows = await this.lots.listRows(flow.databaseRef, caller.clientId, importId);
    return {
      ...lot,
      rows: rows.map((row) => ({
        line: row.line,
        processNumber: formatCnj(row.processNumber),
        status: row.status,
        cardUrl: row.cardId ? `/flow/boards/${lot.boardId}?card=${row.cardId}` : null,
        existingCardUrl: row.existingCardId && row.existingBoardId ? `/flow/boards/${row.existingBoardId}?card=${row.existingCardId}` : null,
        skippedAssignees: row.skippedAssignees,
        errorCode: row.errorCode
      }))
    };
  }

  async resume(caller: DomainIntegrationRequestContext, importId: string): Promise<{ queued: boolean }> {
    const flow = await this.flow(caller);
    const lot = await this.requireOwnLot(flow, importId);
    if (lot.status === 'completed') return { queued: false };
    return { queued: await this.queue.enqueue({ flowDatabaseRef: flow.databaseRef, clientId: caller.clientId, importId }) };
  }

  /**
   * Job da fila. Reautoriza pelo usuario que importou (entitlement pode ter mudado), processa as linhas
   * pendentes e as que falharam, uma a uma, e encerra o lote apagando nome/CPF/situacao.
   */
  async processLot(payload: RunProcessImportPayload): Promise<void> {
    const lot = await this.lots.findLot(payload.flowDatabaseRef, payload.clientId, payload.importId);
    if (!lot || lot.status === 'completed') return;
    const who = { identityId: lot.createdByIdentityId, clientId: payload.clientId };
    let flow: ResolvedApplicationContext;
    try {
      flow = await this.contexts.requireApplication(who, 'flow', ['flow:read', 'flow:write']);
      if (flow.databaseRef !== payload.flowDatabaseRef) throw new ForbiddenException();
      await this.requireMonitoring(who);
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
      await this.lots.finish(payload.flowDatabaseRef, payload.clientId, lot.id, 'entitlement_revoked');
      return;
    }
    if (!(await this.lots.start(flow.databaseRef, payload.clientId, lot.id))) return;
    const mutate: MutateContext = { ...flow };
    const rows = await this.lots.listRows(flow.databaseRef, payload.clientId, lot.id);
    for (const row of rows) {
      if (row.status === 'created' || row.status === 'existing') continue;
      try {
        const monitoring = this.monitoringCaller(payload.clientId, lot.createdByIdentityId);
        // Processo ja acompanhado (outro card ou Juridico): nao cria card orfao.
        const live = await this.monitors.findLiveByProcess(monitoring, row.processNumber);
        const liveCard = live?.destinationRef && 'cardId' in live.destinationRef ? live.destinationRef : null;
        if (live && liveCard?.cardId !== row.cardId) {
          if (liveCard) {
            await this.lots.markRow(flow.databaseRef, payload.clientId, row.id, { status: 'existing', existingCardId: liveCard.cardId, existingBoardId: liveCard.boardId });
          } else {
            await this.lots.markRow(flow.databaseRef, payload.clientId, row.id, { status: 'failed', errorCode: 'process_monitor_in_use' });
          }
          continue;
        }
        const outcome = await this.cards.processRow(flow, mutate, lot, row);
        if (outcome.status === 'existing') continue;
        await this.monitors.ensureActive(monitoring, {
          processNumber: row.processNumber,
          tribunal: row.tribunal,
          cadence: 'daily',
          destinationRef: { databaseRef: flow.databaseRef, boardId: lot.boardId, cardId: outcome.cardId }
        });
        await this.lots.markRow(flow.databaseRef, payload.clientId, row.id, { status: 'created' });
      } catch (error) {
        const code = this.errorCode(error);
        this.logger.warn(JSON.stringify({ event: 'process_import_row_failed', importId: lot.id, line: row.line, code }));
        await this.lots.markRow(flow.databaseRef, payload.clientId, row.id, { status: 'failed', errorCode: code });
      }
    }
    await this.lots.finish(flow.databaseRef, payload.clientId, lot.id);
  }

  private async classify(flow: ResolvedApplicationContext, rows: ImportRowInput[]): Promise<PreviewRow[]> {
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new UnprocessableEntityException({ code: 'process_import_too_many_rows', message: `Limite de ${MAX_IMPORT_ROWS} linhas por planilha.` });
    }
    const validated = validateRows(rows);
    const numbers = [...new Set(validated.map((row) => row.processNumber).filter((value): value is string => Boolean(value)))];
    const monitoring = this.monitoringCaller(flow.clientId, flow.identityId);
    const [owners, customers, liveEntries] = await Promise.all([
      this.cards.owners(flow, numbers),
      this.cards.matchCustomers(flow, validated.filter((row) => row.problems.length === 0)),
      Promise.all(numbers.map(async (number) => [number, await this.monitors.findLiveByProcess(monitoring, number)] as const))
    ]);
    const live = new Map(liveEntries);
    return validated.map((row): PreviewRow => {
      const monitor = row.processNumber ? live.get(row.processNumber) ?? null : null;
      const monitorCard = monitor?.destinationRef && 'cardId' in monitor.destinationRef ? monitor.destinationRef : null;
      const owner = row.processNumber ? owners.get(row.processNumber) ?? (monitorCard ?? undefined) : undefined;
      const customer = customers.get(row.line) ?? null;
      const warnings: PreviewRow['warnings'] = [...row.warnings];
      if (customer?.kind === 'existing' && customer.nameDiffers) warnings.push('customer_name_differs');
      // Acompanhado no Juridico, sem card no Flow: nao importa para nao duplicar o acompanhamento.
      const elsewhere = Boolean(monitor) && !owner;
      if (elsewhere) warnings.push('monitored_in_juridico');
      return {
        line: row.line,
        status: row.problems.length > 0 ? 'invalid' : owner || elsewhere ? 'existing' : 'ready',
        processNumber: row.processNumber ? formatCnj(row.processNumber) : null,
        tribunal: row.tribunal,
        problems: row.problems,
        warnings,
        customer: customer?.kind ?? null,
        existingCardUrl: owner ? `/flow/boards/${owner.boardId}?card=${owner.cardId}` : null
      };
    });
  }

  private async requireOwnLot(flow: ResolvedApplicationContext, importId: string) {
    const lot = await this.lots.findLot(flow.databaseRef, flow.clientId, importId);
    const viewer = await this.viewers.resolve(flow);
    if (!lot || (lot.createdByIdentityId !== flow.identityId && !viewer.isAdmin)) throw new NotFoundException('Import not found');
    return lot;
  }

  private flow(caller: DomainIntegrationRequestContext) {
    return this.contexts.requireCaller(caller, 'flow', ['flow:read', 'flow:write']);
  }

  private async requireMonitoring(who: { clientId: string; identityId: string }): Promise<void> {
    if (!(await this.monitors.isEnabled(this.monitoringCaller(who.clientId, who.identityId)))) {
      throw new ForbiddenException({ code: 'process_monitoring_not_contracted', message: 'Monitoramento processual nao contratado para este cliente.' });
    }
  }

  private monitoringCaller(clientId: string, identityId: string): ProcessMonitoringCaller {
    return { clientId, identityId, product: 'flow' };
  }

  private errorCode(error: unknown): string {
    if (error instanceof HttpException) {
      const body = error.getResponse();
      if (typeof body === 'object' && body && 'code' in body && typeof (body as { code: unknown }).code === 'string') {
        return String((body as { code: string }).code).slice(0, 60);
      }
      return `http_${error.getStatus()}`;
    }
    return 'unexpected';
  }
}
