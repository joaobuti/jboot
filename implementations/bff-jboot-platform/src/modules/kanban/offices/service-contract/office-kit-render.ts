import { createHash } from 'node:crypto';
import PizZip from 'pizzip';
import {
  decodeXmlText,
  extractZipEntries,
  inspectDocxPackage,
  readZipDirectory,
  TEMPLATE_LIMITS,
  TemplateLimits,
  TemplateRejection
} from '../../document-templates/docx-package';

/**
 * Montagem do kit do escritorio (Sprint 4; ADR 019, decisoes 5 a 8 e 19). Funcao pura, na worker thread
 * dos `.docx`. Trabalha sobre o XML do Word, nao com o docxtemplater: os blocos `[[SE_X]]` e a linha-molde
 * `_1` nao cabem na sintaxe dele sem reescrever as tags, e as marcas de genero e plural ficam fora das tags.
 *
 * 1. Em cada paragrafo, tag ou marca que o Word dividiu em varios runs vai inteira para o primeiro run
 *    (a formatacao do inicio da tag vale para o valor).
 * 2. Linha de tabela com tag `_1` de contrato e repetida uma vez por contrato (`_1`, `_2`, ...); as linhas
 *    fixas `_2`, `_3`... do modelo saem (a `_1` e o molde) e a celula "1" da numeracao vira o numero da linha.
 * 3. Declaracao de Residencia do modelo sai do kit (decisao 15: o cliente ja envia a assinada).
 * 4. Termo de renuncia: com blocos, o JEC ou JEF nao escolhido sai inteiro; sem blocos (modelo validado do
 *    escritorio), JEF troca o trecho "RENUNCIA expressamente..." pelo texto da regra 4 do prompt do escritorio.
 * 5. Tag com valor e substituida e perde o destaque amarelo do modelo; sem valor fica `[[TAG]]` destacada
 *    para o advogado (Q1).
 * 6. Marcas: genero pelo `gender`; plural de contrato(s), emprestimo(s), parcela(s) e desconto(s) pela
 *    quantidade de contratos, as demais pela de instituicoes (decisao do usuario, 2026-10-28). Artigo ou
 *    preposicao com marca logo antes de uma dessas palavras (`pelo(s) contrato(s)`) segue a mesma
 *    quantidade. Marca nao reconhecida ou sem dado para resolver fica com o texto original (Q3).
 */

export interface OfficeKitRenderInput {
  /** Valores revisados por tag (sem as calculadas). */
  values: Record<string, string>;
  gender: 'masculino' | 'feminino' | null;
  waiverCourt: 'jec' | 'jef';
  /** Data da geracao (ISO), base de `DATA_POR_EXTENSO`. */
  generatedAt: string;
}

export interface OfficeKitRenderReport {
  /** Tags que ficaram `[[TAG]]` no arquivo, sem repeticao. */
  emptyTags: string[];
  /** Marcas que ficaram com o texto original (nao reconhecidas ou sem genero/quantidade). */
  unresolvedMarks: string[];
  contracts: number;
  institutions: number;
  warnings: Array<{ code: string; detail?: string }>;
}

export interface OfficeKitRenderSuccess {
  ok: true;
  file: Uint8Array;
  sha256: string;
  report: OfficeKitRenderReport;
}

export interface OfficeKitRenderFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

