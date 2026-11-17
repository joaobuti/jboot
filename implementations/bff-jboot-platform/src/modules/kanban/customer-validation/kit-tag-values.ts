/**
 * Valores das tags do kit do escritorio (ADR 019, Sprint 2). A IA devolve um valor por tag
 * do modelo; a pessoa revisa. Tudo aqui e dado nao confiavel: so tags do modelo (mais os
 * conjuntos `_n` dos emprestimos), texto limpo e com limite. O Flow monta o kit (Sprint 4).
 */

/** Calculadas pelo Flow na geracao; a IA nao envia. */
export const COMPUTED_KIT_TAGS: readonly string[] = ['DATA_POR_EXTENSO', 'LISTA_BANCOS'];

/** Tags de bloco (`[[SE_JEC]]` ... `[[FIM_SE_JEC]]`): marcam trecho condicional, nunca recebem valor. */
const BLOCK_TAG = /^(?:FIM_)?SE_[A-Z0-9_]+$/;

/** Um conjunto por emprestimo; o modelo traz a linha-molde `_1`, a IA pode mandar `_2`, `_3`... */
const LOAN_TAG = /^(BANCO|CONTRATO|INICIO|VALOR|PARCELAS)_([1-9][0-9]{0,2})$/;

const TAG_KEY = /^[A-Z0-9_]{1,60}$/;
export const MAX_KIT_TAG_VALUE = 500;
/** Teto de valores por parecer: cobre dezenas de contratos (5 tags cada) com folga. */
export const MAX_KIT_TAGS = 1000;

export type KitGender = 'masculino' | 'feminino';
export type KitWaiverCourt = 'jec' | 'jef';

/** Tags que a rotina deve preencher: as do modelo, sem blocos e sem as calculadas pelo Flow. */
export function routineKitTags(modelTags: readonly string[]): string[] {
  return modelTags.filter((tag) => !BLOCK_TAG.test(tag) && !COMPUTED_KIT_TAGS.includes(tag));
}

/** Tag aceita: esta no modelo (fora blocos/calculadas) ou e `_n` de emprestimo cujo `_1` esta no modelo. */
export function isAcceptedKitTag(tag: string, modelTags: readonly string[]): boolean {
  if (!TAG_KEY.test(tag)) return false;
  const routine = routineKitTags(modelTags);
  if (routine.includes(tag)) return true;
  const loan = LOAN_TAG.exec(tag);
  return Boolean(loan && routine.includes(`${loan[1]}_1`));
}

export interface NormalizedKitValues {
  values: Record<string, string>;
  /** Tags descartadas (fora do modelo, formato ou tamanho); auditoria so com nomes. */
  discarded: string[];
  /** Valores alem de MAX_KIT_TAGS, nunca aceitos em silencio: viram alerta no parecer. */
  overflow: number;
}

/**
 * Valor vazio e omitido (a revisao mostra a falta); tag fora do modelo ou valor maior que o
 * limite e descartado, nunca truncado.
 */
export function normalizeKitTagValues(input: Record<string, unknown> | undefined, modelTags: readonly string[]): NormalizedKitValues {
  const values: Record<string, string> = {};
  const discarded: string[] = [];
  if (!input) return { values, discarded, overflow: 0 };
  const entries = Object.entries(input);
  for (const [tag, raw] of entries.slice(0, MAX_KIT_TAGS)) {
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'string') {
      discarded.push(tag.slice(0, 60));
      continue;
    }
    const value = raw.replace(/\s+/g, ' ').trim();
    if (value === '') continue;
    if (!isAcceptedKitTag(tag, modelTags) || value.length > MAX_KIT_TAG_VALUE) {
      discarded.push(tag.slice(0, 60));
      continue;
    }
    values[tag] = value;
  }
  return { values, discarded, overflow: Math.max(0, entries.length - MAX_KIT_TAGS) };
}

/** Lista de textos curtos (pendencias gerais, alertas): limpa, sem vazio, com teto. */
export function normalizeNotes(input: unknown, max: number): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim().slice(0, 500))
    .filter((item) => item !== '')
    .slice(0, max);
}
