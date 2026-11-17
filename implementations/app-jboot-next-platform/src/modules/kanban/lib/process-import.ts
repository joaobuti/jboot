/**
 * Importacao de processos por planilha (docs/product/flow-process-import-sprints.md): leitura do `.xlsx`
 * no navegador e montagem das linhas enviadas ao BFF. O arquivo nao sai do navegador; a validacao de
 * CPF, CNJ e tribunal e do backend (a conferencia mostra o motivo por linha).
 */

export const MAX_IMPORT_ROWS = 2000;
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ImportField = "name" | "cpf" | "processNumber" | "state" | "situation";
export type ColumnMapping = Record<ImportField, number | null>;

export const FIELD_LABEL: Record<ImportField, string> = {
  name: "Nome do cliente",
  cpf: "CPF",
  processNumber: "Número do processo (CNJ)",
  state: "Estado / tribunal (opcional)",
  situation: "Situação / STATUS (opcional)",
};
export const REQUIRED_FIELDS: ImportField[] = ["name", "cpf", "processNumber"];

const HEADER_HINTS: Record<ImportField, string[]> = {
  name: ["NOME", "CLIENTE", "NOME DO CLIENTE"],
  cpf: ["CPF", "DOCUMENTO"],
  processNumber: ["AUTOS", "PROCESSO", "NUMERO DO PROCESSO", "N DO PROCESSO", "CNJ"],
  state: ["ESTADO", "TRIBUNAL", "UF"],
  situation: ["STATUS", "SITUACAO", "FASE"],
};

export interface ParsedSheet {
  headers: string[];
  /** Linhas de dados (sem o cabecalho), cada uma com o numero da linha na planilha. */
  rows: Array<{ line: number; cells: string[] }>;
}

export interface ImportRowPayload {
  line: number;
  name: string;
  cpf: string;
  processNumber: string;
  state?: string;
  situation?: string;
}

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Coluna de cada campo pelo cabecalho (NOME, CPF, AUTOS, ESTADO, STATUS); `null` quando nao achou. */
export function detectColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping = { name: null, cpf: null, processNumber: null, state: null, situation: null } as ColumnMapping;
  (Object.keys(HEADER_HINTS) as ImportField[]).forEach((field) => {
    const index = normalized.findIndex((header) => HEADER_HINTS[field].includes(header));
    mapping[field] = index >= 0 ? index : null;
  });
  return mapping;
}

/** CPF salvo como numero no Excel perde os zeros a esquerda: devolve 11 digitos quando der. */
export function cellCpf(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 && digits.length < 11 && /^\d+$/.test(value.trim()) ? digits.padStart(11, "0") : value.trim();
}

/** Linhas para o BFF; linhas inteiramente vazias ficam de fora. */
export function buildRows(sheet: ParsedSheet, mapping: ColumnMapping): ImportRowPayload[] {
  const cell = (cells: string[], index: number | null) => (index === null ? "" : String(cells[index] ?? "").trim());
  return sheet.rows
    .map(({ line, cells }) => ({
      line,
      name: cell(cells, mapping.name),
      cpf: cellCpf(cell(cells, mapping.cpf)),
      processNumber: cell(cells, mapping.processNumber),
      ...(mapping.state !== null ? { state: cell(cells, mapping.state) } : {}),
      ...(mapping.situation !== null ? { situation: cell(cells, mapping.situation) } : {}),
    }))
    .filter((row) => row.name || row.cpf || row.processNumber);
}

/** Le a primeira aba do `.xlsx` como texto formatado (mantem mascaras como no Excel). */
export async function readSpreadsheet(file: File): Promise<ParsedSheet> {
  const { read, utils } = await import("xlsx");
  const workbook = read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false });
  const [header = [], ...data] = matrix;
  return {
    headers: header.map((value) => String(value ?? "").trim()),
    rows: data.map((cells, index) => ({ line: index + 2, cells: cells.map((value) => String(value ?? "")) })),
  };
}

export const PROBLEM_LABEL: Record<string, string> = {
  name_missing: "Sem nome",
  cpf_invalid: "CPF inválido",
  process_number_invalid: "Número do processo inválido",
  process_number_tribunal_unknown: "Tribunal não reconhecido pelo número",
  duplicate_in_sheet: "Número repetido na planilha",
};

export const WARNING_LABEL: Record<string, string> = {
  state_mismatch: "ESTADO diferente do tribunal do número",
  cpf_name_differs_in_sheet: "Mesmo CPF com outro nome na planilha",
  customer_name_differs: "Nome diferente do cadastro (o cadastro é mantido)",
  monitored_in_juridico: "Já acompanhado no Jurídico: não será importado",
};

export const ROW_ERROR_LABEL: Record<string, string> = {
  office_required: "Escritório obrigatório",
  office_not_allowed: "Escritório não permitido",
  column_not_editable: "Sem permissão na primeira coluna do board",
  process_number_in_use: "Número já usado em outro card",
  process_monitor_in_use: "Já acompanhado no Jurídico",
  process_import_row_purged: "Linha sem dados do cliente",
  unexpected: "Erro inesperado",
};

export const LOT_FAILURE_LABEL: Record<string, string> = {
  entitlement_revoked: "Quem importou perdeu acesso ao Flow ou o cliente não tem mais o Monitoramento processual.",
};

export const ERROR_MESSAGES: Record<string, string> = {
  process_monitoring_not_contracted: "Importar processos exige o Monitoramento processual contratado.",
  process_import_office_not_allowed: "Escritório não permitido para esta importação.",
  process_import_too_many_rows: `Limite de ${MAX_IMPORT_ROWS} linhas por planilha.`,
  process_import_nothing_to_import: "Nenhuma linha pronta para importar.",
};