const W_T = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
const PARAGRAPH = /<w:p\b[\s\S]*?<\/w:p>/g;
const ROW = /<w:tr\b[\s\S]*?<\/w:tr>/g;
const LETTER = 'A-Za-zÀ-ÖØ-öø-ÿ';
const TOKEN = new RegExp(`\\[\\[[A-Z0-9_]+\\]\\]|[${LETTER}]+\\([${LETTER}]{1,4}\\)`, 'g');
const MARK = new RegExp(`^([${LETTER}]+)\\(([${LETTER}]{1,4})\\)$`);
const LOAN_TAG = /^(BANCO|CONTRATO|INICIO|VALOR|PARCELAS)_([1-9][0-9]{0,2})$/;
const LOAN_TEMPLATE = /\[\[(BANCO|CONTRATO|INICIO|VALOR|PARCELAS)_1\]\]/g;
const BLOCK_TAG = /^(FIM_)?SE_([A-Z0-9_]+)$/;
const WAIVER_BLOCKS = ['JEC', 'JEF'];
const TEXT_PART = /^word\/(document|header\d*|footer\d*)\.xml$/;
/** Palavras cujo plural segue a quantidade de contratos (sem acento, minusculas). */
const CONTRACT_WORDS = new Set(['contrato', 'emprestimo', 'parcela', 'desconto']);
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MAX_LOANS = 200;
const RUN = /<w:r\b[\s\S]*?<\/w:r>/g;
const HIGHLIGHT = /<w:highlight\b[^>]*\/>/g;
const PAGE_BREAK = /<w:br\b[^>]*w:type="page"/;
/** Titulo da secao que sai do kit (ADR 019, decisao 15). */
const RESIDENCE_DECLARATION = 'declaracao de residencia';
/** Regra 4 do prompt do escritorio (Termo de Renuncia no JEF, art. 3 da Lei 10.259/2001). */
const WAIVER_JEC_SPAN = /expressamente[\s\S]*$/;
const WAIVER_JEF_TEXT =
  'expressamente ao valor que, somadas as parcelas vencidas e 12 (doze) vincendas, exceder 60 (sessenta) salários mínimos ' +
  'na data da propositura da ação, nos termos do art. 3º da Lei nº 10.259/2001.';

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textNode(text: string): string {
  return `<w:t xml:space="preserve">${escapeXml(text)}</w:t>`;
}

function plainText(xml: string): string {
  return [...xml.matchAll(W_T)].map((match) => decodeXmlText(match[1])).join('');
}

/**
 * Junta no primeiro `w:t` cada trecho do paragrafo que casa com `pattern` (global) e esta dividido em
 * varios runs; `replace` troca o trecho ja inteiro. Sem `replace`, so junta.
 */
function mergeSpans(paragraph: string, pattern: RegExp, replace?: (span: string) => string): string {
  const nodes = [...paragraph.matchAll(W_T)];
  if (nodes.length === 0) return paragraph;
  const texts = nodes.map((node) => decodeXmlText(node[1]));
  const full = texts.join('');
  const owner: number[] = [];
  texts.forEach((text, index) => {
    for (let char = 0; char < text.length; char += 1) owner.push(index);
  });
  const spans: Array<{ start: number; end: number }> = [];
  let split = false;
  for (const match of full.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (end === start) continue;
    if (owner[end - 1] !== owner[start]) split = true;
    spans.push({ start, end });
  }
  if (spans.length === 0 || (!replace && !split)) return paragraph;
  for (const span of spans) {
    for (let char = span.start; char < span.end; char += 1) owner[char] = owner[span.start];
  }
  const rebuilt = texts.map(() => '');
  let spanIndex = 0;
  for (let char = 0; char < full.length; char += 1) {
    const span = spans[spanIndex];
    if (replace && span && char === span.start) {
      rebuilt[owner[char]] += replace(full.slice(span.start, span.end));
      char = span.end - 1;
      spanIndex += 1;
      continue;
    }
    rebuilt[owner[char]] += full[char];
  }
  let index = 0;
  return paragraph.replace(W_T, () => textNode(rebuilt[index++]));
}

/** Passo 1: cada tag/marca dividida em varios `w:t` do paragrafo vai inteira para o primeiro deles. */
export function mergeSplitTokens(paragraph: string): string {
  return mergeSpans(paragraph, TOKEN);
}

/**
 * Passo 3: tira a Declaracao de Residencia (do titulo ate a proxima quebra de pagina ou o fim do corpo),
 * com a quebra de pagina que a abre. Devolve o XML sem mudanca quando o modelo nao tem a secao.
 */
export function removeResidenceDeclaration(xml: string): { xml: string; removed: boolean } {
  const paragraphs = [...xml.matchAll(PARAGRAPH)];
  const headingIndex = paragraphs.findIndex((item) => foldAccents(plainText(item[0])).trim() === RESIDENCE_DECLARATION);
  if (headingIndex < 0) return { xml, removed: false };
  const isPageBreak = (index: number) => PAGE_BREAK.test(paragraphs[index][0]) && plainText(paragraphs[index][0]).trim() === '';
  const first = headingIndex > 0 && isPageBreak(headingIndex - 1) ? headingIndex - 1 : headingIndex;
  let next = headingIndex + 1;
  while (next < paragraphs.length && !isPageBreak(next)) next += 1;
  const start = paragraphs[first].index ?? 0;
  const bodyEnd = Math.max(xml.lastIndexOf('<w:sectPr'), 0) || xml.lastIndexOf('</w:body>');
  const end = next < paragraphs.length ? paragraphs[next].index ?? 0 : bodyEnd;
  const slice = xml.slice(start, end);
  if (end <= start || !balanced(slice, /<w:tbl[\s>]/g, '</w:tbl>') || !balanced(slice, /<w:tc[\s>]/g, '</w:tc>')) return { xml, removed: false };
  return { xml: xml.slice(0, start) + xml.slice(end), removed: true };
}

