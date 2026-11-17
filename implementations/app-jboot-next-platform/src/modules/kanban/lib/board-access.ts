import { BoardDto, KanbanApiError } from "@/modules/kanban/lib/kanban-api";

/**
 * Conteudo do quadro (cards, colunas, documentos, historico) so e lido por membro
 * ativo; o backend responde 403 `board_membership_required`. O GET do quadro
 * responde a qualquer usuario do tenant com `currentUserRole = null`.
 */
export function isBoardContentDenied(board: Pick<BoardDto, "currentUserRole"> | null, error?: unknown): boolean {
  if (error instanceof KanbanApiError && error.status === 403) {
    return true;
  }
  return board !== null && board.currentUserRole === null;
}
