import type { BoardActionsDto, CardActionDto } from "./kanban-api";

/** Derive actions from the current column; never copy assignment state into cards. */
export function actionsForColumn(context: BoardActionsDto | null, columnId: string): CardActionDto[] {
  if (!context) return [];
  const assigned = new Set(context.assignments.filter(item => item.columnId === columnId).map(item => item.actionId));
  return context.actions.filter(action => action.boardSelectable && assigned.has(action.id));
}

/**
 * Acoes do card: as da coluna atual, menos as de disponibilidade por card (`perCardAvailability`) em que o
 * card nao esta listado. Ex.: Monitorar so aparece no card com peticao aprovada, com numero do processo e
 * ainda nao enviada (Sprint 2 de flow-card-actions). O backend revalida ao executar.
 */
export function actionsForCard(context: BoardActionsDto | null, columnActions: CardActionDto[], cardId: string): CardActionDto[] {
  return columnActions.filter(action => !action.perCardAvailability || (context?.availableCardIds?.[action.id] ?? []).includes(cardId));
}

/** Origens de card com acompanhamento DataJud: export de consulta, peticao enviada e processo importado. */
export const MONITORED_SOURCE_TYPES = ["datajud_processo", "flow_petition", "flow_process_import"] as const;

export function isMonitoredSourceType(sourceType: string | null | undefined): boolean {
  return MONITORED_SOURCE_TYPES.includes(sourceType as (typeof MONITORED_SOURCE_TYPES)[number]);
}
