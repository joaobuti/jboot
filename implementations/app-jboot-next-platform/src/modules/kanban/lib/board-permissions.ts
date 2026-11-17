import type { BoardMemberRole } from "@/modules/kanban/lib/kanban-api";

/**
 * Esconder/desabilitar acao e UX; a seguranca continua no backend (403). Espelha
 * o contrato: `board_admin` e `board_member` operam cards; `board_viewer` e
 * qualquer papel ausente (`null`/`undefined`) apenas leem.
 */
export function canMutateBoard(role: BoardMemberRole | null | undefined): boolean {
  return role === "board_admin" || role === "board_member";
}
