import { closingProblems } from './petition-closing';
import { PetitionBlock, PetitionContent, PetitionRun } from './petition-content';

/**
 * Recusas deterministicas do modo Flow (ADR 020, decisao 6; secoes 11, 13 e 15 do prompt do escritorio).
 * Mesma forma da Analise de Acoes: lista de mensagens em portugues; com qualquer item, nada e gravado.
 * A ementa (bloco `quote`) fica isenta de "—" e "(a)" (texto literal, regra 10.1.2); "{", "}",
 * "nao informado" e ponto duplo valem em tudo. "(...)" e reticencias nao sao ponto duplo.
 */
export interface PetitionValidationOptions {
  /** Prints recortados disponiveis para os blocos `figure`. */
  figureIds: ReadonlySet<string>;
  /** Data de hoje (AAAA-MM-DD): nota com acesso no futuro e recusada. */
  today: string;
}

const EM_DASH = '—';

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Problemas de um texto; `literal` = ementa (isenta de travessao e "(a)"). */
export function textProblems(value: string, literal = false): string[] {
  const problems: string[] = [];
  if (!literal && value.includes(EM_DASH)) problems.push('travessao "—" (use virgula, ponto ou dois-pontos)');
  if (!literal && value.includes('(a)')) problems.push('"(a)" (flexione pelo genero do titular)');
  if (value.includes('{') || value.includes('}')) problems.push('chave "{" ou "}"');
  if (fold(value).includes('nao informado')) problems.push('"nao informado" (omita o campo ou use XXXX)');
  if (/(?<!\.)\.\.(?!\.)/.test(value)) problems.push('ponto duplo ("S.A..")');
  return problems;
}

function isValidDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function footnoteProblems(run: PetitionRun, today: string): string[] {
  if (!run.footnote) return [];
  const problems: string[] = [];
  let url: URL | null = null;
  try {
    url = new URL(run.footnote.url);
  } catch {
    url = null;
  }
  if (!url || !['http:', 'https:'].includes(url.protocol)) problems.push('nota de rodape sem URL http(s) valida');
  if (!isValidDate(run.footnote.accessedAt)) problems.push('nota de rodape com data de acesso invalida');
  else if (run.footnote.accessedAt > today) problems.push('nota de rodape com data de acesso no futuro');
  return problems;
}

const BLOCK_LABEL: Record<PetitionBlock['type'], string> = {
  title: 'titulo',
  heading: 'topico',
  paragraph: 'paragrafo',
  quote: 'ementa',
  table: 'tabela',
  figure: 'figura'
};

export function validatePetitionContent(content: PetitionContent, options: PetitionValidationOptions): string[] {
  const errors: string[] = [];
  const report = (where: string, problems: string[]) => {
    for (const problem of problems) errors.push(`${where}: ${problem}.`);
  };
  const checkRuns = (where: string, runs: PetitionRun[], literal = false) => {
    runs.forEach((run) => {
      report(where, textProblems(run.text, literal));
      report(where, footnoteProblems(run, options.today));
    });
  };

  report('Enderecamento', textProblems(content.addressing));
  report('Nome do arquivo (banco)', textProblems(content.fileBank));
  if (!fileToken(content.fileBank)) errors.push('Nome do arquivo (banco): use letras ou numeros.');
  if (!fileToken(content.clientFirstName)) errors.push('Nome do arquivo (primeiro nome): use letras.');

  let headings = 0;
  content.body.forEach((block, index) => {
    const where = `Bloco ${index + 1} (${BLOCK_LABEL[block.type]})`;
    switch (block.type) {
      case 'title':
      case 'heading':
        if (block.type === 'heading') headings += 1;
        report(where, textProblems(block.text));
        break;
      case 'paragraph':
        checkRuns(where, block.runs);
        break;
      case 'quote':
        checkRuns(where, block.runs, true);
        if (!block.runs.some((run) => run.footnote)) errors.push(`${where}: a ementa precisa da nota de rodape com o link do acordao.`);
        break;
      case 'table':
        block.header.forEach((cell) => report(where, textProblems(cell)));
        block.rows.forEach((row, rowIndex) => {
          if (row.length !== block.header.length) errors.push(`${where}, linha ${rowIndex + 1}: ${row.length} colunas, o cabecalho tem ${block.header.length}.`);
          row.forEach((cell) => report(where, textProblems(cell)));
        });
        if (block.totalRow) {
          if (block.totalRow.length !== block.header.length) errors.push(`${where}, linha de total: colunas diferentes do cabecalho.`);
          block.totalRow.forEach((cell) => report(where, textProblems(cell)));
        }
        break;
      case 'figure':
        if (!options.figureIds.has(block.figureId)) errors.push(`${where}: print "${block.figureId}" nao foi recortado nesta execucao.`);
        report(where, textProblems(block.caption));
        break;
    }
  });
  if (headings === 0) errors.push('A peca precisa de topicos (I. GRATUIDADE DA JUSTICA., II. FATOS. ...).');
  errors.push(...closingProblems(content));

  const calc = content.calculation;
  checkRuns('Memoria de calculo', calc.intro);
  calc.contracts.forEach((row, index) => report(`Memoria de calculo, linha ${index + 1}`, Object.values(row).flatMap((cell) => textProblems(cell))));
  calc.ceiling.forEach((row, index) => report(`Verificacao do teto, linha ${index + 1}`, [...textProblems(row.label), ...textProblems(row.value)]));
  report('Memoria de calculo (total e valor da causa)', [...textProblems(calc.total), ...textProblems(calc.causeValue)]);
  return errors;
}

/** Trecho do nome do arquivo: sem acento, so letras, numeros e "_" (espacos viram nada). */
export function fileToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Inicial_[JEC|JEF]_[Banco]_[PrimeiroNome].docx (secao 11 do prompt). */
export function petitionFileName(content: Pick<PetitionContent, 'court' | 'fileBank' | 'clientFirstName'>): string {
  return `Inicial_${content.court.toUpperCase()}_${fileToken(content.fileBank)}_${fileToken(content.clientFirstName)}.docx`;
}
