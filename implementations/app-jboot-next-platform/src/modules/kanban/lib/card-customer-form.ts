import type {
  CardCustomerCorePayload,
  CardCustomerDto,
  CardCustomerJuridicoDto,
  CardCustomerJuridicoPayload,
  LinkCardCustomerPayload,
  UpdateCardCustomerPayload,
} from "@/modules/kanban/lib/kanban-api";
import {
  CROSS_OFFICE_LINK_REQUIRES_ADMIN_CODE,
  CROSS_OFFICE_OVERRIDE_REQUIRED_CODE,
  OVERRIDE_NOT_ALLOWED_CODE,
  OVERRIDE_REQUIRES_EXISTING_CUSTOMER_CODE,
} from "@/modules/kanban/lib/kanban-api";

// Mapeamento formulario <-> payload do cliente do card. Regra de API fica aqui,
// fora do JSX (skills/platform-crud-ui.md, "Padrao De Campos" item 8).

export const CORE_FIELDS = [
  "name",
  "email",
  "phone",
  "addressZip",
  "addressStreet",
  "addressNumber",
  "addressComplement",
  "addressNeighborhood",
  "addressCity",
  "addressState",
] as const;

export const JURIDICO_TEXT_FIELDS = [
  "dataNascimento",
  "nacionalidade",
  "estadoCivil",
  "profissao",
  "rgNumero",
  "rgOrgaoEmissor",
  "rgUf",
  "nomeMae",
  "numeroBeneficio",
  "especieBeneficio",
  "bancoPagamento",
  "observacoes",
] as const;

type CoreField = (typeof CORE_FIELDS)[number];
type JuridicoTextField = (typeof JURIDICO_TEXT_FIELDS)[number];

export type CustomerFormState = Record<CoreField | JuridicoTextField, string> & {
  hipossuficienciaDeclarada: boolean;
};

export function emptyCustomerForm(): CustomerFormState {
  const form = { hipossuficienciaDeclarada: false } as CustomerFormState;
  for (const field of [...CORE_FIELDS, ...JURIDICO_TEXT_FIELDS]) {
    form[field] = "";
  }
  return form;
}

export function customerFormFromDto(customer: CardCustomerDto): CustomerFormState {
  const form = emptyCustomerForm();
  for (const field of CORE_FIELDS) {
    form[field] = customer[field] ?? "";
  }
  const juridico: Partial<CardCustomerJuridicoDto> = customer.juridico ?? {};
  for (const field of JURIDICO_TEXT_FIELDS) {
    form[field] = juridico[field] ?? "";
  }
  form.hipossuficienciaDeclarada = juridico.hipossuficienciaDeclarada ?? false;
  return form;
}

const UF_PATTERN = /^[A-Z]{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Validacao local minima; o backend revalida tudo. Devolve mensagem ou null. */
export function validateCustomerForm(form: CustomerFormState): string | null {
  if (!form.name.trim()) return "Informe o nome do cliente";
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) return "E-mail invalido";
  if (form.addressState && !UF_PATTERN.test(form.addressState)) return "UF do endereco invalida";
  if (form.rgUf && !UF_PATTERN.test(form.rgUf)) return "UF do RG invalida";
  if (form.dataNascimento && !DATE_PATTERN.test(form.dataNascimento)) return "Data de nascimento invalida";
  return null;
}

export function buildLinkPayload(cpf: string, form: CustomerFormState): LinkCardCustomerPayload {
  const customer: CardCustomerCorePayload & { name: string } = { name: form.name.trim() };
  for (const field of CORE_FIELDS) {
    const value = form[field].trim();
    if (field !== "name" && value) customer[field] = value;
  }
  const juridico: CardCustomerJuridicoPayload = {};
  for (const field of JURIDICO_TEXT_FIELDS) {
    const value = form[field].trim();
    if (value) juridico[field] = value;
  }
  if (form.hipossuficienciaDeclarada) juridico.hipossuficienciaDeclarada = true;
  return Object.keys(juridico).length > 0 ? { cpf, customer, juridico } : { cpf, customer };
}

/**
 * Patch so com o que mudou. Dado geral vazio nao e enviado (o servico de
 * clientes nao limpa dado geral); dado juridico vazio vira `null` (limpa).
 */
export function buildUpdatePayload(
  form: CustomerFormState,
  original: CustomerFormState
): { payload: UpdateCardCustomerPayload; hasChanges: boolean } {
  const customer: CardCustomerCorePayload = {};
  for (const field of CORE_FIELDS) {
    const value = form[field].trim();
    if (value && value !== original[field]) customer[field] = value;
  }
  const juridico: CardCustomerJuridicoPayload = {};
  for (const field of JURIDICO_TEXT_FIELDS) {
    const value = form[field].trim();
    if (value !== original[field]) juridico[field] = value || null;
  }
  if (form.hipossuficienciaDeclarada !== original.hipossuficienciaDeclarada) {
    juridico.hipossuficienciaDeclarada = form.hipossuficienciaDeclarada;
  }
  const payload: UpdateCardCustomerPayload = {};
  if (Object.keys(customer).length > 0) payload.customer = customer;
  if (Object.keys(juridico).length > 0) payload.juridico = juridico;
  return { payload, hasChanges: Object.keys(payload).length > 0 };
}

/**
 * Override do admin do tenant (CRM de leads, Sprint 3). Espelho dos limites do
 * backend (`OVERRIDE_REASON_MIN_LENGTH`/`MAX_LENGTH` em
 * bff-jboot-platform/src/modules/kanban/customers/dto/card-customer.dto.ts),
 * medidos depois do trim. O backend continua sendo a validacao autoritativa.
 */
export const OVERRIDE_REASON_MIN_LENGTH = 10;
export const OVERRIDE_REASON_MAX_LENGTH = 500;

export function validateOverrideReason(reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0) return "Informe o motivo do vinculo";
  if (length < OVERRIDE_REASON_MIN_LENGTH) return `O motivo deve ter ao menos ${OVERRIDE_REASON_MIN_LENGTH} caracteres`;
  if (length > OVERRIDE_REASON_MAX_LENGTH) return `O motivo deve ter no maximo ${OVERRIDE_REASON_MAX_LENGTH} caracteres`;
  return null;
}

/** Vinculo por override: so CPF e motivo; nunca dados do cliente (o override nao cria cliente). */
export function buildOverrideLinkPayload(cpf: string, reason: string): LinkCardCustomerPayload {
  return { cpf, override: { reason: reason.trim() } };
}

/** Mensagem pt-BR para os erros estruturados do override; `null` para os demais. */
export function describeOverrideError(code: string | null): string | null {
  if (code === OVERRIDE_NOT_ALLOWED_CODE) {
    return "Somente o administrador do Flow pode vincular cliente cadastrado fora dos seus quadros.";
  }
  if (code === OVERRIDE_REQUIRES_EXISTING_CUSTOMER_CODE) {
    return "Nao ha cliente cadastrado com este CPF. Busque novamente para cadastrar o cliente.";
  }
  // Sprint 3.5 (P30): cliente atendido por outro escritorio.
  if (code === CROSS_OFFICE_LINK_REQUIRES_ADMIN_CODE) {
    return "Cliente vinculado a outro escritorio. Procure a central para vincular este cliente ao card.";
  }
  if (code === CROSS_OFFICE_OVERRIDE_REQUIRED_CODE) {
    return "Cliente de outro escritorio: informe o motivo do vinculo.";
  }
  return null;
}
