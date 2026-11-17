import { afterEach, describe, expect, it, vi } from "vitest";
import { CUSTOMER_OUTSIDE_BOARDS_CODE, KanbanApiError, OVERRIDE_NOT_ALLOWED_CODE, kanbanApi } from "./kanban-api";

vi.mock("@/lib/module-auth-token", () => ({
  getApplicationAuthToken: vi.fn(() => "flow-token"),
}));

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kanbanApi.cardCustomer", () => {
  it("sends the CPF only in the POST body of lookup, never in the URL", async () => {
    const fetchMock = mockFetch(200, { status: "outside_boards" });
    const result = await kanbanApi.cardCustomer.lookup("board-1", "card-1", "52998224725");
    expect(result).toEqual({ status: "outside_boards" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/kanban\/boards\/board-1\/cards\/card-1\/customer\/lookup$/);
    expect(url).not.toContain("52998224725");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ cpf: "52998224725" });
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer flow-token");
  });

  it("exposes the structured 409 customer_outside_boards code on link", async () => {
    mockFetch(409, { code: CUSTOMER_OUTSIDE_BOARDS_CODE, message: "Cliente cadastrado fora dos seus quadros" });
    const error = await kanbanApi.cardCustomer
      .link("board-1", "card-1", { cpf: "52998224725" })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(KanbanApiError);
    expect((error as KanbanApiError).status).toBe(409);
    expect((error as KanbanApiError).code).toBe(CUSTOMER_OUTSIDE_BOARDS_CODE);
    expect((error as KanbanApiError).detail).toBe("Cliente cadastrado fora dos seus quadros");
  });

  it("uses PUT to link and PATCH to update", async () => {
    const fetchMock = mockFetch(200, { customer: null, link: null, canEdit: true, outcome: "created" });
    await kanbanApi.cardCustomer.link("b", "c", { cpf: "52998224725", customer: { name: "Maria" } });
    await kanbanApi.cardCustomer.update("b", "c", { juridico: { profissao: null } });
    const methods = fetchMock.mock.calls.map((call) => (call as unknown as [string, RequestInit])[1].method);
    expect(methods).toEqual(["PUT", "PATCH"]);
  });

  it("keeps the raw body as message for non-JSON errors", async () => {
    mockFetch(500, "upstream exploded");
    const error = (await kanbanApi.cardCustomer.get("b", "c").catch((err: unknown) => err)) as KanbanApiError;
    expect(error.message).toBe("upstream exploded");
    expect(error.code).toBeNull();
  });

  it("keeps canOverride from the lookup and sends override only in the PUT body (Sprint 3)", async () => {
    const lookupFetch = mockFetch(200, { status: "outside_boards", canOverride: true });
    expect(await kanbanApi.cardCustomer.lookup("b", "c", "52998224725")).toEqual({ status: "outside_boards", canOverride: true });
    expect(lookupFetch).toHaveBeenCalledTimes(1);

    const linkFetch = mockFetch(200, { customer: null, link: null, canEdit: true, outcome: "linked" });
    await kanbanApi.cardCustomer.link("b", "c", { cpf: "52998224725", override: { reason: "Transferido da base" } });
    const [url, init] = linkFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("Transferido");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ cpf: "52998224725", override: { reason: "Transferido da base" } });
  });

  it("exposes the structured 403 override_not_allowed code", async () => {
    mockFetch(403, { code: OVERRIDE_NOT_ALLOWED_CODE, message: "Only a Flow tenant admin" });
    const error = (await kanbanApi.cardCustomer
      .link("b", "c", { cpf: "52998224725", override: { reason: "Transferido da base" } })
      .catch((err: unknown) => err)) as KanbanApiError;
    expect(error.status).toBe(403);
    expect(error.code).toBe(OVERRIDE_NOT_ALLOWED_CODE);
  });
});
