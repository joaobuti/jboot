import { afterEach, describe, expect, it, vi } from "vitest";
import { kanbanApi } from "./kanban-api";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token") }));

afterEach(() => vi.unstubAllGlobals());

describe("kanbanApi.customers", () => {
  it("uses the frozen Flow customer routes and idempotency header", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await kanbanApi.customers.list({ page: 2, pageSize: 10, search: "Maria" });
    await kanbanApi.customers.create({ name: "Maria", officeIds: ["office-1"] });
    await kanbanApi.customers.update("customer-1", { phone: null });
    await kanbanApi.customers.cards("customer-1");
    await kanbanApi.customers.createCard("customer-1", "command-123", {
      boardId: "board-1", columnId: "column-1", officeId: "office-1", title: "Caso Maria",
    });
    await kanbanApi.customers.linkCard("customer-1", "card-1", "board-1");

    const calls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => ({
      path: new URL(String(url)).pathname,
      search: new URL(String(url)).search,
      method: (init as RequestInit | undefined)?.method ?? "GET",
      idempotency: new Headers((init as RequestInit | undefined)?.headers).get("Idempotency-Key"),
    }));
    expect(calls).toEqual([
      { path: "/kanban/customers", search: "?page=2&pageSize=10&search=Maria", method: "GET", idempotency: null },
      { path: "/kanban/customers", search: "", method: "POST", idempotency: null },
      { path: "/kanban/customers/customer-1", search: "", method: "PATCH", idempotency: null },
      { path: "/kanban/customers/customer-1/cards", search: "", method: "GET", idempotency: null },
      { path: "/kanban/customers/customer-1/cards", search: "", method: "POST", idempotency: "command-123" },
      { path: "/kanban/customers/customer-1/cards/card-1", search: "", method: "PATCH", idempotency: null },
    ]);
  });
});
