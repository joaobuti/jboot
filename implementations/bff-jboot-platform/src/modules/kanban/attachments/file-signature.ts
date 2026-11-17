/**
 * Verificacao de assinatura (magic bytes) do conteudo enviado ao Flow contra o
 * content-type declarado pelo cliente (Backlog T5, docs/product/flow-crm-leads-sprints.md).
 *
 * Cada tipo de `ALLOWED_ATTACHMENT_CONTENT_TYPES` precisa de uma regra aqui; tipo sem
 * regra e rejeitado (fail closed). Verificacao propria, sem dependencia nova: a allowlist
 * e pequena e as assinaturas sao fixas.
 */

type SignatureRule = (buffer: Buffer) => boolean;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87A = Buffer.from('GIF87a', 'latin1');
const GIF89A = Buffer.from('GIF89a', 'latin1');
const RIFF = Buffer.from('RIFF', 'latin1');
const WEBP = Buffer.from('WEBP', 'latin1');
const PDF = Buffer.from('%PDF-', 'latin1');
// Compound File Binary (OLE2): .doc/.xls/.ppt legados.
const OLE_CFB = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
// ZIP: entrada local (arquivo normal, base dos OOXML), arquivo vazio e marcador de ZIP dividido.
const ZIP_LOCAL_FILE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ZIP_SPANNED = Buffer.from([0x50, 0x4b, 0x07, 0x08]);
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// Inicio de conteudo que o navegador interpretaria como documento ativo (HTML/SVG/script).
const ACTIVE_CONTENT_PREFIXES = [/^<!doctype\s+html/i, /^<html/i, /^<script/i, /^<svg/i];
const TEXT_PREFIX_WINDOW = 64;

function startsWith(buffer: Buffer, signature: Buffer, offset = 0): boolean {
  return buffer.length >= offset + signature.length && buffer.subarray(offset, offset + signature.length).equals(signature);
}

function isAsciiWhitespace(byte: number): boolean {
  // espaco, \t, \n, \v, \f, \r
  return byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);
}

/** Posicao do primeiro byte que nao e BOM UTF-8 nem espaco em branco ASCII. */
function skipLeadingBomAndWhitespace(buffer: Buffer): number {
  let index = 0;
  while (index < buffer.length) {
    if (startsWith(buffer, UTF8_BOM, index)) {
      index += UTF8_BOM.length;
    } else if (isAsciiWhitespace(buffer[index])) {
      index += 1;
    } else {
      break;
    }
  }
  return index;
}

/**
 * Texto aceito: sem byte NUL em nenhuma posicao e sem inicio de HTML/script
 * (`<!DOCTYPE html`, `<html`, `<script`, `<svg`), ignorando BOM e espacos no inicio.
 */
export function isSafePlainText(buffer: Buffer): boolean {
  if (buffer.length === 0 || buffer.includes(0x00)) {
    return false;
  }
  const start = skipLeadingBomAndWhitespace(buffer);
  const head = buffer.subarray(start, start + TEXT_PREFIX_WINDOW).toString('latin1');
  return !ACTIVE_CONTENT_PREFIXES.some((pattern) => pattern.test(head));
}

const isZip: SignatureRule = (buffer) =>
  startsWith(buffer, ZIP_LOCAL_FILE) || startsWith(buffer, ZIP_EMPTY) || startsWith(buffer, ZIP_SPANNED);
// OOXML e um pacote ZIP com entradas: exige a entrada local (arquivo vazio/dividido nao e documento).
const isOoxmlPackage: SignatureRule = (buffer) => startsWith(buffer, ZIP_LOCAL_FILE);

export const CONTENT_SIGNATURE_RULES: Readonly<Record<string, SignatureRule>> = {
  'image/png': (buffer) => startsWith(buffer, PNG),
  'image/jpeg': (buffer) => startsWith(buffer, JPEG),
  'image/gif': (buffer) => startsWith(buffer, GIF87A) || startsWith(buffer, GIF89A),
  'image/webp': (buffer) => startsWith(buffer, RIFF) && startsWith(buffer, WEBP, 8),
  'application/pdf': (buffer) => startsWith(buffer, PDF),
  'application/msword': (buffer) => startsWith(buffer, OLE_CFB),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': isOoxmlPackage,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': isOoxmlPackage,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': isOoxmlPackage,
  'application/zip': isZip,
  'text/plain': isSafePlainText,
  'text/csv': isSafePlainText
};

/** `true` quando os primeiros bytes condizem com o content-type declarado; tipo sem regra = `false`. */
export function contentMatchesDeclaredType(contentType: string, buffer: Buffer | undefined): boolean {
  const rule = Object.prototype.hasOwnProperty.call(CONTENT_SIGNATURE_RULES, contentType)
    ? CONTENT_SIGNATURE_RULES[contentType]
    : undefined;
  if (!rule || !Buffer.isBuffer(buffer)) {
    return false;
  }
  return rule(buffer);
}
