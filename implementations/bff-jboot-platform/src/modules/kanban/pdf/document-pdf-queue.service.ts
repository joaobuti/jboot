import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppConfigService } from '../../../config/app-config.service';
import { MAX_PDF_ATTEMPTS } from './document-pdf.repository';

/**
 * Fila do PDF do documento aprovado (CRM de leads, Sprint 6; ADR 014,
 * Decisao 2): `kanban-document-pdf`, worker in-process com concorrencia 1 (o
 * LibreOffice do Gotenberg converte em serie). Excecao de Valkey do modulo
 * (fila de job, nao pub/sub), registrada no MODULE_CONTRACT.
 *
 * Relay em duas vias (outbox): enqueue imediato depois do commit da aprovacao
 * (`jobId` = id do documento: dedup nativo do BullMQ) e varredura periodica
 * (repeatable job) que reenfileira `pending` sem lease vivo. O enqueue nunca
 * lanca: falha do Valkey so atrasa o PDF ate a varredura; a aprovacao ja esta
 * gravada. Payload sem conteudo, nome de arquivo ou dado pessoal.
 */
export const KANBAN_DOCUMENT_PDF_QUEUE_NAME = 'kanban-document-pdf';
export const CONVERT_DOCUMENT_PDF_JOB = 'convert-document-pdf';
export const SWEEP_DOCUMENT_PDF_JOB = 'sweep-document-pdf';
export const SWEEP_DOCUMENT_PDF_REPEAT_JOB_ID = 'kanban-document-pdf-sweep';
export const SWEEP_DOCUMENT_PDF_EVERY_MS = 2 * 60 * 1000;

export interface ConvertDocumentPdfPayload {
  databaseRef: string;
  clientId: string;
  documentId: string;
}

/** BullMQ proibe ":" no id do job; o id do documento (uuid) basta para o dedup. */
export function documentPdfJobId(documentId: string): string {
  return `pdf-${documentId}`;
}

@Injectable()
export class DocumentPdfQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentPdfQueueService.name);
  private readonly queue: Queue;

  constructor(private readonly config: AppConfigService) {
    this.queue = new Queue(KANBAN_DOCUMENT_PDF_QUEUE_NAME, {
      connection: { url: this.config.redisUrl } as never
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        SWEEP_DOCUMENT_PDF_JOB,
        {},
        {
          jobId: SWEEP_DOCUMENT_PDF_REPEAT_JOB_ID,
          repeat: { every: SWEEP_DOCUMENT_PDF_EVERY_MS },
          removeOnComplete: true,
          removeOnFail: 100
        }
      );
    } catch (error) {
      this.logger.error(`document_pdf_sweep_schedule_failed: ${(error as Error).message}`);
    }
  }

  async enqueue(payload: ConvertDocumentPdfPayload): Promise<void> {
    try {
      await this.queue.add(CONVERT_DOCUMENT_PDF_JOB, payload, {
        jobId: documentPdfJobId(payload.documentId),
        attempts: MAX_PDF_ATTEMPTS,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true
      });
    } catch (error) {
      this.logger.error(`document_pdf_enqueue_failed document=${payload.documentId}: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
