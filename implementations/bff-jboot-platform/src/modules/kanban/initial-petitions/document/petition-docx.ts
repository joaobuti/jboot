import { createHash } from 'node:crypto';
import {
  AlignmentType,
  Document,
  FootnoteReferenceRun,
  HighlightColor,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import {
  CALCULATION_CONTRACT_HEADER,
  CALCULATION_TITLE,
  CEILING_TITLE,
  PetitionBlock,
  PetitionContent,
  PetitionRun,
  PRIORITY_LINE
} from './petition-content';
import type { PetitionClosingLine } from './petition-closing';
import { petitionFileName } from './petition-validation';

/**
 * Montagem deterministica da peticao no modo Flow (ADR 020; secao 11 do prompt do escritorio):
 * A4, margens 3/3/2/2 cm, Bookman Old Style 11, justificado, espacamento simples, recuo de primeira
 * linha de 3 cm; ementa com recuo esquerdo de 4 cm e fonte 10; titulos em negrito, a esquerda e
 * "manter com o proximo"; nota de rodape real em Bookman 9; XXXX realcado em amarelo; tabelas com
 * cabecalho #1F3864 e letra branca e total #D9E2F3; memoria de calculo depois de quebra de pagina;
 * legenda da figura em italico 9. O texto vem da rotina ja conferido por `validatePetitionContent`.
 * Funcao pura: o mesmo conteudo gera o mesmo texto e a mesma formatacao; mudam so as datas do pacote e
 * o id interno de desenho (`wp:docPr`), que a biblioteca numera por processo.
 */
export const PETITION_FONT = 'Bookman Old Style';
const BODY_SIZE = 22; // meio-ponto: 11 pt
const QUOTE_SIZE = 20; // 10 pt
const NOTE_SIZE = 18; // 9 pt
const TABLE_SIZE = 18; // 9 pt: a tabela de 7 colunas cabe na largura util
/** mm -> twip arredondado (o `convertMillimetersToTwip` da lib trunca: 30 mm viraria 1700, nao 1701). */
export function mmToTwip(mm: number): number {
  return Math.round((mm * 1440) / 25.4);
}
const FIRST_LINE = mmToTwip(30);
const QUOTE_LEFT = mmToTwip(40);
/** Largura util: 210 mm - 30 mm - 20 mm. */
export const TEXT_WIDTH_MM = 160;
const TEXT_WIDTH_PX = Math.round((TEXT_WIDTH_MM / 25.4) * 96);
const HEADER_FILL = '1F3864';
const TOTAL_FILL = 'D9E2F3';
const MONTHS = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

export interface PetitionFigure {
  png: Buffer;
  width: number;
  height: number;
}

export interface BuiltPetition {
  file: Buffer;
  fileName: string;
  sha256: string;
  footnoteCount: number;
}

/** "Disponível em: <URL>. Acesso em: 30 set. 2026." (padrao ABNT do prompt). */
export function footnoteText(url: string, accessedAt: string): string {
  const [year, month, day] = accessedAt.split('-').map(Number);
  return `Disponível em: <${url}>. Acesso em: ${day} ${MONTHS[month - 1]} ${year}.`;
}

/** Quebra o texto nos XXXX para realcar so o dado ausente. */
export function splitPending(value: string): Array<{ text: string; pending: boolean }> {
  return value
    .split(/(X{4,})/)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, pending: /^X{4,}$/.test(part) }));
}

class FootnoteCollector {
  readonly notes: Record<string, { children: Paragraph[] }> = {};
  private next = 1;

  add(url: string, accessedAt: string): number {
    const id = this.next++;
    this.notes[String(id)] = {
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: footnoteText(url, accessedAt), font: PETITION_FONT, size: NOTE_SIZE })]
        })
      ]
    };
    return id;
  }

  get count(): number {
    return this.next - 1;
  }
}

function textRuns(value: string, style: { bold?: boolean; italics?: boolean; size?: number; color?: string }) {
  return splitPending(value).map(
    (part) => new TextRun({ text: part.text, ...style, ...(part.pending ? { highlight: HighlightColor.YELLOW } : {}) })
  );
}

function richRuns(runs: PetitionRun[], notes: FootnoteCollector, size?: number) {
  return runs.flatMap((run) => [
    ...textRuns(run.text, { bold: run.bold, italics: run.italic, size }),
    ...(run.footnote ? [new FootnoteReferenceRun(notes.add(run.footnote.url, run.footnote.accessedAt))] : [])
  ]);
}

const ALIGN = {
  justify: AlignmentType.JUSTIFIED,
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT
} as const;

function cell(value: string, kind: 'header' | 'body' | 'total') {
  return new TableCell({
    ...(kind === 'header' ? { shading: { type: ShadingType.CLEAR, fill: HEADER_FILL, color: 'auto' } } : {}),
    ...(kind === 'total' ? { shading: { type: ShadingType.CLEAR, fill: TOTAL_FILL, color: 'auto' } } : {}),
    children: [
      new Paragraph({
        alignment: kind === 'body' ? AlignmentType.LEFT : AlignmentType.CENTER,
        children: textRuns(value, {
          size: TABLE_SIZE,
          bold: kind !== 'body',
          ...(kind === 'header' ? { color: 'FFFFFF' } : {})
        })
      })
    ]
  });
}

