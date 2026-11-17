import PizZip from 'pizzip';

/**
 * Fixture `.docx` SINTETICA montada em codigo (Sprint 5): pacote OOXML minimo
 * com `[Content_Types].xml`, `_rels/.rels`, `word/document.xml` e, opcional,
 * `word/_rels/document.xml.rels` e entradas extras. Nunca usa documento real de
 * cliente; o texto vem do proprio teste.
 */
export interface DocxFixtureOptions {
  /** Um paragrafo por item (texto literal, com as tags do teste). */
  paragraphs?: string[];
  /** XML bruto do corpo (substitui `paragraphs`). */
  bodyXml?: string;
  mainContentType?: string;
  /** `<Override>` extras no `[Content_Types].xml`. */
  extraOverrides?: Array<{ partName: string; contentType: string }>;
  /** Relacionamentos de `word/document.xml`. */
  documentRelationships?: Array<{ id: string; type: string; target: string; external?: boolean }>;
  /** Entradas extras no pacote (nome -> conteudo). */
  extraFiles?: Record<string, string | Buffer>;
  compression?: 'STORE' | 'DEFLATE';
}

export const DOCX_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
export const DOCM_MAIN = 'application/vnd.ms-word.document.macroEnabled.main+xml';
export const REL_BASE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function paragraphXml(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function buildDocx(options: DocxFixtureOptions = {}): Buffer {
  const zip = new PizZip();
  const overrides = [
    { partName: '/word/document.xml', contentType: options.mainContentType ?? DOCX_MAIN },
    ...(options.extraOverrides ?? [])
  ]
    .map((item) => `<Override PartName="${item.partName}" ContentType="${item.contentType}"/>`)
    .join('');
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      overrides +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${REL_BASE}/officeDocument" Target="word/document.xml"/>` +
      '</Relationships>'
  );
  const body = options.bodyXml ?? (options.paragraphs ?? ['Documento sintetico de teste']).map(paragraphXml).join('');
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<w:body>${body}</w:body></w:document>`
  );
  if (options.documentRelationships) {
    zip.file(
      'word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        options.documentRelationships
          .map(
            (rel) =>
              `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"${rel.external ? ' TargetMode="External"' : ''}/>`
          )
          .join('') +
        '</Relationships>'
    );
  }
  for (const [name, content] of Object.entries(options.extraFiles ?? {})) {
    zip.file(name, content);
  }
  return zip.generate({ type: 'nodebuffer', compression: options.compression ?? 'DEFLATE' }) as Buffer;
}
