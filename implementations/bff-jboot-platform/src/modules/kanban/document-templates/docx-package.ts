import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Leitura segura do pacote `.docx` enviado pelo tenant (CRM de leads, Sprint 5;
 * ADR 014, Decisao 1, passos 1 e 2). Nada aqui confia no arquivo:
 *
 * 1. o diretorio central do ZIP e lido e os limites sao aplicados ANTES de
 *    descompactar qualquer byte (entradas, soma descompactada declarada, razao);
 * 2. a descompactacao e propria (`inflateRawSync` com `maxOutputLength` igual
 *    ao tamanho declarado) e confere tamanho real e CRC de cada entrada; o
 *    `pizzip` so recebe conteudo ja verificado;
 * 3. o pacote precisa ser documento Word sem macro (`.docm`/`.dotm`), sem
 *    ActiveX/OLE/objeto embutido e sem vinculo externo que nao seja hyperlink.
 *
 * Erros sao `TemplateRejection` com codigo estavel; mensagens nunca ecoam nome
 * de arquivo nem conteudo do documento.
 */

export interface TemplateLimits {
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  maxEntries: number;
  maxCompressionRatio: number;
}

const MIB = 1024 * 1024;

/** Limites da ADR 014 (alterar aqui e no contrato do modulo). */
export const TEMPLATE_LIMITS: TemplateLimits = Object.freeze({
  maxCompressedBytes: 10 * MIB,
  maxUncompressedBytes: 50 * MIB,
  maxEntries: 2000,
  maxCompressionRatio: 100
});

/** Razao por entrada so e avaliada a partir deste tamanho (entrada pequena tem razao sem sentido). */
const PER_ENTRY_RATIO_MIN_BYTES = MIB;

export const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_MAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

export class TemplateRejection extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'TemplateRejection';
  }
}

export interface TemplateWarning {
  code: string;
  detail?: string;
}

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;

function archiveInvalid(reason: string): TemplateRejection {
  return new TemplateRejection(422, 'template_archive_invalid', 'Template file is not a valid .docx package', { reason });
}

function limitExceeded(limit: string, value: number, max: number): TemplateRejection {
  return new TemplateRejection(422, 'template_archive_limits_exceeded', 'Template package exceeds the allowed limits', {
    limit,
    value,
    max
  });
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const start = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

function isUnsafeEntryName(name: string): boolean {
  return (
    name === '' ||
    name.includes('\0') ||
    name.includes('\\') ||
    name.startsWith('/') ||
    name.split('/').some((segment) => segment === '..')
  );
}

/**
 * Le o diretorio central e aplica os limites SEM descompactar nada.
 * ZIP64, multi-disco, criptografia e metodo diferente de STORE/DEFLATE sao recusados.
 */
export function readZipDirectory(buffer: Buffer, limits: TemplateLimits = TEMPLATE_LIMITS): ZipEntry[] {
  if (buffer.length > limits.maxCompressedBytes) {
    throw new TemplateRejection(413, 'template_too_large', 'Template file exceeds the allowed size', {
      max: limits.maxCompressedBytes
    });
  }
  if (buffer.length < EOCD_MIN_SIZE) {
    throw archiveInvalid('too_small');
  }
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) {
    throw archiveInvalid('end_of_central_directory_missing');
  }
  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw archiveInvalid('zip64_not_supported');
  }
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw archiveInvalid('multi_disk_not_supported');
  }
  if (totalEntries > limits.maxEntries) {
    throw limitExceeded('entries', totalEntries, limits.maxEntries);
  }
  if (centralOffset + centralSize > eocd) {
    throw archiveInvalid('central_directory_out_of_bounds');
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let totalUncompressed = 0;
  let totalCompressed = 0;
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > eocd || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw archiveInvalid('central_directory_corrupt');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const entryCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > eocd) {
      throw archiveInvalid('central_directory_corrupt');
    }
    const name = buffer.subarray(cursor + 46, nameEnd).toString('utf8');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw archiveInvalid('zip64_not_supported');
    }
    if ((flags & 0x1) !== 0) {
      throw archiveInvalid('encrypted_entry');
    }
    if (method !== 0 && method !== 8) {
      throw archiveInvalid('unsupported_compression');
    }
    if (isUnsafeEntryName(name)) {
      throw archiveInvalid('unsafe_entry_name');
    }
    if (names.has(name)) {
      throw archiveInvalid('duplicate_entry');
    }
    names.add(name);
    if (
      uncompressedSize >= PER_ENTRY_RATIO_MIN_BYTES &&
      uncompressedSize / Math.max(compressedSize, 1) > limits.maxCompressionRatio
    ) {
      throw limitExceeded('compression_ratio', Math.floor(uncompressedSize / Math.max(compressedSize, 1)), limits.maxCompressionRatio);
    }
    totalUncompressed += uncompressedSize;
    totalCompressed += compressedSize;
    if (totalUncompressed > limits.maxUncompressedBytes) {
      throw limitExceeded('uncompressed_size', totalUncompressed, limits.maxUncompressedBytes);
    }
    entries.push({ name, method, flags, crc32: entryCrc, compressedSize, uncompressedSize, localHeaderOffset });
    cursor = nameEnd + extraLength + commentLength;
  }
  // Entradas sobrepostas (tecnica de zip bomb nao recursivo) declaram mais bytes compactados do que o arquivo tem.
  if (totalCompressed > buffer.length) {
    throw archiveInvalid('overlapping_entries');
  }
  if (totalUncompressed / buffer.length > limits.maxCompressionRatio) {
    throw limitExceeded('compression_ratio', Math.floor(totalUncompressed / buffer.length), limits.maxCompressionRatio);
  }
  return entries;
}

