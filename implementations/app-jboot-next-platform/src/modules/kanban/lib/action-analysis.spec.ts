import { afterEach, describe, expect, it, vi } from "vitest";
import { actionSummary, analysisCompletionText, contractLabel, groupActionsByBlock } from "./action-analysis";
import { ActionAnalysisActionDto, kanbanApi } from "./kanban-api";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token") }));
afterEach(() => vi.unstubAllGlobals());

const action = (block: ActionAnalysisActionDto["block"], position: number, extra: Partial<ActionAnalysisActionDto> = {}): ActionAnalysisActionDto => ({
  id: `${block}${position}`,
  block,
  position,
  bank: "BANCO X",
  year: "2021",
  rootContract: null,
  observations: null,
  contracts: [{ number: "111", inclusionDate: "02/03/2021" }, { number: "112" }],
  ...extra,
});

describe("action analysis panel helpers", () => {
  it("groups actions in the client's block order and skips empty blocks", () => {
    const groups = groupActionsByBlock([action("d", 1), action("b", 1), action("caixa", 1), action("b", 2)]);
    expect(groups.map((group) => [group.block, group.actions.map((item) => item.position)])).toEqual([
      ["caixa", [1]],
      ["b", [1, 2]],
      ["d", [1]],
    ]);
  });

  it("summarizes each action and its contracts", () => {
    expect(actionSummary(action("b", 1))).toBe("BANCO X · 2021 · 2 contratos");
    expect(actionSummary(action("d", 1, { year: null, contracts: [{ number: "300", cardType: "RMC", limit: "R$ 1.000,00" }] }))).toBe("BANCO X · RMC");
    expect(contractLabel({ number: "111", status: "Excluído", inclusionDate: "02/03/2021" })).toBe("111 (Excluído, incluído em 02/03/2021)");
    expect(contractLabel({ number: "300", limit: "R$ 1.000,00" })).toBe("300 (limite R$ 1.000,00)");
    expect(contractLabel({ number: "400" })).toBe("400");
  });

  it("explains what happened to the card", () => {
    expect(analysisCompletionText({ status: "concluida", actionCount: 2 }).tone).toBe("success");
    expect(analysisCompletionText({ status: "concluida", actionCount: 0 }).text).toContain("não conta como conclusão");
    expect(analysisCompletionText({ status: "nao_concluida", actionCount: 0 }).tone).toBe("warning");
  });

  it("reads the latest analysis of the card", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ analysis: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await kanbanApi.actionAnalysis.latest("board", "card")).toEqual({ analysis: null });
    const [url] = (fetchMock.mock.calls as unknown as Array<[string]>)[0];
    expect(url).toContain("/kanban/boards/board/cards/card/action-analysis");
  });
});
