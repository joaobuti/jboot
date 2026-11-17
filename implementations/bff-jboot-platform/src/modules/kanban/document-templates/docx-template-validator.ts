import { createHash } from 'node:crypto';
import Docxtemplater from 'docxtemplater';
import type InspectModule from 'docxtemplater/js/inspect-module.js';
import * as inspectModuleExport from 'docxtemplater/js/inspect-module.js';
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
import {
  buildTemplateData,
  CatalogVariable,
  collectionItemKey,
  findCatalogVariable,
  SYNTHETIC_TEMPLATE_SOURCE,
  TEMPLATE_CATALOG_VERSION,
  TEMPLATE_PATH_PATTERN,
  TemplateValueType
} from './template-variable-catalog';

/**
 * Pipeline sincrono de validacao do modelo `.docx` (ADR 014, Decisao 1), em
 * ordem e com falha fechada:
 *
 * 1. limites anti zip-bomb no diretorio central e descompactacao controlada;
 * 2. pacote Word sem macro, OLE/ActiveX ou vinculo externo;
 * 3. compilacao com delimitadores `{{ }}` (erros multiplos do core viram lista);
 * 4. inspecao (`inspect-module` do core) das tags com tipo;
 * 5. gramatica + catalogo: raw XML, fora da gramatica e tipo incompativel =
 *    recusado; desconhecida = versao `invalid_variables`;
 * 6. varredura de texto por tags quase certas (aviso de digitacao);
 * 7. render de prova com os dados sinteticos do catalogo.
 *
 * Funcao pura (sem I/O); roda em worker thread (`TemplateValidationRunner`)
 * para nao prender o event loop do processo compartilhado.
 */

export type TagUsage = 'placeholder' | 'section' | 'inverted_section';

export interface DetectedVariable {
  key: string;
  known: boolean;
  valueType: TemplateValueType | null;
  usages: TagUsage[];
}

export interface TemplateValidationSuccess {
  ok: true;
  status: 'valid' | 'invalid_variables';
  catalogVersion: number;
  sha256: string;
  variables: DetectedVariable[];
  unknownVariables: string[];
  warnings: TemplateWarning[];
  proofRenderBytes: number;
  /**
   * Inicio do texto do documento principal renderizado com dados sinteticos
   * (evidencia do render de prova nos testes). Nao e persistido nem devolvido
   * pela API.
   */
  proofRenderText: string;
}

export interface TemplateValidationFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type TemplateValidationOutcome = TemplateValidationSuccess | TemplateValidationFailure;

const DELIMITERS = { start: '{{', end: '}}' };

// O pacote declara `export default class`, mas o modulo CommonJS exporta uma
// fabrica (`module.exports = () => new InspectModule()`), sem `default`.
const createInspectModule = inspectModuleExport as unknown as () => InspectModule;
const MAX_LISTED = 50;
const MAX_TAG_LENGTH = 120;
const MAX_WARNINGS = 20;
const PROOF_TEXT_LENGTH = 2000;

interface InspectedPart {
  type: string;
  value: string;
  module?: string;
  inverted?: boolean;
  subparsed?: InspectedPart[];
}

interface TemplateErrorProperties {
  id?: string;
  xtag?: string;
  file?: string;
  offset?: number;
  errors?: Array<{ properties?: TemplateErrorProperties }>;
}

function truncate(value: string): string {
  return value.length > MAX_TAG_LENGTH ? `${value.slice(0, MAX_TAG_LENGTH)}...` : value;
}

