import { Injectable, Logger } from '@nestjs/common';
import { AutomationQueueService } from './automation-queue.service';
import { DispatchBacklog, DispatchLogRepository } from './dispatch-log.repository';
import { EmailDispatchMetrics, sumBacklog } from './email-dispatch-metrics';
import { ScheduledAutomationRepository } from './scheduled-automation.repository';

/**
 * Varredura de 1 minuto do outbox de e-mail (Sprint 13): recria intencao de
 * evento recente que ficou sem linha, republica o que esta vencido (pendente,
 * retentativa no prazo ou processamento parado) e atualiza o backlog medido.
 */
@Injectable()
export class EmailDispatchSchedulerService {
  private readonly logger = new Logger(EmailDispatchSchedulerService.name);

  constructor(
    private readonly tenants: ScheduledAutomationRepository,
    private readonly dispatchLog: DispatchLogRepository,
    private readonly queue: AutomationQueueService,
    private readonly metrics: EmailDispatchMetrics
  ) {}

  async recoverAndEnqueue(): Promise<void> {
    const backlogs: DispatchBacklog[] = [];
    for (const tenant of await this.tenants.listActiveFlowTenants()) {
      try {
        const recovered = await this.dispatchLog.recoverRecent(tenant.databaseRef, tenant.clientId);
        if (recovered > 0) {
          this.logger.warn(`Recovered ${recovered} e-mail automation intent(s) for tenant ${tenant.clientId}`);
        }
        const ids = await this.dispatchLog.listDue(tenant.databaseRef, tenant.clientId);
        await Promise.all(ids.map((id) => this.queue.enqueueEmailDispatch(tenant.databaseRef, id)));
        backlogs.push(await this.dispatchLog.backlog(tenant.databaseRef, tenant.clientId));
      } catch (error) {
        this.logger.error(`Failed to recover e-mail automations for tenant ${tenant.clientId}: ${(error as Error).message}`);
      }
    }
    this.metrics.setBacklog(sumBacklog(backlogs));
  }
}
