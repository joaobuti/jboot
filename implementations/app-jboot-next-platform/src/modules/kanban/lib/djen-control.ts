import { DjenCadenceDays, KanbanApiError } from "./kanban-api";

/**
 * Controle do DJEN no cabecalho do card (ADR 022, Sprint 7 de docs/product/process-monitoring-sprints.md):
 * frequencia em dias uteis, sem 14/30 para nao perder prazo curto de intimacao.
 */

export const DJEN_CADENCE_OPTIONS: Array<{ days: DjenCadenceDays; label: string }> = [
  { days: 1, label: "Publicações no DJEN: todo dia útil, às 7h" },
  { days: 3, label: "Publicações no DJEN: a cada 3 dias úteis, às 7h" },
  { days: 7, label: "Publicações no DJEN: a cada 7 dias úteis, às 7h" },
];

/** Aviso quando a frequencia passa de 1 dia util. */
export function djenCadenceWarning(days: DjenCadenceDays): string | null {
  if (days <= 1) return null;
  return `Intimações podem chegar com até ${days} dias úteis de atraso; prazos curtos podem ser perdidos.`;
}

export function djenToggleTitle(enabled: boolean): string {
  return enabled
    ? "Publicações (DJEN) ativas — clique para pausar"
    : "Publicações (DJEN) pausadas — clique para ativar";
}

export function djenErrorMessage(error: unknown): string {
  if (error instanceof KanbanApiError) {
    if (error.code === "process_publications_not_contracted") return "Publicações processuais (DJEN) não contratadas. Peça ao administrador.";
    if (error.code === "process_monitoring_not_contracted") return "Monitoramento processual não contratado. Peça ao administrador.";
  }
  return "Não foi possível alterar as publicações (DJEN).";
}

/** Motivos do sinalizador bloqueado no cabecalho (capacidade nao contratada). */
export const DATAJUD_NOT_CONTRACTED = "Monitoramento processual (DataJud) não contratado. Fale com o administrador.";
export const DJEN_NOT_CONTRACTED = "Publicações processuais (DJEN) não contratadas. Fale com o administrador.";
