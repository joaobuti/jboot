import type { MonitoringUpdateItemDto } from "./kanban-api";

/** Link do item do sino: board do card, ja abrindo o card (BoardView le `?card=`). */
export function monitoringItemHref(item: Pick<MonitoringUpdateItemDto, "boardId" | "cardId">): string {
  return `/flow/boards/${item.boardId}?card=${item.cardId}`;
}

/** "Nome do cliente - numero CNJ" (o titulo do card e o nome do cliente). */
export function monitoringItemLabel(item: Pick<MonitoringUpdateItemDto, "title" | "processNumber">): string {
  return item.title.includes(item.processNumber) ? item.title : `${item.title} - ${item.processNumber}`;
}
