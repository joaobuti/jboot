import { LeadAction, LeadStatus, nextLeadStatus } from '../leads/lead-state';

/**
 * Estado do lead durante a analise manual (CRM de leads, Sprint 6). Regra
 * UNICA, aplicada na mesma transacao de toda mutacao da analise (classificar,
 * trocar/remover caso, gerar, aprovar, substituir), com o card travado:
 *
 * - `enviado` + algum documento gerado no ciclo -> `aguardando_revisao`
 *   (PE14, `first_draft_generated`);
 * - `aguardando_revisao` + pelo menos um caso ativo e TODOS os casos ativos com
 *   documento aprovado -> `aprovado` (`documents_approved`; P3: N casos);
 * - `aprovado` + algum caso ativo sem documento aprovado (caso acrescentado,
 *   trocado ou removido depois da aprovacao) -> `aguardando_revisao`
 *   (`analysis_reopened`). Documentos ja aprovados de outros casos continuam
 *   entregues.
 *
 * Fora desses estados nada muda (rascunho/devolvido nao tem analise aberta).
 */

/** Estados em que o gestor opera a analise (classificar, gerar, aprovar, substituir). */
export const ANALYSIS_OPEN_STATUSES: readonly LeadStatus[] = ['enviado', 'aguardando_revisao', 'aprovado'];

export function isAnalysisOpen(status: LeadStatus): boolean {
  return ANALYSIS_OPEN_STATUSES.includes(status);
}

export interface AnalysisFacts {
  /** Documentos (qualquer estado) gerados ou enviados no ciclo atual. */
  documents: number;
  activeCases: number;
  /** Casos ativos com documento `aprovado`. */
  approvedCases: number;
}

export interface LeadStatusStep {
  action: LeadAction;
  from: LeadStatus;
  to: LeadStatus;
}

function allApproved(facts: AnalysisFacts): boolean {
  return facts.activeCases > 0 && facts.approvedCases === facts.activeCases;
}

/** Passos de transicao (0, 1 ou 2) a partir de `current`, na ordem. */
export function reconcileLeadStatus(current: LeadStatus, facts: AnalysisFacts): LeadStatusStep[] {
  const steps: LeadStatusStep[] = [];
  let status = current;
  const apply = (action: LeadAction) => {
    const next = nextLeadStatus(status, action);
    if (next) {
      steps.push({ action, from: status, to: next });
      status = next;
    }
  };
  if (status === 'enviado' && facts.documents > 0) {
    apply('first_draft_generated');
  }
  if (status === 'aguardando_revisao' && allApproved(facts)) {
    apply('documents_approved');
  } else if (status === 'aprovado' && !allApproved(facts)) {
    apply('analysis_reopened');
  }
  return steps;
}