function hasOwn(target: unknown, key: string): boolean {
  return typeof target === 'object' && target !== null && Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Parser restrito (ADR 014): sem avaliador de expressao. Aceita so caminho com
 * pontos e resolve apenas propriedades proprias do objeto de dados. Tag fora da
 * gramatica resolve `undefined` (e ja foi recusada na inspecao).
 */
export function catalogParser(tag: string): { get: (scope: unknown) => unknown } {
  const path = tag.trim();
  const segments = TEMPLATE_PATH_PATTERN.test(path) ? path.split('.') : null;
  return {
    get(scope: unknown): unknown {
      if (!segments) {
        return undefined;
      }
      let current: unknown = scope;
      for (const segment of segments) {
        if (!hasOwn(current, segment)) {
          return undefined;
        }
        current = (current as Record<string, unknown>)[segment];
      }
      return current;
    }
  };
}

/** Marcador visivel de valor ausente (R5); na S5 so aparece no render de prova de tag desconhecida. */
export function missingValueMarker(part: { value?: string }): string {
  return `[PREENCHER: ${(part.value ?? '').trim()}]`;
}

function failure(error: TemplateRejection): TemplateValidationFailure {
  return { ok: false, status: error.status, code: error.code, message: error.message, details: error.details };
}

function compileErrorList(properties: TemplateErrorProperties | undefined): TemplateErrorProperties[] {
  if (!properties) {
    return [];
  }
  if (properties.id === 'multi_error' && Array.isArray(properties.errors)) {
    return properties.errors.map((error) => error.properties ?? {});
  }
  return [properties];
}

function compile(zip: PizZip, inspect: InspectModule): Docxtemplater {
  try {
    return new Docxtemplater(zip, {
      modules: [inspect],
      delimiters: DELIMITERS,
      paragraphLoop: true,
      linebreaks: true,
      parser: catalogParser,
      nullGetter: missingValueMarker,
      // O logger padrao do core imprime o contexto do modelo no console.
      errorLogging: false
    });
  } catch (error) {
    const errors = compileErrorList((error as { properties?: TemplateErrorProperties }).properties);
    const raw = errors.filter((item) => item.id === 'raw_xml_tag_should_be_only_text_in_paragraph');
    if (raw.length > 0) {
      throw new TemplateRejection(422, 'template_raw_xml_forbidden', 'Raw XML tags ({{@...}}) are not allowed', {
        tags: raw.slice(0, MAX_LISTED).map((item) => truncate(item.xtag ?? ''))
      });
    }
    throw new TemplateRejection(422, 'template_invalid', 'Template has syntax errors', {
      errors: errors.slice(0, MAX_LISTED).map((item) => ({
        id: item.id ?? 'unknown',
        tag: truncate(item.xtag ?? ''),
        part: item.file ?? null,
        offset: typeof item.offset === 'number' ? item.offset : null
      }))
    });
  }
}

interface Classification {
  raw: string[];
  grammar: string[];
  mismatch: Array<{ tag: string; expected: TemplateValueType; usage: TagUsage }>;
  variables: Map<string, DetectedVariable>;
}

function usageOf(part: InspectedPart): TagUsage {
  if (part.module === 'loop') {
    return part.inverted ? 'inverted_section' : 'section';
  }
  return 'placeholder';
}

function record(classification: Classification, key: string, variable: CatalogVariable | null, valueType: TemplateValueType | null, usage: TagUsage) {
  const current = classification.variables.get(key) ?? { key, known: variable !== null || valueType !== null, valueType, usages: [] };
  if (!current.usages.includes(usage)) {
    current.usages.push(usage);
  }
  classification.variables.set(key, current);
}

/** Uso compativel: texto so como placeholder; booleano so como secao; colecao so como secao. */
function compatible(valueType: TemplateValueType, usage: TagUsage): boolean {
  return valueType === 'text' ? usage === 'placeholder' : usage !== 'placeholder';
}

function classify(parts: readonly InspectedPart[], loop: CatalogVariable | null, classification: Classification): void {
  for (const part of parts) {
    if (part.type !== 'placeholder') {
      continue;
    }
    const tag = (part.value ?? '').trim();
    if (part.module === 'rawxml') {
      classification.raw.push(truncate(tag));
      continue;
    }
    if (part.module !== undefined && part.module !== 'loop') {
      classification.grammar.push(truncate(tag));
      continue;
    }
    const usage = usageOf(part);
    if (!TEMPLATE_PATH_PATTERN.test(tag)) {
      classification.grammar.push(truncate(tag));
    } else {
      // Dentro de laco sobre colecao do catalogo, campo do item vem antes do escopo raiz.
      const item = loop?.valueType === 'collection' ? loop.items.find((field) => field.key === tag) : undefined;
      if (loop && item) {
        if (usage !== 'placeholder') {
          classification.mismatch.push({ tag: truncate(tag), expected: 'text', usage });
        }
        record(classification, collectionItemKey(loop.key, tag), null, 'text', usage);
      } else {
        const variable = findCatalogVariable(tag);
        if (variable && !compatible(variable.valueType, usage)) {
          classification.mismatch.push({ tag: truncate(tag), expected: variable.valueType, usage });
        }
        const key = variable || !loop || tag.includes('.') ? tag : collectionItemKey(loop.key, tag);
        record(classification, key, variable, variable?.valueType ?? null, usage);
      }
    }
    if (part.subparsed) {
      const nested = findCatalogVariable(tag);
      classify(part.subparsed, nested?.valueType === 'collection' && usage === 'section' ? nested : loop, classification);
    }
  }
}

// Tag quase certa que sobrou no texto depois de remover as tags bem formadas.
const NEAR_TAG = /[{}]+\s*[#^/@]?\s*[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\s*[{}]*/gi;
const WELL_FORMED_TAG = /\{\{[^{}]*\}\}/g;

function typoWarnings(texts: readonly string[]): TemplateWarning[] {
  const warnings: TemplateWarning[] = [];
  for (const text of texts) {
    const residue = text.replace(WELL_FORMED_TAG, ' ');
    for (const match of residue.matchAll(NEAR_TAG)) {
      if (/[{}]/.test(match[0]) && warnings.length < MAX_WARNINGS) {
        warnings.push({ code: 'possible_malformed_tag', detail: truncate(match[0].trim()) });
      }
    }
  }
  return warnings;
}

export function validateDocxTemplate(buffer: Buffer, limits: TemplateLimits = TEMPLATE_LIMITS): TemplateValidationOutcome {
  try {
    const entries = readZipDirectory(buffer, limits);
    const files = extractZipEntries(buffer, entries);
    const packageWarnings = inspectDocxPackage(files);

    const zip = new PizZip();
    for (const [name, content] of files) {
      zip.file(name, content);
    }
    const inspect = createInspectModule();
    const doc = compile(zip, inspect);

    const classification: Classification = { raw: [], grammar: [], mismatch: [], variables: new Map() };
    classify(inspect.getAllStructuredTags() as unknown as InspectedPart[], null, classification);
    if (classification.raw.length > 0) {
      throw new TemplateRejection(422, 'template_raw_xml_forbidden', 'Raw XML tags ({{@...}}) are not allowed', {
        tags: [...new Set(classification.raw)].slice(0, MAX_LISTED)
      });
    }
    if (classification.grammar.length > 0) {
      throw new TemplateRejection(422, 'template_tag_invalid', 'Template tags must be catalog paths like {{cliente.nome}}', {
        tags: [...new Set(classification.grammar)].slice(0, MAX_LISTED)
      });
    }
    if (classification.mismatch.length > 0) {
      throw new TemplateRejection(422, 'template_variable_kind_mismatch', 'Template uses a variable in an incompatible way', {
        tags: classification.mismatch.slice(0, MAX_LISTED)
      });
    }

    const texts = inspect.getTemplatedFiles().map((file) => doc.getFullText(file));
    const warnings = [...packageWarnings, ...typoWarnings(texts)];

    let proofRenderBytes: number;
    let proofRenderText: string;
    try {
      doc.render(buildTemplateData(SYNTHETIC_TEMPLATE_SOURCE));
      const output = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
      readZipDirectory(output, { ...limits, maxCompressedBytes: Number.MAX_SAFE_INTEGER, maxCompressionRatio: Number.MAX_SAFE_INTEGER });
      proofRenderBytes = output.length;
      proofRenderText = doc.getFullText().slice(0, PROOF_TEXT_LENGTH);
    } catch (error) {
      const ids = compileErrorList((error as { properties?: TemplateErrorProperties }).properties).map((item) => item.id ?? 'unknown');
      throw new TemplateRejection(422, 'template_render_failed', 'Template failed the proof render with synthetic data', {
        errors: ids.slice(0, MAX_LISTED)
      });
    }

    const variables = [...classification.variables.values()].sort((a, b) => a.key.localeCompare(b.key));
    const unknownVariables = variables.filter((variable) => !variable.known).map((variable) => variable.key);
    return {
      ok: true,
      status: unknownVariables.length > 0 ? 'invalid_variables' : 'valid',
      catalogVersion: TEMPLATE_CATALOG_VERSION,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      variables,
      unknownVariables,
      warnings,
      proofRenderBytes,
      proofRenderText
    };
  } catch (error) {
    if (error instanceof TemplateRejection) {
      return failure(error);
    }
    return {
      ok: false,
      status: 422,
      code: 'template_invalid',
      message: 'Template could not be processed',
      details: { reason: 'unexpected_error' }
    };
  }
}