const LOAN_ANY = /\[\[(?:BANCO|CONTRATO|INICIO|VALOR|PARCELAS)_([1-9][0-9]{0,2})\]\]/g;
const CELL = /<w:tc\b[\s\S]*?<\/w:tc>/g;

/** Celula so com "1" na linha-molde e a numeracao da linha: vira o numero do contrato. */
function renumber(row: string, number: number): string {
  if (number === 1) return row;
  return row.replace(CELL, (cell) => (plainText(cell).trim() === '1' ? cell.replace(W_T, (whole, raw: string) => (decodeXmlText(raw).trim() === '1' ? textNode(String(number)) : whole)) : cell));
}

/**
 * Passo 2: linha-molde repetida por contrato, com `_1` trocado pelo numero do contrato. Linha fixa do
 * modelo so com contratos `_2`, `_3`... sai: quem cria as linhas e o Flow (decisao 5).
 */
function expandLoanRows(xml: string, loans: number): string {
  return xml.replace(ROW, (row) => {
    const indexes = [...row.matchAll(LOAN_ANY)].map((match) => match[1]);
    if (indexes.length === 0) return row;
    if (!indexes.includes('1')) return '';
    return Array.from({ length: loans }, (_, index) =>
      renumber(row.replace(LOAN_TEMPLATE, (_match, part: string) => `[[${part}_${index + 1}]]`), index + 1)
    ).join('');
  });
}

function balanced(slice: string, open: RegExp, close: string): boolean {
  return (slice.match(open) ?? []).length === slice.split(close).length - 1;
}

function insideCell(xml: string, index: number): boolean {
  const before = xml.slice(0, index);
  return (before.match(/<w:tc[\s>]/g) ?? []).length > before.split('</w:tc>').length - 1;
}

/** Remove o marcador; paragrafo que fica sem texto sai (exceto dentro de celula, que precisa de um). */
function dropMarker(xml: string, marker: string): string {
  const at = xml.indexOf(marker);
  if (at < 0) return xml;
  for (const paragraph of xml.matchAll(PARAGRAPH)) {
    const start = paragraph.index ?? 0;
    const end = start + paragraph[0].length;
    if (at < start || at >= end) continue;
    const cleaned = paragraph[0].replace(marker, '');
    const empty = plainText(cleaned).trim() === '' && !/<w:(drawing|pict|object)\b/.test(cleaned) && !insideCell(xml, start);
    return xml.slice(0, start) + (empty ? '' : cleaned) + xml.slice(end);
  }
  return xml.replace(marker, '');
}

/**
 * Passo 4, modelo sem blocos: JEF troca o fim do paragrafo "RENUNCIA expressamente..." pelo texto da regra 4
 * e "Juizado Especial Civel" por "Juizado Especial Federal" no mesmo paragrafo. Devolve se aplicou.
 */
function applyWaiverText(xml: string): { xml: string; applied: boolean } {
  let applied = false;
  const next = xml.replace(PARAGRAPH, (paragraph) => {
    if (applied || !/RENUNCIA\s+expressamente/i.test(plainText(paragraph))) return paragraph;
    applied = true;
    const court = mergeSpans(paragraph, /Juizado Especial C[ií]vel/g, () => 'Juizado Especial Federal');
    return mergeSpans(court, new RegExp(WAIVER_JEC_SPAN.source, 'g'), () => WAIVER_JEF_TEXT);
  });
  return { xml: next, applied };
}

