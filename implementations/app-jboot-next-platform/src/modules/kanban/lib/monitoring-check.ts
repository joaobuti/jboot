import { CardMonitoringDto, MonitoringCheckStatus } from "./kanban-api";

/**
 * Ultima consulta ao DataJud mostrada no painel do card (docs/product/process-monitoring-sprints.md,
 * Sprint 4). As consultas passam por uma fila, uma por vez; a falha tem que aparecer, senao o card
 * parece "sem monitoramento".
 */

const STATUS_TEXT: Record<MonitoringCheckStatus, string> = {
  success: "consulta feita",
  not_found: "processo ainda não encontrado no DataJud",
  restricted: "processo em segredo de justiça; o DataJud não mostra as movimentações",
  rate_limited: "o DataJud recusou por excesso de consultas; o sistema tenta de novo sozinho",
  timeout: "o DataJud não respondeu a tempo; o sistema tenta de novo sozinho",
  provider_unavailable: "o DataJud estava indisponível; o sistema tenta de novo sozinho",
  failed: "a consulta falhou; o sistema tenta de novo na próxima consulta",
};

export interface MonitoringCheckSummary {
  tone: "success" | "warning" | "muted";
  text: string;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Linhas de ultima e proxima consulta; null quando o card nao tem acompanhamento ativo. */
export function describeMonitoringCheck(state: Pick<CardMonitoringDto, "monitoring" | "lastCheck" | "nextCheckAt">): MonitoringCheckSummary[] | null {
  if (!state.monitoring) return null;
  const lines: MonitoringCheckSummary[] = [];
  if (!state.lastCheck) {
    lines.push({ tone: "muted", text: "Primeira consulta na fila do DataJud." });
  } else {
    const ok = state.lastCheck.status === "success";
    lines.push({
      tone: ok ? "success" : "warning",
      text: `Última consulta em ${formatWhen(state.lastCheck.checkedAt)}: ${STATUS_TEXT[state.lastCheck.status] ?? STATUS_TEXT.failed}.`,
    });
  }
  if (state.lastCheck && state.nextCheckAt) lines.push({ tone: "muted", text: `Próxima consulta a partir de ${formatWhen(state.nextCheckAt)}.` });
  return lines;
}