/**
 * Descompacta as entradas ja aprovadas por `readZipDirectory`. Cada entrada e
 * limitada ao tamanho declarado (`maxOutputLength`): se o fluxo real for maior,
 * a descompressao aborta. Tamanho e CRC diferentes do declarado = recusado.
 */
export function extractZipEntries(buffer: Buffer, entries: readonly ZipEntry[]): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    const local = entry.localHeaderOffset;
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== LOCAL_SIGNATURE) {
      throw archiveInvalid('local_header_corrupt');
    }
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > buffer.length) {
      throw archiveInvalid('entry_out_of_bounds');
    }
    if (entry.name.endsWith('/')) {
      if (entry.uncompressedSize !== 0) {
        throw archiveInvalid('directory_with_content');
      }
      continue;
    }
    const compressed = buffer.subarray(dataStart, dataEnd);
    let content: Buffer;
    if (entry.method === 0) {
      content = Buffer.from(compressed);
    } else {
      try {
        content = inflateRawSync(compressed, { maxOutputLength: Math.max(entry.uncompressedSize, 1) });
      } catch {
        // Saida maior que o declarado (zip bomb) ou fluxo DEFLATE corrompido.
        throw archiveInvalid('entry_size_mismatch');
      }
    }
    if (content.length !== entry.uncompressedSize) {
      throw archiveInvalid('entry_size_mismatch');
    }
    if (crc32(content) >>> 0 !== entry.crc32 >>> 0) {
      throw archiveInvalid('entry_crc_mismatch');
    }
    files.set(entry.name, content);
  }
  return files;
}

// ---------------------------------------------------------------------------
// Checagem de pacote OOXML.
// ---------------------------------------------------------------------------

