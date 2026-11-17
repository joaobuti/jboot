import {
  CUSTOMER_ADDRESS_FILLABLE_FIELDS,
  CustomerAddressFillableField,
  CustomerAddressFillInput
} from '../../establishment-customers/customer-address.types';
import {
  CUSTOMER_JURIDICO_FILLABLE_FIELDS,
  CustomerJuridicoFillableField,
  CustomerJuridicoFillInput
} from '../../establishment-customers/customer-juridico.types';

/** Limites das colunas de `customer_juridico`; valor maior e descartado, nunca truncado. */
const MAX_LENGTH: Record<CustomerJuridicoFillableField, number> = {
  dataNascimento: 10,
  nacionalidade: 60,
  estadoCivil: 40,
  profissao: 120,
  rgNumero: 30,
  rgOrgaoEmissor: 120,
  rgUf: 2,
  nomeMae: 200,
  numeroBeneficio: 30,
  especieBeneficio: 120,
  bancoPagamento: 120
};

/** Limites das colunas de endereco de `pdv_establishment_customers` (CEP e UF tem formato proprio). */
const ADDRESS_MAX_LENGTH = 60;

const UF = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export type ExtractedField = CustomerJuridicoFillableField | CustomerAddressFillableField;

export interface NormalizedExtraction {
  data: CustomerJuridicoFillInput;
  /** Endereco do comprovante de residencia; substitui o endereco inteiro da ficha (o documento prevalece). */
  address: CustomerAddressFillInput;
  /** Campos enviados pela IA e descartados por formato (auditoria; sem valor). */
  discarded: ExtractedField[];
}

/**
 * Dados lidos dos documentos pela IA (dado nao confiavel): so campos conhecidos da
 * ficha, texto limpo, data ISO real, UF valida e CEP com 8 digitos. O que nao passa e descartado.
 */
export function normalizeExtractedData(input: Partial<Record<string, unknown>> | undefined): NormalizedExtraction {
  const data: CustomerJuridicoFillInput = {};
  const address: CustomerAddressFillInput = {};
  const discarded: ExtractedField[] = [];
  if (!input) return { data, address, discarded };
  for (const field of CUSTOMER_JURIDICO_FILLABLE_FIELDS) {
    const value = cleanText(input[field]);
    if (value === null) continue;
    const normalized = normalizeField(field, value);
    if (normalized === null) discarded.push(field);
    else data[field] = normalized;
  }
  for (const field of CUSTOMER_ADDRESS_FILLABLE_FIELDS) {
    const value = cleanText(input[field]);
    if (value === null) continue;
    const normalized = normalizeAddressField(field, value);
    if (normalized === null) discarded.push(field);
    else address[field] = normalized;
  }
  return { data, address, discarded };
}

function cleanText(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  return value === '' ? null : value;
}

function normalizeField(field: CustomerJuridicoFillableField, value: string): string | null {
  if (field === 'dataNascimento') return isRealDate(value) ? value : null;
  if (field === 'rgUf') return ufOrNull(value);
  return value.length <= MAX_LENGTH[field] ? value : null;
}

function normalizeAddressField(field: CustomerAddressFillableField, value: string): string | null {
  if (field === 'addressState') return ufOrNull(value);
  if (field === 'addressZip') {
    const digits = value.replace(/\D/g, '');
    return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : null;
  }
  return value.length <= ADDRESS_MAX_LENGTH ? value : null;
}

function ufOrNull(value: string): string | null {
  const uf = value.toUpperCase();
  return UF.has(uf) ? uf : null;
}

function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid && year >= 1900 && date.getTime() <= Date.now();
}
