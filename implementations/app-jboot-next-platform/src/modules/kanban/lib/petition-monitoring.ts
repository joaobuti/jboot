import { describeKanbanError } from "./card-documents";
import { InitialPetitionDto, KanbanApiError } from "./kanban-api";

/**
 * Numero do processo (CNJ) da peticao e acao Monitorar (docs/product/flow-card-actions-sprints.md,
 * Sprint 2). O backend confere digito verificador, tribunal e unicidade; aqui so a mascara e a
 * conferencia antecipada para o botao.
 */

export function normalizeCnjInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 20);
}

/** Mascara progressiva NNNNNNN-DD.AAAA.J.TR.OOOO enquanto a pessoa digita. */
export function formatCnjInput(value: string): string {
  const d = normalizeCnjInput(value);
  const parts = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  let out = parts[0];
  if (parts[1]) out += `-${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `.${parts[3]}`;
  if (parts[4]) out += `.${parts[4]}`;
  if (parts[5]) out += `.${parts[5]}`;
  return out;
}

/** Digito verificador (ISO 7064 mod 97, Resolucao CNJ 65/2008). */
export function isValidCnjInput(value: string): boolean {
  const digits = normalizeCnjInput(value);
  if (digits.length !== 20) return false;
  let remainder = 0;
  for (const digit of `${digits.slice(0, 7)}${digits.slice(9)}00`) remainder = (remainder * 10 + Number(digit)) % 97;
  return Number(digits.slice(7, 9)) === 98 - remainder;
}

/** Peticao aprovada sem numero: quem pode registra o numero do processo. */
export function canRegisterProcessNumber(petition: InitialPetitionDto): boolean {
  return petition.document?.status === "aprovado" && !petition.protocolNumber;
}

const MESSAGES: Record<string, string> = {
  invalid_process_number: "Número do processo (CNJ) inválido: confira os 20 dígitos.",
  process_number_tribunal_unknown: "Não foi possível identificar o tribunal pelo número do processo.",
  petition_not_approved: "Registre o número do processo depois de aprovar a petição.",
  petition_protocol_already_registered: "Esta petição já tem número do processo.",
  petition_protocol_forbidden: "Somente o administrador do board ou o responsável pelo card registra o número do processo.",
  process_number_in_use: "Já existe um card com este número do processo.",
  process_monitor_in_use: "Este processo já é acompanhado no Jurídico.",
  process_monitoring_not_contracted: "Monitorar exige o Monitoramento processual contratado. Peça ao administrador.",
  card_action_not_assigned: "A ação Monitorar não está mais na coluna deste card. Atualize o board.",
  card_actions_execute_required: "Permissão Executar ações necessária.",
  petition_without_process_number: "Registre o número do processo (CNJ) antes de monitorar.",
  petition_not_monitorable: "A petição precisa estar aprovada para ir ao monitoramento.",
  monitoring_board_same_as_origin: "Escolha um board diferente do board de origem.",
};

/** Mensagem e, na duplicidade, o link do card que ja usa o numero. */
export function describePetitionMonitoringError(error: unknown, fallback: string): { message: string; cardUrl: string | null } {
  if (error instanceof KanbanApiError && error.code && MESSAGES[error.code]) {
    const cardUrl = typeof error.payload?.cardUrl === "string" ? error.payload.cardUrl : null;
    return { message: MESSAGES[error.code], cardUrl };
  }
  return { message: describeKanbanError(error, fallback), cardUrl: null };
}
