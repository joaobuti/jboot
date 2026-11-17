import { afterEach, describe, expect, it, vi } from "vitest";
import { KanbanApiError, kanbanApi } from "./kanban-api";

vi.mock("@/lib/module-auth-token", () => ({
  getApplicationAuthToken: vi.fn(() => "flow-token"),
}));

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
  const parsed = new URL(url);
  return {
    path: parsed.pathname,
    query: parsed.search,
    method: init.method ?? "GET",
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kanbanApi.leads (Sprint 4)", () => {
  it("monta rota, metodo e corpo de cada operacao", async () => {
    const fetchMock = mockFetch(200, {});
    const calls: Array<[() => Promise<unknown>, string, string, unknown]> = [
      [() => kanbanApi.leads.get("b1", "c1"), "GET", "/kanban/boards/b1/cards/c1/lead", undefined],
      [() => kanbanApi.leads.submit("b1", "c1"), "POST", "/kanban/boards/b1/cards/c1/lead/submit", undefined],
      [
        () => kanbanApi.leads.returnToOffice("b1", "c1", "falta procuracao"),
        "POST",
        "/kanban/boards/b1/cards/c1/lead/return",
        { reason: "falta procuracao" },
      ],
      [() => kanbanApi.leads.settings(), "GET", "/kanban/lead-settings", undefined],
      [() => kanbanApi.leads.updateSettings(["name"]), "PUT", "/kanban/lead-settings", { requiredFields: ["name"] }],
      [() => kanbanApi.boards.update("b1", { leadIntakeEnabled: true }), "PATCH", "/kanban/boards/b1", { leadIntakeEnabled: true }],
    ];
    for (const [run, method, path, body] of calls) {
      await run();
      expect(lastCall(fetchMock)).toMatchObject({ method, path, body });
    }
  });

  it("fila: so os filtros preenchidos vao na query, com paginacao", async () => {
    const fetchMock = mockFetch(200, { data: [], meta: { limit: 20, offset: 0, total: 0 } });
    await kanbanApi.leads.queue({ status: "enviado", officeId: "o1", limit: 20, offset: 40 });
    expect(lastCall(fetchMock)).toMatchObject({
      method: "GET",
      path: "/kanban/leads",
      query: "?officeId=o1&status=enviado&limit=20&offset=40",
    });
    await kanbanApi.leads.queue({ boardId: "b1", submittedFrom: "2026-10-01", submittedTo: "2026-10-12", limit: 20, offset: 0 });
    expect(lastCall(fetchMock).query).toBe("?boardId=b1&submittedFrom=2026-10-01&submittedTo=2026-10-12&limit=20&offset=0");
  });

  it("422 lead_incomplete chega com a lista do que falta no payload", async () => {
    mockFetch(422, {
      code: "lead_incomplete",
      message: "x",
      customerLinked: true,
      missingFields: ["name"],
      pendingDocumentTypes: [{ id: "t1", name: "RG", state: "pendente" }],
    });
    const error = (await kanbanApi.leads.submit("b1", "c1").catch((err: unknown) => err)) as KanbanApiError;
    expect(error).toBeInstanceOf(KanbanApiError);
    expect(error.code).toBe("lead_incomplete");
    expect(error.payload?.missingFields).toEqual(["name"]);
  });
});
