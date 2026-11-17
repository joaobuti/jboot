import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import { DispatchBacklog } from './dispatch-log.repository';

export type EmailDispatchOutcome = 'sent' | 'skipped' | 'retry_scheduled' | 'failed';

/**
 * Sinais do outbox de e-mail (Sprint 13) para alerta, exportados pelo SDK
 * OpenTelemetry de `tracing.ts` (no-op sem coletor). Sem atributo de tenant,
 * card ou destinatario: so resultado/estado. Alertas sugeridos em
 * docs/runbooks/flow-email-automations.md.
 */
@Injectable()
export class EmailDispatchMetrics {
  private readonly meter = metrics.getMeter('bff-jboot-platform.kanban');
  private readonly dispatches = this.meter.createCounter('kanban.automation.email.dispatches', {
    description: 'Resultado de cada tentativa de envio das automacoes de e-mail'
  });
  private backlog: DispatchBacklog = { pending: 0, processing: 0, failed: 0, oldestPendingAt: null };

  constructor() {
    this.meter
      .createObservableGauge('kanban.automation.email.backlog', {
        description: 'Linhas do outbox de e-mail por estado, na ultima varredura'
      })
      .addCallback((result) => {
        result.observe(this.backlog.pending, { status: 'pending' });
        result.observe(this.backlog.processing, { status: 'processing' });
        result.observe(this.backlog.failed, { status: 'failed' });
      });
    this.meter
      .createObservableGauge('kanban.automation.email.oldest_pending_age', {
        description: 'Idade do envio pendente mais antigo, na ultima varredura',
        unit: 's'
      })
      .addCallback((result) => {
        const oldest = this.backlog.oldestPendingAt ? Date.parse(this.backlog.oldestPendingAt) : NaN;
        result.observe(Number.isNaN(oldest) ? 0 : Math.max(0, Math.round((Date.now() - oldest) / 1000)));
      });
  }

  record(outcome: EmailDispatchOutcome): void {
    this.dispatches.add(1, { outcome });
  }

  setBacklog(backlog: DispatchBacklog): void {
    this.backlog = backlog;
  }
}

/** Soma o backlog dos tenants; o pendente mais antigo e o menor entre eles. */
export function sumBacklog(items: DispatchBacklog[]): DispatchBacklog {
  return items.reduce<DispatchBacklog>(
    (total, item) => ({
      pending: total.pending + item.pending,
      processing: total.processing + item.processing,
      failed: total.failed + item.failed,
      oldestPendingAt:
        !total.oldestPendingAt || (item.oldestPendingAt && Date.parse(item.oldestPendingAt) < Date.parse(total.oldestPendingAt))
          ? item.oldestPendingAt ?? total.oldestPendingAt
          : total.oldestPendingAt
    }),
    { pending: 0, processing: 0, failed: 0, oldestPendingAt: null }
  );
}