function table(header: string[], rows: string[][], totalRow?: string[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((value) => cell(value, 'header')) }),
      ...rows.map((row) => new TableRow({ children: row.map((value) => cell(value, 'body')) })),
      ...(totalRow ? [new TableRow({ children: totalRow.map((value) => cell(value, 'total')) })] : [])
    ]
  });
}

function heading(text: string, alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) {
  return new Paragraph({ alignment, keepNext: true, keepLines: true, spacing: { before: 240, after: 120 }, children: textRuns(text, { bold: true }) });
}

function figure(block: Extract<PetitionBlock, { type: 'figure' }>, figures: ReadonlyMap<string, PetitionFigure>) {
  const image = figures.get(block.figureId);
  if (!image) throw new Error(`figure_missing:${block.figureId}`);
  const scale = Math.min(1, TEXT_WIDTH_PX / image.width);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      children: [
        new ImageRun({
          type: 'png',
          data: image.png,
          transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) }
        })
      ]
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: textRuns(block.caption, { italics: true, size: NOTE_SIZE }) })
  ];
}

function bodyBlock(block: PetitionBlock, notes: FootnoteCollector, figures: ReadonlyMap<string, PetitionFigure>) {
  switch (block.type) {
    case 'title':
      return [heading(block.text, AlignmentType.CENTER)];
    case 'heading':
      return [heading(block.text)];
    case 'paragraph':
      return [
        new Paragraph({
          alignment: ALIGN[block.align ?? 'justify'],
          indent: block.noIndent || (block.align && block.align !== 'justify') ? undefined : { firstLine: FIRST_LINE },
          spacing: { after: 120 },
          children: richRuns(block.runs, notes)
        })
      ];
    case 'quote':
      return [
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: QUOTE_LEFT },
          spacing: { after: 240 },
          children: richRuns(block.runs, notes, QUOTE_SIZE)
        })
      ];
    case 'table':
      return [table(block.header, block.rows, block.totalRow), new Paragraph({ children: [] })];
    case 'figure':
      return figure(block, figures);
  }
}

/** Fecho do Flow, depois do corpo: a esquerda, sem recuo; o bloco nao se separa da ultima linha. */
function closingSection(lines: readonly PetitionClosingLine[]) {
  return lines.map(
    (line, index) =>
      new Paragraph({
        alignment: AlignmentType.LEFT,
        keepNext: index < lines.length - 1,
        keepLines: true,
        spacing: { before: index === 0 ? 240 : 0, after: 120 },
        children: textRuns(line.text, { bold: line.bold })
      })
  );
}

function calculationSection(content: PetitionContent, notes: FootnoteCollector) {
  const calc = content.calculation;
  return [
    new Paragraph({ pageBreakBefore: true, alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 240 }, children: textRuns(CALCULATION_TITLE, { bold: true }) }),
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { firstLine: FIRST_LINE }, spacing: { after: 240 }, children: richRuns(calc.intro, notes) }),
    table(
      CALCULATION_CONTRACT_HEADER,
      calc.contracts.map((row) => [row.topic, row.contract, row.installment, row.firstDiscount, row.lastDiscount, row.quantity, row.simpleValue]),
      ['TOTAL', '', '', '', '', '', calc.total]
    ),
    new Paragraph({ children: [] }),
    heading(CEILING_TITLE),
    table(['Item', 'Valor'], calc.ceiling.map((row) => [row.label, row.value]), ['VALOR DA CAUSA', calc.causeValue])
  ];
}

export async function buildPetitionDocx(
  content: PetitionContent,
  figures: ReadonlyMap<string, PetitionFigure> = new Map(),
  closing: readonly PetitionClosingLine[] = []
): Promise<BuiltPetition> {
  const notes = new FootnoteCollector();
  const children = [
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 240 }, children: textRuns(content.addressing, { bold: true }) }),
    ...(content.elderlyPriority
      ? [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 240 }, children: textRuns(PRIORITY_LINE, { bold: true }) })]
      : []),
    ...content.body.flatMap((block) => bodyBlock(block, notes, figures)),
    ...closingSection(closing),
    ...calculationSection(content, notes)
  ];
  const document = new Document({
    creator: 'JBoot Flow',
    title: petitionFileName(content).replace(/\.docx$/, ''),
    styles: {
      default: {
        document: {
          run: { font: PETITION_FONT, size: BODY_SIZE },
          paragraph: { spacing: { line: 240 } }
        }
      }
    },
    footnotes: notes.notes,
    sections: [
      {
        properties: {
          page: {
            size: { width: mmToTwip(210), height: mmToTwip(297) },
            margin: {
              top: mmToTwip(30),
              left: mmToTwip(30),
              bottom: mmToTwip(20),
              right: mmToTwip(20)
            }
          }
        },
        children
      }
    ]
  });
  const file = await Packer.toBuffer(document);
  return { file, fileName: petitionFileName(content), sha256: createHash('sha256').update(file).digest('hex'), footnoteCount: notes.count };
}
