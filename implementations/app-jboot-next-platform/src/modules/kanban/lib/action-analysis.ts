import type {
  ActionAnalysisActionDto,
  ActionAnalysisBlock,
  ActionAnalysisContractDto,
  ActionAnalysisDto,
} from "@/modules/kanban/lib/kanban-api";

/** Nomes dos blocos como no prompt do cliente (docs/product/flow-action-analysis-routine-prompt.md). */
export const ACTION_BLOCK_TITLES: Record<ActionAnalysisBlock, string> = {
  caixa: "Bloco Caixa — Caixa Econômica Federal",
  e: "Bloco E — Tese 1000 Contra",
  a: "Bloco A — Migrados",
  b: "Bloco B — 2021/2022",
  c: "Bloco C — Excluídos/encerrados 2023–2025",
  d: "Bloco D — Cartões RMC e RCC ativos",
};

const BLOCK_ORDER: ActionAnalysisBlock[] = ["caixa", "e", "a", "b", "c", "d"];

export function groupActionsByBlock(actions: ActionAnalysisActionDto[]) {
  return BLOCK_ORDER.map((block) => ({ block, actions: actions.filter((action) => action.block === block) })).filter(
    (group) => group.actions.length > 0
  );
}

/** Linha-resumo da acao: banco, ano e quantidade de contratos (Bloco D: tipo do cartao). */
export function actionSummary(action: ActionAnalysisActionDto): string {
  const parts = [action.bank];
  if (action.year) parts.push(action.year);
  if (action.block === "d" && action.contracts[0]?.cardType) parts.push(action.contracts[0].cardType);
  else parts.push(`${action.contracts.length} contrato${action.contracts.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function contractLabel(contract: ActionAnalysisContractDto): string {
  const details = [contract.status, contract.inclusionDate && `incluído em ${contract.inclusionDate}`, contract.limit && `limite ${contract.limit}`]
    .filter(Boolean)
    .join(", ");
  return details ? `${contract.number} (${details})` : contract.number;
}

/**
 * O que o registro significa para o card (flow-ai-completion-sprints.md): concluida com ao menos uma acao
 * e a conclusao sem erro, que dispara as regras "Quando a IA concluir" da coluna.
 */
export function analysisCompletionText(analysis: Pick<ActionAnalysisDto, "status" | "actionCount">): { text: string; tone: "success" | "muted" | "warning" } {
  if (analysis.status !== "concluida") return { text: "Análise não concluída: não dispara as regras de conclusão da IA.", tone: "warning" };
  if (analysis.actionCount === 0) return { text: "Nenhuma ação identificada: não conta como conclusão sem erro.", tone: "muted" };
  return { text: "Concluída sem erro: as regras \"Quando a IA concluir\" desta coluna podem mover o card.", tone: "success" };
}
