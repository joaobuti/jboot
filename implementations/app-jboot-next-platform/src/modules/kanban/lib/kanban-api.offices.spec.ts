import { afterEach, describe, expect, it, vi } from "vitest";
import { KanbanApiError, USER_WITHOUT_OFFICE_CODE, kanbanApi } from "./kanban-api";

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
  return { path: new URL(url).pathname, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kanbanApi.offices (Sprint 3.5)", () => {
  it("monta rota, metodo e corpo de cada operacao", async () => {
    const fetchMock = mockFetch(200, {});
    const calls: Array<[() => Promise<unknown>, string, string, unknown]> = [
      [() => kanbanApi.offices.context(), "GET", "/kanban/offices/context", undefined],
      [() => kanbanApi.offices.userManagementContext(), "GET", "/kanban/settings/users/context", undefined],
      [
        () => kanbanApi.offices.provisionUser({ identity: { documentType: "cpf", documentNumber: "00011122233", displayName: "A" }, officeIds: ["o1"] }, "idem-key"),
        "POST", "/kanban/settings/users", { identity: { documentType: "cpf", documentNumber: "00011122233", displayName: "A" }, officeIds: ["o1"] },
      ],
      [() => kanbanApi.offices.list(), "GET", "/kanban/offices", undefined],
      [() => kanbanApi.offices.create({ name: "A" }), "POST", "/kanban/offices", { name: "A" }],
      [() => kanbanApi.offices.update("o1", { active: false }), "PATCH", "/kanban/offices/o1", { active: false }],
      [() => kanbanApi.offices.users(), "GET", "/kanban/office-users", undefined],
      [() => kanbanApi.offices.replaceUserOffices("u1", ["o1"]), "PUT", "/kanban/office-users/u1/offices", { officeIds: ["o1"] }],
      [() => kanbanApi.offices.settings(), "GET", "/kanban/office-settings", undefined],
      [() => kanbanApi.offices.updateSettings(true), "PUT", "/kanban/office-settings", { officeVisibilityEnabled: true }],
      [() => kanbanApi.offices.assignBoardCards("b1", "o1"), "POST", "/kanban/boards/b1/office-assignment", { officeId: "o1" }],
      [
        () => kanbanApi.offices.assignBoardCards("b1", "o1", ["c1"]),
        "POST",
        "/kanban/boards/b1/office-assignment",
        { officeId: "o1", cardIds: ["c1"] },
      ],
      [
        () => kanbanApi.offices.transferCard("b1", "c1", "o2", "motivo da troca"),
        "POST",
        "/kanban/boards/b1/cards/c1/office",
        { officeId: "o2", reason: "motivo da troca" },
      ],
      [() => kanbanApi.assignees.candidates("b1", "c1"), "GET", "/kanban/boards/b1/cards/c1/assignees/candidates", undefined],
      [
        () => kanbanApi.cards.create("b1", { boardColumnId: "col", title: "Lead", officeId: "o1" }),
        "POST",
        "/kanban/boards/b1/cards",
        { boardColumnId: "col", title: "Lead", officeId: "o1" },
      ],
    ];
    for (const [run, method, path, body] of calls) {
      await run();
      expect(lastCall(fetchMock)).toEqual({ method, path, body });
    }
  });

  it("expoe o codigo estruturado user_without_office", async () => {
    mockFetch(403, { code: USER_WITHOUT_OFFICE_CODE, message: "no office" });
    const error = await kanbanApi.cards.create("b1", { boardColumnId: "col", title: "Lead" }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(KanbanApiError);
    expect((error as KanbanApiError).code).toBe(USER_WITHOUT_OFFICE_CODE);
  });

  it("envia a chave de idempotencia no provisionamento de usuario", async () => {
    const fetchMock = mockFetch(202, { state: "completed" });
    await kanbanApi.offices.provisionUser(
      { identity: { documentType: "cpf", documentNumber: "00011122233", displayName: "A" } },
      "provision-123"
    );
    const [, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("provision-123");
  });
});
