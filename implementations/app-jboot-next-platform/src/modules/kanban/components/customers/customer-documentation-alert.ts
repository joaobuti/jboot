import { CustomerDocumentationSummaryDto } from "@/modules/kanban/lib/kanban-api";

/**
 * Alerta visual da ficha na listagem (decisao do usuario, 2026-10-16): documento
 * pendente e parecer recebido ainda nao confirmado se destacam.
 */
export function documentationAlert(summary: CustomerDocumentationSummaryDto | undefined): {
  text: string;
  color: string;
  icon: string;
} | null {
  if (!summary) return null;
  switch (summary.status) {
    case "documentos_incompletos":
      return { text: `Documentos pendentes (${summary.missingCount})`, color: "warning", icon: "ri-error-warning-line" };
    case "em_validacao":
      return { text: "Em validação", color: "info", icon: "ri-loader-2-line" };
    case "aguardando_confirmacao":
      return summary.latestVerdict === "pendencias"
        ? { text: "Parecer com pendências", color: "danger", icon: "ri-alert-line" }
        : { text: "Aguardando confirmação", color: "primary", icon: "ri-time-line" };
    case "validado":
      return { text: "Validado", color: "success", icon: "ri-shield-check-line" };
    default:
      return { text: "Não validado", color: "secondary", icon: "ri-shield-line" };
  }
}

/** "Validar" na listagem: ficha completa, agente configurado e nada em andamento. */
export function canValidateFromList(summary: CustomerDocumentationSummaryDto | undefined, configured: boolean): boolean {
  return Boolean(summary && configured && summary.status !== "documentos_incompletos" && summary.status !== "em_validacao");
}

/** Parecer recebido e nao confirmado: o selo da listagem leva a etapa Validacao, onde fica "Confirmar". */
export function alertOpensValidation(summary: CustomerDocumentationSummaryDto | undefined): boolean {
  return summary?.status === "aguardando_confirmacao";
}
