/**
 * Maquina de estados da analise do lead (CRM de leads, Sprint 4; ADR 014,
 * Decisao 3). O estado vive em campo proprio (`kanban_card_leads.status`),
 * independente da coluna: mover card ou automacao de coluna nunca muda o
 * estado, e a regra de envio nao depende de configuracao de coluna (R1).
 *
 * Ausencia de linha = `rascunho`. Enum completo do PO; transicoes por sprint:
 * - S4: `submit` (rascunho|devolvido -> enviado) e `return`
 *   (enviado|aguardando_revisao|falha_processamento -> devolvido);
 * - S6 (PE14, sem IA): `first_draft_generated` (enviado -> aguardando_revisao)
 *   quando o gestor gera o primeiro documento do ciclo;
 *   `documents_approved` (aguardando_revisao -> aprovado) quando todo caso
 *   ativo do ciclo tem documento aprovado (P3: N casos); `analysis_reopened`
 *   (aprovado -> aguardando_revisao) quando o gestor acrescenta, troca ou
 *   remove caso e algum caso ativo fica sem documento aprovado. Regra unica em
 *   `lead-analysis/lead-analysis-state.ts`. Devolver continua proibido a partir
 *   de `aprovado` (S4);
 * - S7 acrescenta `enviado -> em_processamento -> aguardando_revisao |
 *   falha_processamento` (ator de sistema) no mesmo ponto do envio.
 */
export const LEAD_STATUSES = [
  'rascunho',
  'enviado',
  'em_processamento',
  'aguardando_revisao',
  'aprovado',
  'devolvido',
  'falha_processamento'
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type LeadAction = 'submit' | 'return' | 'first_draft_generated' | 'documents_approved' | 'analysis_reopened';

export const LEAD_TRANSITIONS: Readonly<Record<LeadAction, { from: readonly LeadStatus[]; to: LeadStatus }>> = {
  submit: { from: ['rascunho', 'devolvido'], to: 'enviado' },
  // `em_processamento` fica fora: devolver durante a analise da IA (S7) correria com o pipeline.
  return: { from: ['enviado', 'aguardando_revisao', 'falha_processamento'], to: 'devolvido' },
  first_draft_generated: { from: ['enviado'], to: 'aguardando_revisao' },
  documents_approved: { from: ['aguardando_revisao'], to: 'aprovado' },
  analysis_reopened: { from: ['aprovado'], to: 'aguardando_revisao' }
};

/** Estado de destino da acao, ou `null` se a transicao nao e permitida a partir de `from`. */
export function nextLeadStatus(from: LeadStatus, action: LeadAction): LeadStatus | null {
  const transition = LEAD_TRANSITIONS[action];
  return transition.from.includes(from) ? transition.to : null;
}

/**
 * Lead editavel pelo escritorio (P21, PE10): so em `rascunho` ou `devolvido`.
 * Nos demais estados o lead esta CONGELADO ate a devolucao.
 */
export function isLeadEditable(status: LeadStatus): boolean {
  return status === 'rascunho' || status === 'devolvido';
}

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === 'string' && (LEAD_STATUSES as readonly string[]).includes(value);
}
