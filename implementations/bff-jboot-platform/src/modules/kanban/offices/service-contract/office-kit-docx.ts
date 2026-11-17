import { createHash } from 'node:crypto';
import {
  decodeXmlText,
  extractZipEntries,
  inspectDocxPackage,
  readZipDirectory,
  TEMPLATE_LIMITS,
  TemplateLimits,
  TemplateRejection,
  TemplateWarning
} from '../../document-templates/docx-package';
import { removeResidenceDeclaration } from './office-kit-render';

/**
 * Analise do `.docx` do kit do escritorio (Sprint 3; ADR 019, decisoes 5 a 7 e 14). Funcao pura,
 * executada na worker thread dos `.docx` do Flow. O arquivo e dado nao confiavel:
 *
 * 1. mesmos limites anti zip-bomb e mesma recusa de macro, OLE/ActiveX e vinculo externo dos modelos
 *    de documento (`docx-package`);
 * 2. tags `[[ASSIM]]` lidas no texto de cada paragrafo, com os runs juntados (formatacao no meio da
 *    tag nao a quebra); texto entre `[[ ]]` fora do formato vira aviso;
 * 3. blocos `[[SE_X]]`...`[[FIM_SE_X]]`: abertos e fechados, sem bloco dentro de bloco;
 * 4. linha-molde: toda tag `_1` de contrato fica dentro de uma linha de tabela;
 * 5. marcas de genero e plural (`portador(a)`, `da(s)`, `instituicao(oes)`) separadas em reconhecidas e
 *    nao reconhecidas. Nao bloqueiam: na geracao, a nao reconhecida fica com o texto original (Q3).
 *
 * O modelo validado do escritorio entra como esta (decisao do usuario, 2026-10-29): linhas fixas `_2`,
 * renuncia sem blocos e Declaracao de Residencia sao tratadas na montagem. A Declaracao sai antes da
 * leitura, entao as tags dela nao entram na lista pedida a IA.
 */

/** Tag do modelo: `[[` + maiusculas, digitos ou `_` + `]]`. */
const TAG_PATTERN = /\[\[([A-Z0-9_]+)\]\]/g;
/** Qualquer coisa entre `[[ ]]` (para apontar tag mal escrita). */
const BRACKETED_PATTERN = /\[\[([^[\]]{1,80})\]\]/g;
const BLOCK_TAG = /^(FIM_)?SE_([A-Z0-9_]+)$/;
const KNOWN_BLOCKS = ['JEC', 'JEF'];
/** Conjunto de cada contrato; a linha com `_1` e o molde repetido pelo Flow. */
const LOAN_TAG = /^(BANCO|CONTRATO|INICIO|VALOR|PARCELAS)_([1-9][0-9]{0,2})$/;
/** Marca colada na palavra: `portador(a)`, `o(a)`, `DO(A)`, `da(s)`, `instituição(ões)`. */
const MARK_PATTERN = /([A-Za-zÀ-ÖØ-öø-ÿ]+)\(([A-Za-zÀ-ÖØ-öø-ÿ]{1,4})\)/g;
const GENDER_SUFFIX = /^a$/i;
const PLURAL_SUFFIX = /^(s|es|ões)$/i;
/** Partes do pacote com texto do kit (corpo, cabecalhos e rodapes). */
const TEXT_PART = /^word\/(document|header\d*|footer\d*)\.xml$/;
const MAX_DETAIL = 120;

export type KitMarkKind = 'gender' | 'plural';

export interface KitMark {
  mark: string;
  count: number;
}

export interface OfficeKitAnalysis {
  tags: string[];
  invalidTags: string[];
  blocks: string[];
  loanRowTags: string[];
  marks: { gender: KitMark[]; plural: KitMark[]; unrecognized: KitMark[] };
  warnings: TemplateWarning[];
}

export interface OfficeKitAnalysisSuccess extends OfficeKitAnalysis {
  ok: true;
  sha256: string;
}

export interface OfficeKitAnalysisFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type OfficeKitAnalysisOutcome = OfficeKitAnalysisSuccess | OfficeKitAnalysisFailure;

function reject(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new TemplateRejection(422, code, message, details);
}

