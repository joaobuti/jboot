import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service';
import {
  DRIVE_SWEEP_JOB,
  DRIVE_SYNC_JOB,
  DRIVE_SYNC_QUEUE,
  DriveSyncPayload
} from './document-sync-queue.service';
import { DocumentSyncService } from './document-sync.service';

@Injectable()
export class DocumentSyncWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker | null = null;
  private readonly logger = new Logger(DocumentSyncWorker.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly service: DocumentSyncService
  ) {}

  onModuleInit() {
    this.worker = new Worker(DRIVE_SYNC_QUEUE, (job: Job) => this.dispatch(job), {
      connection: { url: this.config.redisUrl } as never,
      concurrency: 2
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(`drive_sync_job_failed job=${job?.id ?? '?'} code=${error.name}`);
    });
  }

  async dispatch(job: Job) {
    if (job.name === DRIVE_SYNC_JOB) await this.service.process(job.data as DriveSyncPayload);
    else if (job.name === DRIVE_SWEEP_JOB) await this.service.sweep();
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