/** Passo 4: bloco nao escolhido sai inteiro, do paragrafo da abertura ao do fechamento. */
function applyBlocks(xml: string, keep: string, warnings: OfficeKitRenderReport['warnings']): string {
  let current = xml;
  for (let guard = 0; guard < 50; guard += 1) {
    const open = /\[\[SE_([A-Z0-9_]+)\]\]/.exec(current);
    if (!open) break;
    const name = open[1];
    const openMarker = `[[SE_${name}]]`;
    const closeMarker = `[[FIM_SE_${name}]]`;
    const closeAt = current.indexOf(closeMarker, open.index);
    if (WAIVER_BLOCKS.includes(name) && name !== keep && closeAt > 0) {
      const paragraphs = [...current.matchAll(PARAGRAPH)];
      const containing = (at: number) => paragraphs.find((item) => (item.index ?? 0) <= at && at < (item.index ?? 0) + item[0].length);
      const first = containing(open.index);
      const last = containing(closeAt);
      if (first && last) {
        const start = first.index ?? 0;
        const end = (last.index ?? 0) + last[0].length;
        const slice = current.slice(start, end);
        if (balanced(slice, /<w:tbl[\s>]/g, '</w:tbl>') && balanced(slice, /<w:tc[\s>]/g, '</w:tc>')) {
          current = current.slice(0, start) + current.slice(end);
          continue;
        }
      }
      warnings.push({ code: 'block_not_removed', detail: `O bloco ${openMarker} nao pode ser removido sem quebrar o documento; apague o trecho no Word.` });
    }
    current = dropMarker(dropMarker(current, openMarker), closeMarker);
  }
  return current;
}

function foldAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function feminine(word: string, suffix: string): string {
  if (word.endsWith('o')) return `${word.slice(0, -1)}a`;
  if (word.endsWith('O')) return `${word.slice(0, -1)}A`;
  return word + suffix;
}

function plural(word: string, suffix: string): string {
  if (foldAccents(suffix) === 'oes' && foldAccents(word).endsWith('ao')) {
    const upper = word.slice(-2) === word.slice(-2).toUpperCase();
    return word.slice(0, -2) + (upper ? 'ÕES' : 'ões');
  }
  return word + suffix;
}

/** "28 de outubro de 2026", no fuso de Brasilia. */
export function dateInFull(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return `${get('day')} de ${MONTHS[get('month') - 1]} de ${get('year')}`;
}

/** "A", "A e B", "A, B e C". */
function joinList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

interface Context {
  values: Record<string, string>;
  computed: Record<string, string>;
  gender: OfficeKitRenderInput['gender'];
  contracts: number;
  institutions: number;
  emptyTags: Set<string>;
  unresolvedMarks: Set<string>;
}

const NEXT_MARKED_WORD = new RegExp(`^\\s+([${LETTER}]+)\\(`);

function resolveToken(token: string, ctx: Context, following = ''): string {
  if (token.startsWith('[[')) {
    const tag = token.slice(2, -2);
    if (BLOCK_TAG.test(tag)) return '';
    const value = (ctx.computed[tag] ?? ctx.values[tag] ?? '').trim();
    if (value) return value;
    ctx.emptyTags.add(tag);
    return token;
  }
  const [, word, suffix] = MARK.exec(token) ?? [];
  if (!word) return token;
  if (/^a$/i.test(suffix)) {
    if (!ctx.gender) {
      ctx.unresolvedMarks.add(token);
      return token;
    }
    return ctx.gender === 'feminino' ? feminine(word, suffix) : word;
  }
  if (/^(s|es|ões)$/i.test(suffix)) {
    const next = NEXT_MARKED_WORD.exec(following)?.[1] ?? '';
    const aboutContracts = CONTRACT_WORDS.has(foldAccents(word)) || CONTRACT_WORDS.has(foldAccents(next));
    const count = aboutContracts ? ctx.contracts : ctx.institutions;
    if (count === 0) {
      ctx.unresolvedMarks.add(token);
      return token;
    }
    return count > 1 ? plural(word, suffix) : word;
  }
  ctx.unresolvedMarks.add(token);
  return token;
}

/**
 * Passos 5 e 6 em cada run (tags e marcas ja inteiras pelo passo 1). Run alterado sem tag restante perde o
 * destaque amarelo do modelo (regra 2 do prompt do escritorio); tag sem valor continua destacada.
 */
function replaceTokens(xml: string, ctx: Context): string {
  return xml.replace(RUN, (run) => {
    let changed = false;
    let left = false;
    const next = run.replace(W_T, (whole, raw: string) => {
      const text = decodeXmlText(raw);
      const resolved = text.replace(TOKEN, (token: string, offset: number) => resolveToken(token, ctx, text.slice(offset + token.length)));
      if (/\[\[[A-Z0-9_]+\]\]/.test(resolved)) left = true;
      if (resolved === text) return whole;
      changed = true;
      return textNode(resolved);
    });
    return changed && !left ? next.replace(HIGHLIGHT, '') : next;
  });
}

