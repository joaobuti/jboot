// sanitize-html exporta `module.exports = fn` e o projeto compila sem esModuleInterop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sanitizeHtml = require('sanitize-html');

/** Limite do HTML gravado (o CHECK do banco e 300 000). */
export const SERVICE_CONTRACT_MAX_HTML = 300_000;

/** Tag do modelo: `[[` + maiusculas, digitos ou `_` + `]]`. */
const TAG_PATTERN = /\[\[([A-Z0-9_]+)\]\]/g;
/** Qualquer coisa entre `[[ ]]` (para apontar tag mal escrita). */
const BRACKETED_PATTERN = /\[\[([^[\]]{1,80})\]\]/g;

/**
 * Allowlist do HTML que o Quill 2 produz: blocos, enfase, listas (`data-list`), tabelas,
 * alinhamento/recuo por classe e links http(s)/mailto. Tudo fora disso (script,
 * style, iframe, atributo de evento, estilo inline) e removido antes de gravar.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'ol', 'ul', 'li', 'blockquote', 'a', 'span', 'table', 'tbody', 'tr', 'td'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    li: ['data-list', 'class'],
    p: ['class'],
    h1: ['class'],
    h2: ['class'],
    h3: ['class'],
    blockquote: ['class'],
    span: ['class'],
    // Modulo de tabela do Quill 2: cada celula guarda o id da linha em `data-row`.
    td: ['data-row', 'class']
  },
  allowedClasses: {
    '*': [/^ql-align-(center|right|justify)$/, /^ql-indent-[1-8]$/, 'ql-ui']
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' })
  },
  disallowedTagsMode: 'discard'
};

export function sanitizeServiceContractHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

/** Texto corrido do HTML: fim de bloco vira quebra de linha, formatacao some. */
export function serviceContractText(html: string): string {
  const withBreaks = html.replace(/<\/(p|h1|h2|h3|li|blockquote|td|tr)>|<br\s*\/?>/gi, '\n');
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export interface ServiceContractTags {
  /** Tags validas, sem repeticao, na ordem em que aparecem. */
  tags: string[];
  /** Texto entre `[[ ]]` fora do formato (ex.: `[[nome completo]]`). */
  invalidTags: string[];
}

/** Tags detectadas no texto sem marcacao: `[[<b>CPF</b>]]` continua sendo `[[CPF]]`. */
export function extractServiceContractTags(html: string): ServiceContractTags {
  const text = serviceContractText(html);
  const tags: string[] = [];
  for (const match of text.matchAll(TAG_PATTERN)) {
    if (!tags.includes(match[1])) tags.push(match[1]);
  }
  const invalidTags: string[] = [];
  for (const match of text.matchAll(BRACKETED_PATTERN)) {
    if (!/^[A-Z0-9_]+$/.test(match[1]) && !invalidTags.includes(match[0])) invalidTags.push(match[0]);
  }
  return { tags, invalidTags };
}

/** Editor vazio do Quill (`<p><br></p>`) nao conta como conteudo. */
export function isBlankServiceContract(html: string): boolean {
  return serviceContractText(html).trim() === '';
}
