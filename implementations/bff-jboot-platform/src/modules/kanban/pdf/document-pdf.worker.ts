import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker as BullWorker } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service';
import {
  CONVERT_DOCUMENT_PDF_JOB,
  ConvertDocumentPdfPayload,
  KANBAN_DOCUMENT_PDF_QUEUE_NAME,
  SWEEP_DOCUMENT_PDF_JOB
} from './document-pdf-queue.service';
import { DocumentPdfService } from './document-pdf.service';

/**
 * Consumidor BullMQ in-process da fila `kanban-document-pdf` (ADR 014,
 * Decisao 2): concorrencia 1 por processo. `convert-document-pdf` converte um
 * documento (falha transitoria lanca `PdfRetryableError` e o BullMQ tenta de
 * novo com backoff); `sweep-document-pdf` e o relay periodico da outbox.
 */
@Injectable()
export class DocumentPdfWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentPdfWorker.name);
  private consumer: BullWorker | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly service: DocumentPdfService
  ) {}

  onModuleInit(): void {
    this.consumer = new BullWorker(KANBAN_DOCUMENT_PDF_QUEUE_NAME, (job: Job) => this.dispatch(job), {
      connection: { url: this.config.redisUrl } as never,
      concurrency: 1
    });
    this.consumer.on('failed', (job, error) => {
      this.logger.warn(`document_pdf_job_failed job=${job?.id ?? '?'} attempt=${job?.attemptsMade ?? '?'} code=${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.close();
  }

  async dispatch(job: Job): Promise<void> {
    if (job.name === CONVERT_DOCUMENT_PDF_JOB) {
      await this.service.process(job.data as ConvertDocumentPdfPayload);
      return;
    }
    if (job.name === SWEEP_DOCUMENT_PDF_JOB) {
      await this.service.sweep();
    }
  }
}
