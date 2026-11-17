import { inflateSync } from 'node:zlib';

/**
 * Extrator MINIMO de texto de PDF para teste (CRM de leads, Sprint 6): confere
 * que o PDF gerado pelo Gotenberg/LibreOffice tem o mesmo texto do `.docx`.
 * Cobre o que o LibreOffice emite: streams `FlateDecode`, fontes com
 * `ToUnicode` (`bfchar`/`bfrange`, codigos de 1 ou 2 bytes) e texto em
 * `Tj`/`TJ` com strings hexadecimais ou literais. Nao e parser de PDF geral;
 * nao usar em codigo de producao.
 */

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

function parseObjects(pdf: Buffer): Map<number, PdfObject> {
  const text = pdf.toString('latin1');
  const objects = new Map<number, PdfObject>();
  const pattern = /(\d+)\s+0\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf('endobj', start);
    if (end < 0) {
      break;
    }
    const body = text.slice(start, end);
    const streamAt = body.search(/stream\r?\n/);
    let stream: Buffer | null = null;
    let dict = body;
    if (streamAt >= 0) {
      dict = body.slice(0, streamAt);
      const dataStart = start + streamAt + (body.slice(streamAt).startsWith('stream\r\n') ? 8 : 7);
      const dataEnd = text.lastIndexOf('endstream', end);
      const raw = pdf.subarray(dataStart, dataEnd);
      stream = /\/FlateDecode/.test(dict) ? inflateSync(raw) : raw;
    }
    objects.set(Number(match[1]), { dict, stream });
    pattern.lastIndex = end;
  }
  return objects;
}

interface CMap {
  bytes: number;
  map: Map<number, string>;
}

function hexToString(hex: string): string {
  let out = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  }
  return out;
}

function parseCMap(source: string): CMap {
  const range = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(source);
  const map = new Map<number, string>();
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(parseInt(pair[1], 16), hexToString(pair[2]));
    }
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const item of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const from = parseInt(item[1], 16);
      const to = parseInt(item[2], 16);
      const base = parseInt(item[3], 16);
      for (let code = from; code <= to; code += 1) {
        map.set(code, String.fromCharCode(base + code - from));
      }
    }
  }
  return { bytes: range ? range[1].length / 2 : 1, map };
}

function decodeHex(hex: string, cmap: CMap | undefined): string {
  const clean = hex.replace(/\s+/g, '');
  if (!cmap) {
    return Buffer.from(clean, 'hex').toString('latin1');
  }
  const step = cmap.bytes * 2;
  let out = '';
  for (let i = 0; i + step <= clean.length; i += step) {
    out += cmap.map.get(parseInt(clean.slice(i, i + step), 16)) ?? '';
  }
  return out;
}

function decodeLiteral(literal: string): string {
  return literal.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_all, escape: string) => {
    const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
    return simple[escape] ?? String.fromCharCode(parseInt(escape, 8));
  });
}

export function extractPdfText(pdf: Buffer): string {
  const objects = parseObjects(pdf);
  const fontCMaps = new Map<number, CMap>();
  for (const [id, object] of objects) {
    const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(object.dict);
    const cmap = ref ? objects.get(Number(ref[1]))?.stream : null;
    if (/\/Type\s*\/Font/.test(object.dict) && cmap) {
      fontCMaps.set(id, parseCMap(cmap.toString('latin1')));
    }
  }
  const fontsByName = new Map<string, CMap>();
  // Recurso de fonte direto (`/Font<</F1 5 0 R>>`) ou indireto (`/Font 7 0 R` -> `<</F1 5 0 R>>`):
  // qualquer `/Nome n 0 R` que aponte para fonte com ToUnicode.
  for (const object of objects.values()) {
    for (const entry of object.dict.matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+0\s+R/g)) {
      const cmap = fontCMaps.get(Number(entry[2]));
      if (cmap) {
        fontsByName.set(entry[1], cmap);
      }
    }
  }
  const lines: string[] = [];
  for (const object of objects.values()) {
    const content = object.stream?.toString('latin1') ?? '';
    if (!/\bBT\b/.test(content) || !/T[Jj]\b/.test(content)) {
      continue;
    }
    let current: CMap | undefined;
    let line = '';
    const tokens = /\/([A-Za-z0-9_.+-]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\)|\bBT\b|\bET\b/g;
    for (const token of content.matchAll(tokens)) {
      if (token[1] !== undefined) {
        current = fontsByName.get(token[1]);
      } else if (token[2] !== undefined) {
        line += decodeHex(token[2], current);
      } else if (token[3] !== undefined) {
        line += decodeLiteral(token[3]);
      } else if (token[0] === 'ET') {
        lines.push(line);
        line = '';
      }
    }
    if (line) {
      lines.push(line);
    }
  }
  return lines.join('\n');
}

/** Espacos colapsados (o PDF quebra/justifica linhas de outro jeito que o Word). */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
