import { InitialPetitionClosingGap, InitialPetitionDto, InitialPetitionsRunDto } from "@/modules/kanban/lib/kanban-api";

/** Quem aprova a peticao (ADR 020, Q7); `flow:admin` tambem aprova. */
export const PETITION_APPROVE_SCOPES = ["flow:petition:approve", "flow:admin"];

export const COURT_LABEL: Record<InitialPetitionDto["court"], string> = { jec: "JEC", jef: "JEF" };

export const ALERT_LABEL: Record<string, string> = {
  rmc_temas_1328_1414: "Temas 1.328 e 1.414 do STJ (RMC simples)",
  tema_183_hipotese_i: "Tema 183 da TNU, hipótese I",
  compensacao_portabilidade_refinanciamento: "Compensação em portabilidade ou refinanciamento",
  irdr_ou_sumula_do_estado: "IRDR ou súmula do estado",
  outro: "Alerta",
};

/** Pendencias do fecho montado pelo Flow (S7) e onde se resolve cada uma. */
export const CLOSING_GAP_LABEL: Record<InitialPetitionClosingGap, string> = {
  card_without_office: "O card não tem escritório: o local do fecho saiu XXXX.",
  office_without_city: "O escritório do card não tem cidade e UF (Escritórios → editar): o local do fecho saiu XXXX.",
  no_assignee_lawyer_for_uf:
    "Nenhum responsável do card tem OAB na UF da ação (Usuários → Advogado): nome e OAB do fecho saíram XXXX.",
};

/** Versao corrigida (S8): sobre a versao atual, ate a peticao ter protocolo. */
export function canSendCorrected(petition: InitialPetitionDto): boolean {
  return petition.document !== null && petition.document.status !== "substituido" && !petition.protocoledAt;
}

/** Conclusao sem erro: ao menos uma peticao registrada (decisao do usuario 3). */
export function petitionCompletionText(run: Pick<InitialPetitionsRunDto, "status" | "completed">): { text: string; tone: "success" | "muted" | "warning" } {
  if (run.status !== "concluida") return { text: "Execução não concluída: não dispara as regras de conclusão da IA.", tone: "warning" };
  if (!run.completed) return { text: "Sem petição registrada: não conta como conclusão sem erro.", tone: "muted" };
  return { text: "Concluída sem erro: as regras \"Quando a IA concluir\" desta coluna podem mover o card.", tone: "success" };
}

export function documentStatusLabel(petition: InitialPetitionDto): { text: string; color: string } {
  if (!petition.document) return { text: "Sem arquivo", color: "secondary" };
  if (petition.document.status === "aprovado") return { text: "Aprovada", color: "success" };
  if (petition.document.status === "substituido") return { text: "Substituída", color: "secondary" };
  return { text: "Pendente de aprovação", color: "warning" };
}

/**
 * Vinculo acao x peticao para a secao "Acoes identificadas": cada acao aponta a peticao que virou ou
 * o motivo de ter ficado sem peca. So vale quando as peticoes usaram esta analise.
 */
export function actionPetitionLinks(
  run: InitialPetitionsRunDto | null,
  analysisId: string,
): Map<string, { fileName: string } | { reason: string }> {
  const links = new Map<string, { fileName: string } | { reason: string }>();
  if (!run || run.status !== "concluida" || run.actionAnalysisId !== analysisId) return links;
  for (const petition of run.petitions) for (const id of petition.actionIds) links.set(id, { fileName: petition.fileName });
  for (const item of run.report?.actionsWithoutPetition ?? []) if (!links.has(item.actionId)) links.set(item.actionId, { reason: item.reason });
  return links;
}
