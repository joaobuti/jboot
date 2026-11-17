import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service';

export const DRIVE_SYNC_QUEUE = 'kanban-drive-sync';
export const DRIVE_SYNC_JOB = 'sync-document';
export const DRIVE_SWEEP_JOB = 'sweep-document-syncs';

export interface DriveSyncPayload {
  databaseRef: string;
  clientId: string;
  syncId: string;
}

@Injectable()
export class DocumentSyncQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentSyncQueueService.name);
  private readonly queue: Queue;

  constructor(config: AppConfigService) {
    this.queue = new Queue(DRIVE_SYNC_QUEUE, { connection: { url: config.redisUrl } as never });
  }

  async onModuleInit() {
    try {
      await this.queue.add(DRIVE_SWEEP_JOB, {}, {
        jobId: 'drive-sync-sweep',
        repeat: { every: 120_000 },
        removeOnComplete: true,
        removeOnFail: 100
      });
    } catch (error) {
      this.logger.error(`drive_sync_schedule_failed code=${(error as Error).name}`);
    }
  }

  async enqueue(payload: DriveSyncPayload) {
    try {
      await this.queue.add(DRIVE_SYNC_JOB, payload, {
        jobId: `drive-${payload.syncId}`,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100
      });
    } catch (error) {
      this.logger.error(`drive_sync_enqueue_failed sync=${payload.syncId} code=${(error as Error).name}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