/** Contratos devolvidos (pelo maior `_n` com valor) e instituicoes distintas, na ordem dos contratos. */
function loanFacts(values: Record<string, string>): { loans: number; banks: string[] } {
  let loans = 0;
  const banks: Array<{ n: number; name: string }> = [];
  for (const [tag, value] of Object.entries(values)) {
    const loan = LOAN_TAG.exec(tag);
    if (!loan || !value.trim()) continue;
    loans = Math.max(loans, Number(loan[2]));
    if (loan[1] === 'BANCO') banks.push({ n: Number(loan[2]), name: value.trim() });
  }
  const distinct = new Map<string, string>();
  for (const bank of banks.sort((a, b) => a.n - b.n)) {
    const key = foldAccents(bank.name).replace(/\s+/g, ' ');
    if (!distinct.has(key)) distinct.set(key, bank.name);
  }
  return { loans: Math.min(loans, MAX_LOANS), banks: [...distinct.values()] };
}

export function renderOfficeKitFiles(
  files: Map<string, Buffer>,
  input: OfficeKitRenderInput
): { files: Map<string, Buffer>; report: OfficeKitRenderReport } {
  inspectDocxPackage(files);
  const { loans, banks } = loanFacts(input.values);
  const ctx: Context = {
    values: input.values,
    computed: {
      DATA_POR_EXTENSO: dateInFull(input.generatedAt),
      ...(banks.length > 0 ? { LISTA_BANCOS: joinList(banks) } : {})
    },
    gender: input.gender,
    contracts: loans,
    institutions: banks.length,
    emptyTags: new Set(),
    unresolvedMarks: new Set()
  };
  const warnings: OfficeKitRenderReport['warnings'] = [];
  const out = new Map(files);
  for (const [name, content] of files) {
    if (!TEXT_PART.test(name)) continue;
    let xml = content.toString('utf8').replace(PARAGRAPH, (paragraph) => mergeSplitTokens(paragraph));
    xml = expandLoanRows(xml, Math.max(loans, 1));
    if (name === 'word/document.xml') xml = removeResidenceDeclaration(xml).xml;
    const hasBlocks = /\[\[SE_(JEC|JEF)\]\]/.test(xml);
    xml = applyBlocks(xml, input.waiverCourt.toUpperCase(), warnings);
    if (name === 'word/document.xml' && input.waiverCourt === 'jef' && !hasBlocks) {
      const waiver = applyWaiverText(xml);
      xml = waiver.xml;
      if (!waiver.applied) warnings.push({ code: 'waiver_jef_not_applied', detail: 'O modelo nao tem o trecho "RENUNCIA expressamente" nem os blocos JEC/JEF: o kit saiu com o texto do modelo.' });
    }
    xml = replaceTokens(xml, ctx);
    out.set(name, Buffer.from(xml, 'utf8'));
  }
  return {
    files: out,
    report: { emptyTags: [...ctx.emptyTags], unresolvedMarks: [...ctx.unresolvedMarks], contracts: loans, institutions: banks.length, warnings }
  };
}

/** Entrada da worker thread: le o modelo com os limites, monta e compacta o kit. */
export function renderOfficeKitDocx(
  buffer: Buffer,
  input: OfficeKitRenderInput,
  limits: TemplateLimits = TEMPLATE_LIMITS
): OfficeKitRenderSuccess | OfficeKitRenderFailure {
  try {
    const files = extractZipEntries(buffer, readZipDirectory(buffer, limits));
    const rendered = renderOfficeKitFiles(files, input);
    const zip = new PizZip();
    for (const [name, content] of rendered.files) zip.file(name, content);
    const file = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    return { ok: true, file: new Uint8Array(file), sha256: createHash('sha256').update(file).digest('hex'), report: rendered.report };
  } catch (error) {
    if (error instanceof TemplateRejection) {
      return { ok: false, status: error.status, code: error.code, message: error.message, details: error.details };
    }
    return { ok: false, status: 422, code: 'office_kit_render_failed', message: 'The kit could not be generated', details: {} };
  }
}
