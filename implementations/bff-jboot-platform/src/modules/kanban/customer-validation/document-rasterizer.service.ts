import { Injectable } from '@nestjs/common';
import { Canvas, createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * Documento da ficha -> imagem JPEG por pagina para o agente Claude (ADR 017, S2).
 * Spike S0: tool MCP so tem suporte documentado para imagem; PDF e renderizado
 * aqui. Lado maior limitado a 1568 px (bom para leitura e dentro do limite de
 * 25 mil tokens por resultado de tool). HISCON e HISCRED passam de 10 paginas;
 * o teto protege o BFF de PDF patologico e o total real volta em `totalPages`.
 */
export const MAX_DOCUMENT_PAGES = 100;
const MAX_SIDE = 1568;
const JPEG_QUALITY = 80;

export interface RenderedPage {
  jpeg: Buffer;
  page: number;
  pageCount: number;
  /** Paginas do arquivo; maior que `pageCount` quando o teto cortou o documento. */
  totalPages: number;
  width: number;
  height: number;
}

export class DocumentPageOutOfRangeError extends Error {
  constructor(readonly pageCount: number) {
    super('document_page_out_of_range');
  }
}

/** Superficie minima usada do pdfjs-dist (ESM carregado via require no Node 24). */
interface PdfJs {
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}
interface PdfDocument {
  numPages: number;
  getPage(page: number): Promise<PdfPage>;
}
interface PdfPage {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: Record<string, unknown>): { promise: Promise<void> };
}

/** Motivo para recusar o PDF no upload: o agente nao consegue abrir arquivo com senha nem corrompido. */
export type PdfRejection = 'password_protected' | 'unreadable';

let pdfjs: PdfJs | null = null;
function loadPdfJs(): PdfJs {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pdfjs ??= require('pdfjs-dist/legacy/build/pdf.mjs') as PdfJs;
  return pdfjs;
}

export function fitWithin(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

@Injectable()
export class DocumentRasterizerService {
  async render(body: Buffer, contentType: string, page: number): Promise<RenderedPage> {
    const { canvas, pageCount, totalPages } = await this.renderCanvas(body, contentType, page, MAX_SIDE);
    return { jpeg: await canvas.encode('jpeg', JPEG_QUALITY), page, pageCount, totalPages, width: canvas.width, height: canvas.height };
  }

  /**
   * Pagina desenhada na mesma orientacao da imagem que a rotina recebe (`render`), com lado maior
   * `maxSide`: uma regiao em fracoes da imagem da rotina cai no mesmo lugar aqui, inclusive em pagina
   * deitada (a rotacao do PDF entra no viewport nos dois casos). Usado no print do HISCON (S4).
   */
  async renderCanvas(
    body: Buffer,
    contentType: string,
    page: number,
    maxSide: number
  ): Promise<{ canvas: Canvas; pageCount: number; totalPages: number }> {
    if (contentType === 'application/pdf') return this.renderPdf(body, page, maxSide);
    if (page !== 1) throw new DocumentPageOutOfRangeError(1);
    const image = await loadImage(body);
    const size = fitWithin(image.width, image.height, maxSide);
    const canvas = createCanvas(size.width, size.height);
    canvas.getContext('2d').drawImage(image, 0, 0, size.width, size.height);
    return { canvas, pageCount: 1, totalPages: 1 };
  }

  /** Abre o PDF sem renderizar; `null` quando o agente consegue le-lo. */
  async inspectPdf(body: Buffer): Promise<PdfRejection | null> {
    const task = this.openPdf(body);
    try {
      await task.promise;
      return null;
    } catch (error) {
      return (error as { name?: string } | null)?.name === 'PasswordException' ? 'password_protected' : 'unreadable';
    } finally {
      await task.destroy();
    }
  }

  private openPdf(body: Buffer) {
    // Sem eval e sem fontes do sistema: o PDF e dado nao confiavel.
    return loadPdfJs().getDocument({
      data: new Uint8Array(body),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false
    });
  }

  private async renderPdf(body: Buffer, page: number, maxSide: number): Promise<{ canvas: Canvas; pageCount: number; totalPages: number }> {
    const task = this.openPdf(body);
    try {
      const document = await task.promise;
      const pageCount = Math.min(document.numPages, MAX_DOCUMENT_PAGES);
      if (!Number.isInteger(page) || page < 1 || page > pageCount) throw new DocumentPageOutOfRangeError(pageCount);
      const pdfPage = await document.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(maxSide / Math.max(base.width, base.height), maxSide === MAX_SIDE ? 3 : 6);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
      return { canvas, pageCount, totalPages: document.numPages };
    } finally {
      await task.destroy();
    }
  }
}