function attributesOf(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function elementsOf(xml: string, localName: string): Array<Record<string, string>> {
  const pattern = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>`, 'g');
  return [...xml.matchAll(pattern)].map((match) => attributesOf(match[0]));
}

function relationshipKind(type: string): string {
  const slash = type.lastIndexOf('/');
  return (slash >= 0 ? type.slice(slash + 1) : type).toLowerCase();
}

const MACRO_ENTRY = /(^|\/)(vbaProject\.bin|vbaData\.xml)$/i;
const EMBEDDED_ENTRY = /(^|\/)(activeX|embeddings)\/|oleObject/i;
const MACRO_CONTENT_TYPE = /macroEnabled|vbaProject|vbaData/i;
const EMBEDDED_CONTENT_TYPE = /activeX|oleObject|\.ole\b/i;
const EMBEDDED_RELATIONSHIPS = new Set(['oleobject', 'package', 'control', 'activexcontrolbinary', 'afchunk']);
const MACRO_RELATIONSHIPS = new Set(['vbaproject', 'wordvbadata', 'keymapcustomizations']);
// Campos do Word que buscam conteudo externo ou executam DDE ao atualizar.
const EXTERNAL_FIELD = /\b(DDEAUTO|DDE|INCLUDEPICTURE|INCLUDETEXT|LINK|IMPORT)\b/i;

export function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Codigo de campo como o Word o le: o texto de `w:instrText` pode vir dividido
 * em varios runs (concatenados) e com entidades XML; `w:fldSimple` traz o
 * codigo no atributo `w:instr`.
 */
export function fieldInstructions(xml: string): string[] {
  const runs = [...xml.matchAll(/<w:instrText\b[^>]*>([^<]*)<\/w:instrText>/g)].map((match) => match[1]).join('');
  const simple = [...xml.matchAll(/\bw:instr\s*=\s*("([^"]*)"|'([^']*)')/g)].map((match) => match[2] ?? match[3] ?? '');
  return [runs, ...simple].map(decodeXmlText).filter((text) => text.trim() !== '');
}

/**
 * Exige documento Word (`.docx`) e recusa macro, ActiveX/OLE/objeto embutido e
 * vinculo externo que nao seja hyperlink (modelo anexado externo = aviso).
 */
export function inspectDocxPackage(files: ReadonlyMap<string, Buffer>): TemplateWarning[] {
  const warnings: TemplateWarning[] = [];
  const names = [...files.keys()];
  const contentTypesXml = files.get('[Content_Types].xml')?.toString('utf8');
  if (!contentTypesXml) {
    throw new TemplateRejection(422, 'template_not_word_document', 'Template is not a Word document (.docx)', {
      reason: 'content_types_missing'
    });
  }
  const contentTypes = [...elementsOf(contentTypesXml, 'Override'), ...elementsOf(contentTypesXml, 'Default')].map(
    (element) => element.ContentType ?? ''
  );

  if (names.some((name) => MACRO_ENTRY.test(name)) || contentTypes.some((type) => MACRO_CONTENT_TYPE.test(type))) {
    throw new TemplateRejection(422, 'template_macro_forbidden', 'Templates with macros (.docm/.dotm) are not allowed');
  }
  const mainParts = elementsOf(contentTypesXml, 'Override').filter((element) => element.ContentType === DOCX_MAIN_CONTENT_TYPE);
  if (mainParts.length !== 1) {
    throw new TemplateRejection(422, 'template_not_word_document', 'Template is not a Word document (.docx)', {
      reason: 'main_document_content_type'
    });
  }
  const mainPart = (mainParts[0].PartName ?? '').replace(/^\//, '');
  if (!files.has(mainPart)) {
    throw new TemplateRejection(422, 'template_not_word_document', 'Template is not a Word document (.docx)', {
      reason: 'main_document_missing'
    });
  }
  if (names.some((name) => EMBEDDED_ENTRY.test(name)) || contentTypes.some((type) => EMBEDDED_CONTENT_TYPE.test(type))) {
    throw new TemplateRejection(422, 'template_embedded_object_forbidden', 'Templates with embedded objects (OLE/ActiveX) are not allowed');
  }

  for (const name of names.filter((entry) => entry.endsWith('.rels'))) {
    const xml = files.get(name)?.toString('utf8') ?? '';
    for (const relationship of elementsOf(xml, 'Relationship')) {
      const kind = relationshipKind(relationship.Type ?? '');
      if (MACRO_RELATIONSHIPS.has(kind)) {
        throw new TemplateRejection(422, 'template_macro_forbidden', 'Templates with macros (.docm/.dotm) are not allowed');
      }
      if (EMBEDDED_RELATIONSHIPS.has(kind)) {
        throw new TemplateRejection(422, 'template_embedded_object_forbidden', 'Templates with embedded objects (OLE/ActiveX) are not allowed', {
          relationship: kind
        });
      }
      if ((relationship.TargetMode ?? '').toLowerCase() === 'external') {
        if (kind === 'hyperlink') {
          continue;
        }
        if (kind === 'attachedtemplate') {
          warnings.push({ code: 'attached_template_external', detail: 'O modelo aponta para um modelo anexo externo do Word (ignorado na geracao).' });
          continue;
        }
        throw new TemplateRejection(422, 'template_external_link_forbidden', 'Templates with externally linked content are not allowed', {
          relationship: kind
        });
      }
    }
  }

  for (const name of names.filter((entry) => /^word\/[^/]+\.xml$/i.test(entry))) {
    for (const instruction of fieldInstructions(files.get(name)?.toString('utf8') ?? '')) {
      const match = EXTERNAL_FIELD.exec(instruction);
      if (match) {
        throw new TemplateRejection(422, 'template_external_link_forbidden', 'Templates with externally linked content are not allowed', {
          field: match[1].toUpperCase()
        });
      }
    }
  }
  return warnings;
}
