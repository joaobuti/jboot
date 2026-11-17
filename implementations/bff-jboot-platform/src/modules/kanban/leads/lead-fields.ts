import { createHash } from 'node:crypto';

/**
 * Campos cadastrais do lead (CRM de leads, Sprint 4; P16). Whitelist UNICA:
 * a configuracao por tenant so aceita estas chaves (`kanban_lead_required_fields`)
 * e a tela traduz cada chave. Dado geral vem do nucleo `establishment-customers`;
 * `juridico.*` vem de `customer_juridico` (ADR 013). CPF nao e configuravel: o
 * cliente vinculado ao card sempre tem CPF (e a chave do vinculo).
 */
export const LEAD_CUSTOMER_FIELDS = [
  'name',
  'email',
  'phone',
  'addressZip',
  'addressStreet',
  'addressNumber',
  'addressComplement',
  'addressNeighborhood',
  'addressCity',
  'addressState'
] as const;

export const LEAD_JURIDICO_FIELDS = [
  'dataNascimento',
  'nacionalidade',
  'estadoCivil',
  'profissao',
  'rgNumero',
  'rgOrgaoEmissor',
  'rgUf',
  'nomeMae',
  'numeroBeneficio',
  'especieBeneficio',
  'bancoPagamento'
] as const;

export const LEAD_FIELD_KEYS: readonly string[] = [
  ...LEAD_CUSTOMER_FIELDS,
  ...LEAD_JURIDICO_FIELDS.map((field) => `juridico.${field}`)
];

/**
 * Default P16 (tenant que nunca configurou): nome, data de nascimento e
 * endereco (CEP, logradouro, numero, cidade e UF; bairro e complemento
 * opcionais porque nem todo endereco os tem). CPF: sempre, pelo vinculo.
 */
export const DEFAULT_LEAD_REQUIRED_FIELDS: readonly string[] = [
  'name',
  'juridico.dataNascimento',
  'addressZip',
  'addressStreet',
  'addressNumber',
  'addressCity',
  'addressState'
];

export function isLeadFieldKey(key: string): boolean {
  return LEAD_FIELD_KEYS.includes(key);
}

/** Ordem canonica do catalogo (estavel para resposta, erro e snapshot). */
export function sortLeadFieldKeys(keys: Iterable<string>): string[] {
  const wanted = new Set(keys);
  return LEAD_FIELD_KEYS.filter((key) => wanted.has(key));
}

export interface LeadCustomerSource {
  core: Record<string, unknown> & { documentNumber?: string | null };
  juridico: Record<string, unknown> | null;
}

/**
 * Cadastro achatado (`name`, ..., `juridico.dataNascimento`, ...) mais
 * `documentNumber` e os campos juridicos fora da whitelist de obrigatorios
 * (`juridico.hipossuficienciaDeclarada`, `juridico.observacoes`): e o
 * snapshot dos dados usados no envio. Valor ausente vira `null`.
 */
export function flattenLeadCustomer(source: LeadCustomerSource): Record<string, unknown> {
  const flat: Record<string, unknown> = { documentNumber: normalize(source.core.documentNumber) };
  for (const field of LEAD_CUSTOMER_FIELDS) {
    flat[field] = normalize(source.core[field]);
  }
  for (const field of [...LEAD_JURIDICO_FIELDS, 'hipossuficienciaDeclarada', 'observacoes']) {
    flat[`juridico.${field}`] = normalize(source.juridico?.[field]);
  }
  return flat;
}

/** Campos obrigatorios sem valor (nulo ou texto vazio), na ordem do catalogo. */
export function missingLeadFields(flat: Record<string, unknown>, requiredKeys: Iterable<string>): string[] {
  return sortLeadFieldKeys(requiredKeys).filter((key) => {
    const value = flat[key];
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  });
}

/** sha256 do JSON com chaves ordenadas (estavel entre execucoes; base do "desatualizado"). */
export function leadSnapshotHash(flat: Record<string, unknown>): string {
  const ordered = Object.fromEntries(Object.keys(flat).sort().map((key) => [key, flat[key] ?? null]));
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

/** Chaves cujo valor atual difere do snapshot do envio (so nomes de campo, nunca valores). */
export function changedLeadFields(snapshot: Record<string, unknown>, current: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(snapshot), ...Object.keys(current)]);
  return [...keys].filter((key) => (snapshot[key] ?? null) !== (current[key] ?? null)).sort();
}

function normalize(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}
