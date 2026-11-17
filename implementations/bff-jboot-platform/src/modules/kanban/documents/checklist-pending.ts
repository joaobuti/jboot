/**
 * Sinalizacao "checklist pendente" (CRM de leads, Sprint 3, decisao de
 * 2026-10-11): card que ESTA em coluna com `requires_complete_checklist` e tem
 * obrigatorio ativo cujo envio mais recente nao esta `aceito`. Cobre a
 * importacao de dominio (que entra na coluna padrao sem passar pelo bloqueio) e
 * o caso nao retroativo (documento rejeitado depois de o card entrar).
 * Quadro sem obrigatorio ativo nunca sinaliza; coluna sem a flag nunca sinaliza.
 */
export function isChecklistPending(
  columnRequiresCompleteChecklist: boolean,
  completeness: { acceptedRequired: number; totalRequired: number }
): boolean {
  return (
    columnRequiresCompleteChecklist &&
    completeness.totalRequired > 0 &&
    completeness.acceptedRequired < completeness.totalRequired
  );
}
