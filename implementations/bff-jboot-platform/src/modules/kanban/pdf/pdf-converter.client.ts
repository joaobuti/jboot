import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

/**
 * Cliente do conversor `.docx -> PDF` (CRM de leads, Sprint 6; ADR 014,
 * Decisao 2): Gotenberg LibreOffice-only na rede interna `jboot-pdf-internal`.
 *
 * - `POST {url}/forms/libreoffice/convert`, multipart com UM arquivo de nome
 *   GENERICO (`document.docx`, nunca o nome original), basic auth, timeout de
 *   60 s, `fetch` nativo do Node (sem SDK). URL vem so da configuracao do
 *   deploy (nunca de entrada do usuario: sem SSRF).
 * - Resposta conferida pela assinatura `%PDF-` e por um teto de tamanho.
 * - Erro vira `PdfConversionError` com codigo estavel e `retryable`; mensagens
 *   nunca carregam conteudo, nome de arquivo ou resposta do conversor.
 */

export const PDF_CONVERTER_FILE_NAME = 'document.docx';
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');
/** Teto da resposta (um documento juridico convertido fica muito abaixo disso). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export type PdfConversionErrorCode =
  | 'converter_not_configured'
  | 'converter_unavailable'
  | 'converter_timeout'
  | 'converter_auth_failed'
  | 'converter_rejected'
  | 'converter_invalid_output';

const RETRYABLE: ReadonlySet<PdfConversionErrorCode> = new Set(['converter_unavailable', 'converter_timeout', 'converter_invalid_output']);

export class PdfConversionError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: PdfConversionErrorCode,
    readonly httpStatus: number | null = null
  ) {
    super(code);
    this.name = 'PdfConversionError';
    this.retryable = RETRYABLE.has(code);
  }
}

export interface PdfConverterOptions {
  url: string;
  user: string;
  password: string;
  timeoutMs: number;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function isPdf(buffer: Buffer): boolean {
  return buffer.length > PDF_SIGNATURE.length && buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
}

/** Conversao pura (testavel com `fetch` falso); o servico Nest abaixo injeta config e `fetch` global. */
export async function convertDocxToPdf(docx: Buffer, options: PdfConverterOptions, fetchImpl: FetchLike = fetch): Promise<Buffer> {
  if (!options.url) {
    throw new PdfConversionError('converter_not_configured');
  }
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)], { type: DOCX_CONTENT_TYPE }), PDF_CONVERTER_FILE_NAME);
  const headers: Record<string, string> = {};
  if (options.user || options.password) {
    headers.Authorization = `Basic ${Buffer.from(`${options.user}:${options.password}`).toString('base64')}`;
  }
  let response: Response;
  try {
    response = await fetchImpl(`${options.url.replace(/\/+$/, '')}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      headers,
      signal: AbortSignal.timeout(options.timeoutMs),
      redirect: 'error'
    });
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw new PdfConversionError(name === 'TimeoutError' || name === 'AbortError' ? 'converter_timeout' : 'converter_unavailable');
  }
  if (response.status === 401 || response.status === 403) {
    throw new PdfConversionError('converter_auth_failed', response.status);
  }
  if (response.status === 503 || response.status === 429 || response.status >= 500) {
    throw new PdfConversionError(response.status === 504 ? 'converter_timeout' : 'converter_unavailable', response.status);
  }
  if (!response.ok) {
    throw new PdfConversionError('converter_rejected', response.status);
  }
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_PDF_BYTES) {
    throw new PdfConversionError('converter_invalid_output', response.status);
  }
  let body: Buffer;
  try {
    body = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const name = (error as { name?: string }).name;
    throw new PdfConversionError(name === 'TimeoutError' || name === 'AbortError' ? 'converter_timeout' : 'converter_unavailable');
  }
  if (body.length > MAX_PDF_BYTES || !isPdf(body)) {
    throw new PdfConversionError('converter_invalid_output', response.status);
  }
  return body;
}

@Injectable()
export class PdfConverterClient {
  constructor(private readonly config: AppConfigService) {}

  convert(docx: Buffer): Promise<Buffer> {
    return convertDocxToPdf(docx, this.config.pdfConverter);
  }
}
