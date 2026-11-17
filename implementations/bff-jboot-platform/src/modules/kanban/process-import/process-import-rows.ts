import { isValidCpf, normalizeCpf } from '../../shared/documents/cpf';
import { inferCnjTribunal, normalizeCnj } from '../../shared/documents/cnj';

/**
 * Validacao pura das linhas da planilha (docs/product/flow-process-import-sprints.md, Sprint 1). Nao
 * consulta banco: o que depende do tenant (numero ja usado, cliente existente) e somado pelo servico.
 */

export const MAX_IMPORT_ROWS = 2000;

export interface ImportRowInput {
  line: number;
  name?: string | null;
  cpf?: string | null;
  processNumber?: string | null;
  /** Coluna ESTADO da planilha (ex.: TRF1); so serve para conferir o tribunal do numero. */
  state?: string | null;
  /** Coluna STATUS da planilha; vira o primeiro comentario do card. */
  situation?: string | null;
}

export type RowProblem =
  | 'name_missing'
  | 'cpf_invalid'
  | 'process_number_invalid'
  | 'process_number_tribunal_unknown'
  | 'duplicate_in_sheet';

export type RowWarning = 'state_mismatch' | 'cpf_name_differs_in_sheet';

export interface ValidatedRow {
  line: number;
  name: string | null;
  cpf: string | null;
  processNumber: string | null;
  tribunal: string | null;
  situation: string | null;
  problems: RowProblem[];
  warnings: RowWarning[];
}

const SPACES = /\s+/g;

function clean(value: string | null | undefined, max: number): string | null {
  const text = (value ?? '').replace(SPACES, ' ').trim();
  return text ? text.slice(0, max) : null;
}

/** "TRF 1", "trf1", "TJ-SP" -> "TRF1"/"TJSP"; comparado com o tribunal inferido do numero. */
export function normalizeState(value: string | null | undefined): string | null {
  const text = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return text || null;
}

export function validateRows(rows: ImportRowInput[]): ValidatedRow[] {
  const seenNumbers = new Set<string>();
  const namesByCpf = new Map<string, string>();
  return rows.map((row): ValidatedRow => {
    const problems: RowProblem[] = [];
    const warnings: RowWarning[] = [];
    const name = clean(row.name, 160);
    if (!name) problems.push('name_missing');
    const cpf = isValidCpf(row.cpf ?? '') ? normalizeCpf(row.cpf ?? '') : null;
    if (!cpf) problems.push('cpf_invalid');
    const processNumber = normalizeCnj((row.processNumber ?? '').trim());
    const tribunal = processNumber ? inferCnjTribunal(processNumber) : null;
    if (!processNumber) problems.push('process_number_invalid');
    else if (!tribunal) problems.push('process_number_tribunal_unknown');
    const state = normalizeState(row.state);
    if (state && tribunal && state !== tribunal) warnings.push('state_mismatch');
    if (processNumber) {
      if (seenNumbers.has(processNumber)) problems.push('duplicate_in_sheet');
      else seenNumbers.add(processNumber);
    }
    if (cpf && name) {
      const previous = namesByCpf.get(cpf);
      if (previous && previous.toUpperCase() !== name.toUpperCase()) warnings.push('cpf_name_differs_in_sheet');
      if (!previous) namesByCpf.set(cpf, name);
    }
    return { line: row.line, name, cpf, processNumber, tribunal, situation: clean(row.situation, 200), problems, warnings };
  });
}
