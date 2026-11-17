/**
 * `system_event` da analise do lead (CRM de leads, Sprint 6). Payload so com
 * ids, versao, estado e o motivo digitado pelo gestor; nunca nome de tipo de
 * caso, nome de arquivo ou dado do cliente.
 *
 * P11 (aprovada em 2026-10-11): o escritorio ve estado, pendencias e documento
 * aprovado; classificacao, rascunhos e historico de geracao so o
 * administrador. Os eventos abaixo ficam fora do historico do card para quem
 * nao tem `flow:admin` (`ActivitiesService.list`).
 */
export const LEAD_EVENT_KINDS = {
  caseClassified: 'card.lead_case_classified',
  caseChanged: 'card.lead_case_changed',
  caseRemoved: 'card.lead_case_removed',
  documentGenerated: 'card.lead_document_generated',
  documentReplaced: 'card.lead_document_replaced',
  documentApproved: 'card.lead_document_approved',
  analysisStatusChanged: 'card.lead_analysis_status_changed'
} as const;

export const ADMIN_ONLY_LEAD_EVENT_KINDS: readonly string[] = [
  LEAD_EVENT_KINDS.caseClassified,
  LEAD_EVENT_KINDS.caseChanged,
  LEAD_EVENT_KINDS.caseRemoved,
  LEAD_EVENT_KINDS.documentGenerated,
  LEAD_EVENT_KINDS.documentReplaced
];
