import { describe, expect, it } from "vitest";
import { KanbanApiError } from "./kanban-api";
import { isBoardContentDenied } from "./board-access";

describe("isBoardContentDenied", () => {
  it("nega quando o usuario nao tem papel no quadro ou a leitura responde 403", () => {
    expect(isBoardContentDenied({ currentUserRole: null })).toBe(true);
    expect(
      isBoardContentDenied(null, new KanbanApiError(403, JSON.stringify({ code: "board_membership_required", message: "x" })))
    ).toBe(true);
  });

  it("libera qualquer papel ativo, inclusive board_viewer, e nao confunde outros erros", () => {
    expect(isBoardContentDenied({ currentUserRole: "board_viewer" })).toBe(false);
    expect(isBoardContentDenied({ currentUserRole: "board_admin" })).toBe(false);
    expect(isBoardContentDenied(null, new KanbanApiError(500, "boom"))).toBe(false);
    expect(isBoardContentDenied(null, new Error("rede"))).toBe(false);
  });
});
