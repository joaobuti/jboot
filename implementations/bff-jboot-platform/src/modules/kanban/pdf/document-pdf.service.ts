import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../attachments/storage.service';
import { ScheduledAutomationRepository } from '../automation/scheduled-automation.repository';
import { ConvertDocumentPdfPayload, DocumentPdfQueueService } from './document-pdf-queue.service';
import { DocumentPdfRepository, MAX_PDF_ATTEMPTS } from './document-pdf.repository';
import { isPdf, PdfConversionError, PdfConverterClient } from './pdf-converter.client';

/** Pedido `pending` sem lease ha mais que isto e reenfileirado pela varredura. */
export const PDF_SWEEP_STALE_SECONDS = 60;

export type PdfProcessOutcome = 'done' | 'skipped' | 'retry' | 'failed';

/** Falha da tentativa que deve voltar ao BullMQ para nova tentativa com backoff. */
export class PdfRetryableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PdfRetryableError';
  }
}

/**
 * Conversao do `.docx` aprovado em PDF (CRM de leads, Sprint 6; ADR 014,
 * Decisao 2), fora da requisicao:
 *
 * 1. claim no banco (lease + tentativa); sem claim = nada a fazer;
 * 2. idempotencia: PDF ja gravado em `{client}/{card}/generated/{id}.pdf`
 *    (tentativa anterior caiu depois do upload) e reaproveitado, sem segundo
 *    arquivo e sem nova conversao;
 * 3. le o `.docx` do storage e confere o `sha256` gravado (integridade);
 * 4. converte (Gotenberg, nome generico), confere `%PDF-`, grava o objeto e
 *    marca `done` com `sha256` e tamanho;
 * 5. falha transitoria: continua `pending` e volta ao BullMQ (backoff) ate
 *    `MAX_PDF_ATTEMPTS`; permanente ou ultima tentativa: `failed` ("PDF
 *    pendente", "Gerar PDF novamente"). A aprovacao e o `.docx` nunca mudam.
 *
 * Log so com ids e codigo de erro.
 */
@Injectable()
export class DocumentPdfService {
  private readonly logger = new Logger(DocumentPdfService.name);

  constructor(
    private readonly repository: DocumentPdfRepository,
    private readonly storage: StorageService,
    private readonly converter: PdfConverterClient,
    private readonly queue: DocumentPdfQueueService,
    private readonly tenants: ScheduledAutomationRepository
  ) {}

  async process(payload: ConvertDocumentPdfPayload): Promise<PdfProcessOutcome> {
    const { databaseRef, clientId, documentId } = payload;
    const claimed = await this.repository.claim(databaseRef, clientId, documentId);
    if (!claimed) {
      return 'skipped';
    }
    const pdfKey = this.storage.buildGeneratedDocumentKey({ clientId, cardId: claimed.cardId, documentId, format: 'pdf' });
    try {
      let pdf: Buffer;
      if (await this.storage.exists(pdfKey)) {
        pdf = await this.storage.download(pdfKey);
        if (!isPdf(pdf)) {
          throw new PdfPermanentError('stored_pdf_invalid');
        }
      } else {
        const docx = await this.readSource(claimed.storageKey, claimed.sha256);
        pdf = await this.converter.convert(docx);
        await this.storage.upload(pdfKey, pdf, 'application/pdf');
      }
      const sha256 = createHash('sha256').update(pdf).digest('hex');
      await this.repository.complete(databaseRef, clientId, documentId, { storageKey: pdfKey, sha256, sizeBytes: pdf.length });
      this.logger.log(`document_pdf_done client=${clientId} document=${documentId} attempt=${claimed.attempts}`);
      return 'done';
    } catch (error) {
      const { code, retryable } = classify(error);
      const final = !retryable || claimed.attempts >= MAX_PDF_ATTEMPTS;
      await this.repository.recordFailure(databaseRef, clientId, documentId, code, final);
      this.logger.warn(
        `document_pdf_${final ? 'failed' : 'retry'} client=${clientId} document=${documentId} attempt=${claimed.attempts} code=${code}`
      );
      if (final) {
        return 'failed';
      }
      throw new PdfRetryableError(code);
    }
  }

  /** Relay periodico: reenfileira aprovados `pending` sem lease vivo de todos os tenants ativos do Flow. */
  async sweep(): Promise<number> {
    let enqueued = 0;
    for (const tenant of await this.tenants.listActiveFlowTenants()) {
      try {
        const ids = await this.repository.listStalePending(tenant.databaseRef, tenant.clientId, PDF_SWEEP_STALE_SECONDS);
        for (const documentId of ids) {
          await this.queue.enqueue({ databaseRef: tenant.databaseRef, clientId: tenant.clientId, documentId });
          enqueued += 1;
        }
      } catch (error) {
        this.logger.error(`document_pdf_sweep_failed client=${tenant.clientId}: ${(error as Error).message}`);
      }
    }
    return enqueued;
  }

  private async readSource(storageKey: string, sha256: string): Promise<Buffer> {
    let docx: Buffer;
    try {
      docx = await this.storage.download(storageKey);
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      throw status === 404 ? new PdfPermanentError('source_missing') : new PdfTransientError('storage_unavailable');
    }
    if (createHash('sha256').update(docx).digest('hex') !== sha256) {
      throw new PdfPermanentError('source_integrity_mismatch');
    }
    return docx;
  }
}

class PdfPermanentError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class PdfTransientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function classify(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof PdfConversionError) {
    return { code: error.code, retryable: error.retryable };
  }
  if (error instanceof PdfPermanentError) {
    return { code: error.code, retryable: false };
  }
  if (error instanceof PdfTransientError) {
    return { code: error.code, retryable: true };
  }
  return { code: 'internal_error', retryable: true };
}