/** Texto visivel de um trecho WordprocessingML: runs juntados por paragrafo. */
function paragraphsOf(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((paragraph) =>
    decodeXmlText([...paragraph[0].matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join(''))
  );
}

function tagsOf(text: string): string[] {
  return [...text.matchAll(TAG_PATTERN)].map((match) => match[1]);
}

function countMarks(text: string, into: Map<string, number>, kind: (suffix: string) => boolean): void {
  for (const match of text.matchAll(MARK_PATTERN)) {
    if (kind(match[2])) into.set(match[0], (into.get(match[0]) ?? 0) + 1);
  }
}

function sortedMarks(counts: Map<string, number>): KitMark[] {
  return [...counts.entries()].map(([mark, count]) => ({ mark, count })).sort((a, b) => b.count - a.count || a.mark.localeCompare(b.mark));
}

/** Blocos em ordem de documento: abertos e fechados, sem aninhamento. Devolve os nomes. */
function checkBlocks(tags: readonly string[]): string[] {
  const names: string[] = [];
  let open: string | null = null;
  for (const tag of tags) {
    const block = BLOCK_TAG.exec(tag);
    if (!block) continue;
    const [, closing, name] = block;
    if (closing) {
      if (open !== name) {
        reject('service_contract_block_unbalanced', 'A block closes without being opened', { tag: `[[${tag}]]` });
      }
      open = null;
    } else {
      if (open) {
        reject('service_contract_block_nested', 'A block opens inside another block', { tag: `[[${tag}]]`, openBlock: `[[SE_${open}]]` });
      }
      open = name;
      if (!names.includes(name)) names.push(name);
    }
  }
  if (open) reject('service_contract_block_unbalanced', 'A block is never closed', { tag: `[[SE_${open}]]` });
  return names;
}

export function analyzeOfficeKit(files: ReadonlyMap<string, Buffer>): OfficeKitAnalysis {
  const warnings = inspectDocxPackage(files);
  const parts = [...files.keys()].filter((name) => TEXT_PART.test(name)).sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b)));
  const paragraphs: string[] = [];
  const rowTags: string[] = [];
  for (const part of parts) {
    const raw = files.get(part)?.toString('utf8') ?? '';
    const declaration = part === 'word/document.xml' ? removeResidenceDeclaration(raw) : { xml: raw, removed: false };
    if (declaration.removed) {
      warnings.push({ code: 'residence_declaration_removed', detail: 'A Declaracao de Residencia do modelo sai do kit: o cliente ja envia a declaracao assinada.' });
    }
    const xml = declaration.xml;
    paragraphs.push(...paragraphsOf(xml));
    for (const row of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      rowTags.push(...paragraphsOf(row[0]).flatMap(tagsOf));
    }
  }

  const ordered = paragraphs.flatMap(tagsOf);
  const tags = [...new Set(ordered)];
  if (tags.length === 0) {
    reject('service_contract_no_tags', 'The kit has no [[TAG]] to fill');
  }
  const invalidTags = [
    ...new Set(paragraphs.flatMap((text) => [...text.matchAll(BRACKETED_PATTERN)].filter((match) => !/^[A-Z0-9_]+$/.test(match[1])).map((match) => match[0])))
  ];
  const blocks = checkBlocks(ordered);

  // Linha-molde: cada ocorrencia de tag `_1` precisa estar numa linha de tabela.
  const loanTemplate = ordered.filter((tag) => LOAN_TAG.exec(tag)?.[2] === '1');
  const inRows = new Map<string, number>();
  for (const tag of rowTags) inRows.set(tag, (inRows.get(tag) ?? 0) + 1);
  for (const tag of new Set(loanTemplate)) {
    const total = loanTemplate.filter((item) => item === tag).length;
    if ((inRows.get(tag) ?? 0) < total) {
      reject('service_contract_loan_row_outside_table', 'Contract template tags (_1) must be inside a table row', { tag: `[[${tag}]]` });
    }
  }
  const loanRowTags = tags.filter((tag) => LOAN_TAG.exec(tag)?.[2] === '1');

  if (loanRowTags.length === 0) {
    warnings.push({ code: 'loan_row_missing', detail: 'Nenhuma linha-molde de contrato (BANCO_1, CONTRATO_1...) no modelo.' });
  }
  for (const name of blocks.filter((item) => !KNOWN_BLOCKS.includes(item))) {
    warnings.push({ code: 'block_unknown', detail: `Bloco [[SE_${name}]] nao e escolhido pelo Flow (so JEC e JEF); ele sai sempre no kit.`.slice(0, 2 * MAX_DETAIL) });
  }
  const waiverText = paragraphs.some((text) => /RENUNCIA\s+expressamente/i.test(text));
  if (!KNOWN_BLOCKS.every((name) => blocks.includes(name)) && !waiverText) {
    warnings.push({ code: 'waiver_text_missing', detail: 'Termo de renuncia sem o trecho "RENUNCIA expressamente" e sem os blocos JEC/JEF: o kit nao troca para JEF.' });
  }

  const gender = new Map<string, number>();
  const plural = new Map<string, number>();
  const unrecognized = new Map<string, number>();
  for (const text of paragraphs) {
    countMarks(text, gender, (suffix) => GENDER_SUFFIX.test(suffix));
    countMarks(text, plural, (suffix) => PLURAL_SUFFIX.test(suffix));
    countMarks(text, unrecognized, (suffix) => !GENDER_SUFFIX.test(suffix) && !PLURAL_SUFFIX.test(suffix));
  }
  return {
    tags,
    invalidTags,
    blocks,
    loanRowTags,
    marks: { gender: sortedMarks(gender), plural: sortedMarks(plural), unrecognized: sortedMarks(unrecognized) },
    warnings
  };
}

/** Entrada da worker thread: le o pacote com os limites e analisa. Erro vira falha estavel. */
export function analyzeOfficeKitDocx(buffer: Buffer, limits: TemplateLimits = TEMPLATE_LIMITS): OfficeKitAnalysisOutcome {
  try {
    const files = extractZipEntries(buffer, readZipDirectory(buffer, limits));
    return { ok: true, sha256: createHash('sha256').update(buffer).digest('hex'), ...analyzeOfficeKit(files) };
  } catch (error) {
    if (error instanceof TemplateRejection) {
      return { ok: false, status: error.status, code: error.code, message: error.message, details: error.details };
    }
    return { ok: false, status: 422, code: 'template_invalid', message: 'Template could not be processed', details: {} };
  }
}
