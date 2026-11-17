import { Injectable, Logger } from '@nestjs/common';
import { AutomationQueueService } from './automation-queue.service';
import { DispatchLogRepository, ScheduledIntent } from './dispatch-log.repository';

/**
 * Ponto unico de entrada das automacoes de e-mail (Sprint 13). Grava a intencao
 * no outbox e publica o id. Nunca lanca: falha aqui nao reverte a movimentacao
 * do card; o evento ja gravado e recuperado pela varredura de 1 minuto.
 */
@Injectable()
export class EmailAutomationOutboxService {
  private readonly logger = new Logger(EmailAutomationOutboxService.name);

  constructor(
    private readonly dispatchLog: DispatchLogRepository,
    private readonly queue: AutomationQueueService
  ) {}

  async recordForActivity(databaseRef: string, clientId: string, activityId: string): Promise<void> {
    try {
      const ids = await this.dispatchLog.recordForActivity(databaseRef, clientId, activityId);
      await Promise.all(ids.map((id) => this.queue.enqueueEmailDispatch(databaseRef, id)));
    } catch (error) {
      this.logger.error(`Failed to record e-mail automations for activity ${activityId}: ${(error as Error).message}`);
    }
  }

  /** Agendados: lanca para a avaliacao diaria repetir (insercao idempotente por dia). */
  async recordScheduled(databaseRef: string, clientId: string, dispatchDate: string, intents: ScheduledIntent[]): Promise<void> {
    const ids = await this.dispatchLog.recordScheduled(databaseRef, clientId, dispatchDate, intents);
    await Promise.all(ids.map((id) => this.queue.enqueueEmailDispatch(databaseRef, id)));
  }
}
