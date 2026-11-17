import { createHash } from 'node:crypto';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import {
  extractZipEntries,
  inspectDocxPackage,
  readZipDirectory,
  TEMPLATE_LIMITS,
  TemplateLimits,
  TemplateRejection,
  TemplateWarning
} from './docx-package';
import { catalogParser, missingValueMarker } from './docx-template-validator';
import { TemplateData } from './template-variable-catalog';

/**
 * Geracao do documento (CRM de leads, Sprint 6; ADR 014, Decisao 1) e
 * verificacao da versao editada enviada pelo gestor. Funcoes puras (sem I/O),
 * executadas em worker thread pelo `TemplateValidationRunner` (mesmo teto de
 * tempo/heap da validacao do modelo), fora do event loop compartilhado.
 *
 * - `renderDocxTemplate`: o modelo ja passou pela validacao completa no upload
 *   (S5); aqui o pacote e relido com os MESMOS limites anti zip-bomb e a mesma
 *   checagem de macro/OLE/vinculo externo (defesa em profundidade, custo
 *   baixo), compilado com o parser restrito do catalogo e renderizado. Valor
 *   ausente sai como `[PREENCHER: <campo>]` (o servico ja bloqueou as
 *   obrigatorias antes). Valores sempre entram escapados (texto).
 * - `inspectEditedDocx`: versao editada no Word pelo gestor. Mesma seguranca de
 *   arquivo do modelo (limites, pacote Word sem macro/OLE/vinculo externo), SEM
 *   exigir variaveis; marcador `{{...}}` ou `[PREENCHER: ...]` restante vira
 *   aviso (nao bloqueia: o gestor e o revisor).
 */

const DELIMITERS = { start: '{{', end: '}}' };
const MAX_WARNING_DETAIL = 120;

export interface DocxRenderSuccess {
  ok: true;
  file: Uint8Array;
  sha256: string;
  /** Inicio do texto renderizado (so evidencia de teste; nunca persistido nem devolvido pela API). */
  text: string;
}

export interface DocxEditedSuccess {
  ok: true;
  sha256: string;
  warnings: TemplateWarning[];
}

export interface DocxTaskFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

function failure(error: unknown, fallbackCode: string, fallbackMessage: string): DocxTaskFailure {
  if (error instanceof TemplateRejection) {
    return { ok: false, status: error.status, code: error.code, message: error.message, details: error.details };
  }
  return { ok: false, status: 422, code: fallbackCode, message: fallbackMessage, details: { reason: 'unexpected_error' } };
}

function readPackage(buffer: Buffer, limits: TemplateLimits): { files: Map<string, Buffer>; warnings: TemplateWarning[] } {
  const entries = readZipDirectory(buffer, limits);
  const files = extractZipEntries(buffer, entries);
  const warnings = inspectDocxPackage(files);
  return { files, warnings };
}

function zipOf(files: ReadonlyMap<string, Buffer>): PizZip {
  const zip = new PizZip();
  for (const [name, content] of files) {
    zip.file(name, content);
  }
  return zip;
}

export function renderDocxTemplate(buffer: Buffer, data: TemplateData, limits: TemplateLimits = TEMPLATE_LIMITS): DocxRenderSuccess | DocxTaskFailure {
  try {
    const { files } = readPackage(buffer, limits);
    const doc = new Docxtemplater(zipOf(files), {
      delimiters: DELIMITERS,
      paragraphLoop: true,
      linebreaks: true,
      parser: catalogParser,
      nullGetter: missingValueMarker,
      errorLogging: false
    });
    doc.render(data);
    const output = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
    return {
      ok: true,
      file: new Uint8Array(output),
      sha256: createHash('sha256').update(output).digest('hex'),
      text: doc.getFullText().slice(0, 4000)
    };
  } catch (error) {
    return failure(error, 'document_render_failed', 'Document could not be generated from the template');
  }
}

/** Texto visivel do `word/document.xml` (runs concatenados por paragrafo). */
function documentText(xml: string): string {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((paragraph) => [...paragraph[0].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join(''))
    .join('\n');
}

export function inspectEditedDocx(buffer: Buffer, limits: TemplateLimits = TEMPLATE_LIMITS): DocxEditedSuccess | DocxTaskFailure {
  try {
    const { files, warnings } = readPackage(buffer, limits);
    const text = documentText(files.get('word/document.xml')?.toString('utf8') ?? '');
    const extra: TemplateWarning[] = [];
    const tag = /\{\{[^{}]*\}\}/.exec(text);
    if (tag) {
      extra.push({ code: 'template_tag_left', detail: tag[0].slice(0, MAX_WARNING_DETAIL) });
    }
    if (/\[PREENCHER:[^\]]*\]/.test(text)) {
      extra.push({ code: 'fill_marker_left' });
    }
    return {
      ok: true,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      warnings: [...warnings, ...extra]
    };
  } catch (error) {
    return failure(error, 'template_invalid', 'Document could not be processed');
  }
}
