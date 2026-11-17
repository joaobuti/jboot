import {
  CardDto,
  IDENTITY_NOT_IN_CARD_OFFICE_CODE,
  NO_ACTIVE_OFFICE_CODE,
  OFFICE_NAME_TAKEN_CODE,
  OFFICE_NOT_ALLOWED_CODE,
  OFFICE_REQUIRED_CODE,
  OfficeContextDto,
  OfficeDto,
  USER_WITHOUT_OFFICE_CODE,
} from "@/modules/kanban/lib/kanban-api";

/**
 * Apoio de tela da visibilidade por escritorio (CRM de leads, Sprint 3.5). A
 * regra e do backend: aqui so se decide o que mostrar a partir do contexto que
 * ele devolve (`GET /kanban/offices/context`).
 */

export const USER_WITHOUT_OFFICE_MESSAGE =
  "Seu usuario nao esta vinculado a um escritorio. Procure o administrador.";

/** Espelho dos limites do backend (`OFFICE_TRANSFER_REASON_*`), medidos depois do trim. */
export const TRANSFER_REASON_MIN_LENGTH = 10;
export const TRANSFER_REASON_MAX_LENGTH = 500;

export function officeNameMap(offices: OfficeDto[]): Map<string, string> {
  return new Map(offices.map((office) => [office.id, office.name]));
}

/** Operador (nao admin) sem escritorio ativo com a chave ligada: nao ve nem cria card. */
export function isUserWithoutOffice(context: OfficeContextDto | null): boolean {
  if (!context || !context.officeVisibilityEnabled || context.isAdmin) {
    return false;
  }
  return !context.offices.some((office) => office.active && context.userOfficeIds.includes(office.id));
}

export type NewCardOfficeChoice =
  /** Chave desligada: sem escritorio na criacao (comportamento anterior). */
  | { mode: "none" }
  /** Um escritorio ativo: o backend escolhe sozinho. */
  | { mode: "auto"; office: OfficeDto }
  /** Admin ou usuario com varios escritorios ativos: escolha obrigatoria. */
  | { mode: "choose"; options: OfficeDto[] }
  /** Usuario sem escritorio ativo: nao cria card. */
  | { mode: "blocked" };

export function newCardOfficeChoice(context: OfficeContextDto | null): NewCardOfficeChoice {
  if (!context || !context.officeVisibilityEnabled) {
    return { mode: "none" };
  }
  const active = context.offices.filter((office) => office.active);
  if (context.isAdmin) {
    return active.length > 0 ? { mode: "choose", options: active } : { mode: "blocked" };
  }
  const own = active.filter((office) => context.userOfficeIds.includes(office.id));
  if (own.length === 0) {
    return { mode: "blocked" };
  }
  return own.length === 1 ? { mode: "auto", office: own[0] } : { mode: "choose", options: own };
}

/** Filtro de escritorio do quadro (so administrador): todos, sem escritorio ou um escritorio. */
export const OFFICE_FILTER_ALL = "";
export const OFFICE_FILTER_NONE = "__none__";

export function filterCardsByOffice(cards: CardDto[], filter: string): CardDto[] {
  if (filter === OFFICE_FILTER_ALL) {
    return cards;
  }
  if (filter === OFFICE_FILTER_NONE) {
    return cards.filter((card) => card.officeId === null);
  }
  return cards.filter((card) => card.officeId === filter);
}

export function validateTransferReason(reason: string): string | null {
  const length = reason.trim().length;
  if (length === 0) return "Informe o motivo da transferencia";
  if (length < TRANSFER_REASON_MIN_LENGTH) return `O motivo deve ter ao menos ${TRANSFER_REASON_MIN_LENGTH} caracteres`;
  if (length > TRANSFER_REASON_MAX_LENGTH) return `O motivo deve ter no maximo ${TRANSFER_REASON_MAX_LENGTH} caracteres`;
  return null;
}

/** Mensagem pt-BR dos erros estruturados de escritorio; `null` para os demais. */
export function describeOfficeError(code: string | null): string | null {
  switch (code) {
    case USER_WITHOUT_OFFICE_CODE:
      return USER_WITHOUT_OFFICE_MESSAGE;
    case OFFICE_REQUIRED_CODE:
      return "Escolha o escritorio do card.";
    case OFFICE_NOT_ALLOWED_CODE:
      return "Escritorio inexistente, inativo ou fora dos seus escritorios.";
    case NO_ACTIVE_OFFICE_CODE:
      return "Cadastre ao menos um escritorio ativo antes de ligar a visibilidade por escritorio.";
    case OFFICE_NAME_TAKEN_CODE:
      return "Ja existe um escritorio ativo com este nome.";
    case IDENTITY_NOT_IN_CARD_OFFICE_CODE:
      return "Este usuario nao pertence ao escritorio do card.";
    default:
      return null;
  }
}
