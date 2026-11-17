import { afterEach, describe, expect, it, vi } from "vitest";
import { kanbanApi, PriorLawsuitsDto } from "@/modules/kanban/lib/kanban-api";
import { priorLawsuitHistoryLabel, priorLawsuitsAlert } from "./customers/CustomerPriorLawsuitsStep";
import { userLawyerFormError } from "./users/FlowUserLawyerModal";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token"), getApplicationScopes: vi.fn(() => []) }));
afterEach(() => vi.unstubAllGlobals());

const base: PriorLawsuitsDto = { customerId: "c1", status: "missing", lawsuits: [], declaration: null, history: [] };

describe("acoes ja ajuizadas (S2)", () => {
  it("mostra a situacao da litispendencia", () => {
    expect(priorLawsuitsAlert(base).color).toBe("warning");
    const listed = priorLawsuitsAlert({
      ...base,
      status: "listed",
      lawsuits: [{ id: "l1", bank: "PAN", processNumber: "5001234-56.2024.8.24.0023", createdAt: "2026-10-28T10:00:00Z", createdByName: "Ana" }],
    });
    expect([listed.color, listed.text.startsWith("1 ação já ajuizada")]).toEqual(["info", true]);
    const declared = priorLawsuitsAlert({ ...base, status: "declared_none", declaration: { declaredAt: "2026-10-28T10:00:00Z", declaredByName: "Ana", origin: "manual" } });
    expect(declared.color).toBe("success");
    expect(declared.text).toContain("por Ana");
    const byDefault = priorLawsuitsAlert({ ...base, status: "declared_none", declaration: { declaredAt: "2026-10-29T10:00:00Z", declaredByName: "Ana", origin: "default" } });
    expect([byDefault.color, byDefault.text.includes("marcado por padrão"), byDefault.text.includes("Ana")]).toEqual(["success", true, false]);
  });

  it("descreve cada evento do historico", () => {
    expect(priorLawsuitHistoryLabel({ kind: "lawsuit_added", at: "x", byName: null, bank: "PAN", processNumber: "1" })).toBe("Incluiu PAN, processo 1");
    expect(priorLawsuitHistoryLabel({ kind: "declaration_revoked", at: "x", byName: null, reason: "lawsuit_added" })).toContain("pela inclusão");
    expect(priorLawsuitHistoryLabel({ kind: "declaration_revoked", at: "x", byName: null, reason: "withdrawn" })).toBe("Desfez a confirmação \"sem ações anteriores\"");
    expect(priorLawsuitHistoryLabel({ kind: "declared_none", at: "x", byName: null, origin: "default" })).toContain("marcado por padrão");
    expect(priorLawsuitHistoryLabel({ kind: "declared_none", at: "x", byName: null, origin: "manual" })).toBe("Confirmou que o cliente não tem ações anteriores");
  });

  it("chama as rotas da ficha", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(base), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await kanbanApi.priorLawsuits.add("c1", { bank: "PAN", processNumber: "5001234-56.2024.8.24.0023" });
    await kanbanApi.priorLawsuits.declareNone("c1");
    await kanbanApi.priorLawsuits.withdrawDeclaration("c1");
    const calls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => `${init.method} ${url.replace(/^.*\/kanban/, "/kanban")}`);
    expect(calls).toEqual([
      "POST /kanban/customers/c1/prior-lawsuits",
      "POST /kanban/customers/c1/prior-lawsuits/declaration",
      "DELETE /kanban/customers/c1/prior-lawsuits/declaration",
    ]);
  });
});

describe("advogado no cadastro do usuario (S7)", () => {
  it("confere OAB, UF unica e nome antes de enviar", () => {
    expect(userLawyerFormError({ signatureName: "", oabs: [] })).toBeNull();
    expect(userLawyerFormError({ signatureName: " ", oabs: [{ uf: "AM", number: "123" }] })).toMatch(/nome/);
    expect(userLawyerFormError({ signatureName: "Maria", oabs: [{ uf: "AM", number: "SC 123" }] })).toMatch(/OAB\/AM/);
    expect(userLawyerFormError({ signatureName: "Maria", oabs: [{ uf: "", number: "123" }] })).toMatch(/UF/);
    expect(userLawyerFormError({ signatureName: "Maria", oabs: [{ uf: "AM", number: "1" }, { uf: "AM", number: "2" }] })).toMatch(/Mais de uma/);
    expect(userLawyerFormError({ signatureName: "Maria", oabs: [{ uf: "AM", number: "12.345-a" }, { uf: "SC", number: "9" }] })).toBeNull();
  });

  it("chama as rotas do cadastro", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ identityId: "u1", signatureName: "Maria", oabs: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await kanbanApi.offices.userLawyer("u1");
    await kanbanApi.offices.replaceUserLawyer("u1", { signatureName: "Maria", oabs: [{ uf: "AM", number: "1" }] });
    const calls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => `${init.method ?? "GET"} ${url.replace(/^.*\/kanban/, "/kanban")}`);
    expect(calls).toEqual(["GET /kanban/settings/users/u1/lawyer", "PUT /kanban/settings/users/u1/lawyer"]);
  });
});
