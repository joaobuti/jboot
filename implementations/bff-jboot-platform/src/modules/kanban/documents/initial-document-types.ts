/**
 * Lista inicial confirmada pelo usuario em 2026-10-09
 * (docs/product/flow-crm-leads-sprints.md, "Decisoes De Escopo Confirmadas").
 * Obrigatoriedade: todos obrigatorios, exceto "Demais documentos" (premissa do
 * orquestrador registrada no artefato; o board_admin pode alterar depois).
 */
export const INITIAL_DOCUMENT_TYPES: ReadonlyArray<{ name: string; required: boolean }> = [
  { name: 'Documento pessoal', required: true },
  { name: 'Procuração', required: true },
  { name: 'Declaração de hipossuficiência', required: true },
  { name: 'Comprovante de residência', required: true },
  { name: 'HISCON', required: true },
  { name: 'HISCRE/HISCRED', required: true },
  { name: 'Confirmação do cliente (print de WhatsApp)', required: true },
  { name: 'Demais documentos', required: false }
];
