import { describe, expect, it, vi } from "vitest";
import { getApplicationAuthToken } from "@/lib/module-auth-token";
import { getKanbanAuthToken, kanbanApi, toQueryString } from "./kanban-api";

vi.mock("@/lib/module-auth-token", () => ({
  getApplicationAuthToken: vi.fn(() => "flow-token"),
}));

describe("toQueryString", () => {
  it("omits empty query string when no filter is set", () => {
    expect(toQueryString({})).toBe("");
    expect(toQueryString({ search: undefined })).toBe("");
  });

  it("includes only the filters that are set", () => {
    expect(toQueryString({ search: "bug", cardStatusId: undefined })).toBe("?search=bug");
  });

  it("combines multiple filters in the query string", () => {
    const query = toQueryString({ search: "bug", cardStatusId: "status-1", tagId: "tag-1" });
    const params = new URLSearchParams(query.slice(1));
    expect(params.get("search")).toBe("bug");
    expect(params.get("cardStatusId")).toBe("status-1");
    expect(params.get("tagId")).toBe("tag-1");
  });

  it("uses the Flow application token audience", () => {
    expect(getKanbanAuthToken()).toBe("flow-token");
    expect(getApplicationAuthToken).toHaveBeenCalledWith("app:flow");
  });

  it("uses the typed Flow client for cross-domain monitoring", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      monitoring: true,
      monitorId: "monitor-1",
      hasSource: true,
      cadence: "weekly",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await kanbanApi.sourceMonitoring.get("card-1");

    expect(result.cadence).toBe("weekly");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/domain-integrations/flow/cards/card-1/monitoramento",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer flow-token");
    vi.unstubAllGlobals();
  });
});
