import { describe, expect, it } from "vitest";
import { canMutateBoard } from "./board-permissions";

describe("canMutateBoard", () => {
  it("libera board_admin e board_member", () => {
    expect(canMutateBoard("board_admin")).toBe(true);
    expect(canMutateBoard("board_member")).toBe(true);
  });

  it("nega board_viewer e ausencia de papel", () => {
    expect(canMutateBoard("board_viewer")).toBe(false);
    expect(canMutateBoard(null)).toBe(false);
    expect(canMutateBoard(undefined)).toBe(false);
  });
});
