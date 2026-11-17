import { Injectable, Logger } from '@nestjs/common';
import { ScheduledAutomationRepository } from './scheduled-automation.repository';
import { AiAutomationOutboxRepository } from './ai-automation-outbox.repository';
import { AutomationQueueService } from './automation-queue.service';
import { ActivitiesRepository } from '../activities/activities.repository';
import { InitialPetitionsRepository } from '../initial-petitions/initial-petitions.repository';

@Injectable()
export class AiAutomationSchedulerService {
  private readonly logger = new Logger(AiAutomationSchedulerService.name);
  constructor(
    private readonly tenants: ScheduledAutomationRepository,
    private readonly outbox: AiAutomationOutboxRepository,
    private readonly queue: AutomationQueueService,
    private readonly activities: ActivitiesRepository,
    private readonly petitions: InitialPetitionsRepository,
  ) {}

  async recoverAndEnqueue(): Promise<void> {
    for (const tenant of await this.tenants.listActiveFlowTenants()) {
      try {
        await this.outbox.recoverMissing(tenant.databaseRef, tenant.clientId);
        await this.expireStaleRoutines(tenant.databaseRef, tenant.clientId);
        // Peticoes provisorias e prints de execucao expirada ou encerrada (ADR 020, S5).
        await this.petitions.discardClosedRuns(tenant.databaseRef, tenant.clientId);
        const ids = await this.outbox.listDue(tenant.databaseRef, tenant.clientId);
        await Promise.all(ids.map(id => this.queue.enqueueAiOutbox(tenant.databaseRef, id)));
      } catch (error) {
        this.logger.error(`Failed to recover AI automations for tenant ${tenant.clientId}: ${(error as Error).message}`);
      }
    }
  }

  /** Rotina que expirou deixa o motivo no historico do card (uma vez por execucao). */
  private async expireStaleRoutines(databaseRef: string, clientId: string): Promise<void> {
    for (const run of await this.outbox.expireStaleDispatched(databaseRef, clientId)) {
      await this.activities.createSystemEvent(
        databaseRef,
        clientId,
        run.cardId,
        run.requesterIdentityId,
        'card.automation_run_failed',
        { runId: run.id, reason: run.code },
        `automation-run-failed:${run.id}`,
      );
    }
  }
}
