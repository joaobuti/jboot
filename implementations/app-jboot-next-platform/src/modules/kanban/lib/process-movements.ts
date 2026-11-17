import { CardProcessMovementDto } from "./kanban-api";

/**
 * Lista "Movimentacoes do processo" do card (docs/product/process-monitoring-sprints.md, Sprint 5).
 * Somente leitura: o historico que o processo ja tinha aparece aqui, nao no historico do card.
 */

export const PROCESS_MOVEMENTS_PREVIEW = 5;

export function formatMovementDate(value: string | null): string {
  if (!value) return "Sem data";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

/** Recolhida mostra as mais recentes; expandida mostra todas. */
export function visibleMovements(items: CardProcessMovementDto[], expanded: boolean): CardProcessMovementDto[] {
  return expanded ? items : items.slice(0, PROCESS_MOVEMENTS_PREVIEW);
}

export function movementsSummary(items: CardProcessMovementDto[]): string {
  const fresh = items.filter((item) => item.isNew).length;
  const total = `${items.length} ${items.length === 1 ? "movimentação" : "movimentações"}`;
  return fresh > 0 ? `${total}, ${fresh} ${fresh === 1 ? "nova" : "novas"} desde a entrada no Flow` : total;
}

/** Linha de dados do processo no painel "Origem" (Sprint 9); null sem nenhum dado. */
export function processDetailsLine(details: { filedAt: string | null; className: string | null; courtName: string | null; systemName: string | null } | null | undefined): string | null {
  if (!details) return null;
  const parts = [
    details.filedAt ? `Ajuizado em ${formatMovementDate(details.filedAt)}` : null,
    details.className,
    details.courtName,
    details.systemName ? `sistema ${details.systemName}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Periodo buscado no DJEN, para a resposta vazia do "Ver no DJEN". */
export function lookupEmptyMessage(from: string, to: string): string {
  return `Nenhuma publicação no DJEN entre ${formatMovementDate(`${from}T12:00:00Z`)} e ${formatMovementDate(`${to}T12:00:00Z`)}.`;
}
