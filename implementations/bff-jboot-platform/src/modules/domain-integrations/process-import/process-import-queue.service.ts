import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service';

/**
 * Fila da importacao de processos por planilha (docs/product/flow-process-import-sprints.md):
 * `flow-process-import`, worker in-process com concorrencia 1. Um job por lote (`jobId` = lote: dedup
 * nativo). Payload so com ids, sem nome/CPF/numero. Falha do Valkey nao perde o lote: ele fica
 * `pending` no banco e a tela oferece "Retomar".
 */
export const FLOW_PROCESS_IMPORT_QUEUE_NAME = 'flow-process-import';
export const RUN_PROCESS_IMPORT_JOB = 'run-process-import';

export interface RunProcessImportPayload {
  flowDatabaseRef: string;
  clientId: string;
  importId: string;
}

export function processImportJobId(importId: string): string {
  return `import-${importId}`;
}

@Injectable()
export class ProcessImportQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ProcessImportQueueService.name);
  private readonly queue: Queue;

  constructor(private readonly config: AppConfigService) {
    this.queue = new Queue(FLOW_PROCESS_IMPORT_QUEUE_NAME, { connection: { url: this.config.redisUrl } as never });
  }

  /** Nunca lanca: devolve `false` quando o Valkey falhou (o lote segue `pending` e pode ser retomado). */
  async enqueue(payload: RunProcessImportPayload): Promise<boolean> {
    try {
      await this.queue.add(RUN_PROCESS_IMPORT_JOB, payload, {
        jobId: processImportJobId(payload.importId),
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: true
      });
      return true;
    } catch (error) {
      this.logger.error(`process_import_enqueue_failed import=${payload.importId}: ${(error as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
