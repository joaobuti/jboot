import { Injectable, Logger } from '@nestjs/common';
import { EmailAutomationOutboxService } from './email-automation-outbox.service';
import { ScheduledAutomationRepository } from './scheduled-automation.repository';

/**
 * Executado pelo AutomationWorker ao consumir o job `evaluate-scheduled-automations` (repeatable
 * job diario, 06:00 America/Sao_Paulo — ver automation-queue.service.ts). Nao envia e-mail: so
 * avalia due_date_approaching/card_stale por tenant ativo do Flow e grava no outbox (Sprint 13)
 * uma intencao por (regra, card) que bater a condicao naquele dia.
 *
 * Fan-out multi-tenant sequencial, sem paralelismo novo — decisao explicita do gate (volume
 * baixo: 1x/dia, dezenas/centenas de cards por cliente). Ver
 * docs/product/kanban-sprint-9-gate.md, secao "Fan-out multi-tenant".
 */
@Injectable()
export class ScheduledAutomationEvaluatorService {
  private readonly logger = new Logger(ScheduledAutomationEvaluatorService.name);

  constructor(
    private readonly repository: ScheduledAutomationRepository,
    private readonly outbox: EmailAutomationOutboxService
  ) {}

  async evaluateAndEnqueue(): Promise<void> {
    const dispatchDate = todayInTimeZone('America/Sao_Paulo');
    const tenants = await this.repository.listActiveFlowTenants();
    const failedTenants: string[] = [];

    for (const tenant of tenants) {
      try {
        const [dueDateCandidates, staleCandidates] = await Promise.all([
          this.repository.findDueDateApproachingCandidates(tenant.databaseRef, tenant.clientId),
          this.repository.findCardStaleCandidates(tenant.databaseRef, tenant.clientId)
        ]);
        await this.outbox.recordScheduled(
          tenant.databaseRef,
          tenant.clientId,
          dispatchDate,
          [...dueDateCandidates, ...staleCandidates].map((candidate) => ({
            automationRuleId: candidate.ruleId,
            cardId: candidate.cardId,
            boardColumnId: candidate.boardColumnId
          }))
        );
      } catch (error) {
        // Falha num tenant nunca impede a avaliacao dos demais (mesma politica de nao-bloqueio
        // do motor reativo).
        failedTenants.push(tenant.clientId);
        this.logger.error(`Failed to evaluate scheduled automations for tenant client ${tenant.clientId}: ${(error as Error).message}`);
      }
    }

    if (failedTenants.length > 0) {
      // O job diario tem 3 tentativas; a insercao e idempotente por dia, entao repetir os
      // tenants que ja passaram nao duplica envio.
      throw new Error(`scheduled_automations_failed_tenants:${failedTenants.length}`);
    }
  }
}

/** YYYY-MM-DD no fuso informado — dispatch_date usa o dia corrente do job, nao um calculo
 * derivado do dado do card (ver "PE Decision — Idempotencia por dia" no gate da Sprint 9). */
function todayInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return formatter.format(new Date());
}
