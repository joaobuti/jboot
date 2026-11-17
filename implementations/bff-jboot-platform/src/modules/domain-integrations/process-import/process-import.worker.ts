import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker as BullWorker } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service';
import { FLOW_PROCESS_IMPORT_QUEUE_NAME, RUN_PROCESS_IMPORT_JOB, RunProcessImportPayload } from './process-import-queue.service';
import { ProcessImportService } from './process-import.service';

/** Consumidor in-process da fila `flow-process-import`, concorrencia 1 (linhas em serie). */
@Injectable()
export class ProcessImportWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessImportWorker.name);
  private consumer: BullWorker | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly service: ProcessImportService
  ) {}

  onModuleInit(): void {
    this.consumer = new BullWorker(FLOW_PROCESS_IMPORT_QUEUE_NAME, (job: Job) => this.dispatch(job), {
      connection: { url: this.config.redisUrl } as never,
      concurrency: 1
    });
    this.consumer.on('failed', (job, error) => {
      this.logger.warn(`process_import_job_failed job=${job?.id ?? '?'} attempt=${job?.attemptsMade ?? '?'} code=${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.close();
  }

  async dispatch(job: Job): Promise<void> {
    if (job.name === RUN_PROCESS_IMPORT_JOB) await this.service.processLot(job.data as RunProcessImportPayload);
  }
}
