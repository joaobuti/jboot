import { afterEach, describe, expect, it, vi } from "vitest";
import { kanbanApi } from "./kanban-api";

vi.mock("@/lib/module-auth-token", () => ({
  getApplicationAuthToken: vi.fn(() => "flow-token"),
}));

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
  const parsed = new URL(url);
  return {
    path: parsed.pathname,
    search: parsed.search,
    method: init.method ?? "GET",
    body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    headers: new Headers(init.headers),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = "/kanban/boards/b1/cards/c1";

describe("kanbanApi.leadAnalysis e documentos entregues (Sprint 6)", () => {
  it("monta rota, metodo e corpo de cada operacao JSON", async () => {
    const fetchMock = mockFetch(200, {});
    const calls: Array<[() => Promise<unknown>, string, string, unknown, string?]> = [
      [() => kanbanApi.leadAnalysis.get("b1", "c1"), "GET", `${base}/analysis`, undefined],
      [() => kanbanApi.leadAnalysis.addCase("b1", "c1", "t1"), "POST", `${base}/analysis/cases`, { caseTypeId: "t1" }],
      [
        () => kanbanApi.leadAnalysis.changeCase("b1", "c1", "k1", "t2", "motivo da troca"),
        "PATCH",
        `${base}/analysis/cases/k1`,
        { caseTypeId: "t2", reason: "motivo da troca" },
      ],
      [
        () => kanbanApi.leadAnalysis.removeCase("b1", "c1", "k1", "motivo da remocao"),
        "POST",
        `${base}/analysis/cases/k1/remove`,
        { reason: "motivo da remocao" },
      ],
      [() => kanbanApi.leadAnalysis.generate("b1", "c1", "k1", "m1"), "POST", `${base}/analysis/cases/k1/documents`, { templateId: "m1" }],
      [() => kanbanApi.leadAnalysis.generate("b1", "c1", "k1"), "POST", `${base}/analysis/cases/k1/documents`, {}],
      [() => kanbanApi.leadAnalysis.approve("b1", "c1", "d1"), "POST", `${base}/analysis/documents/d1/approve`, undefined],
      [() => kanbanApi.leadAnalysis.retryPdf("b1", "c1", "d1"), "POST", `${base}/analysis/documents/d1/pdf/retry`, undefined],
      [() => kanbanApi.leadAnalysis.download("b1", "c1", "d1", "pdf"), "GET", `${base}/analysis/documents/d1/download`, undefined, "?format=pdf"],
      [() => kanbanApi.leads.documents("b1", "c1"), "GET", `${base}/lead/documents`, undefined],
      [() => kanbanApi.leads.downloadDocument("b1", "c1", "d1", "docx"), "GET", `${base}/lead/documents/d1/download`, undefined, "?format=docx"],
    ];
    for (const [call, method, path, body, search] of calls) {
      await call();
      const sent = lastCall(fetchMock);
      expect([sent.method, sent.path, sent.body]).toEqual([method, path, body]);
      expect(sent.search).toBe(search ?? "");
      expect(sent.headers.get("Authorization")).toBe("Bearer flow-token");
    }
  });

  it("versao editada vai em multipart com o campo file e sem Content-Type manual", async () => {
    const fetchMock = mockFetch(201, { documentId: "d2", warnings: [], analysis: {} });
    const file = new File(["PK"], "revisado.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await kanbanApi.leadAnalysis.uploadEditedVersion("b1", "c1", "d1", file);
    const sent = lastCall(fetchMock);
    expect([sent.method, sent.path]).toEqual(["POST", `${base}/analysis/documents/d1/edited-version`]);
    expect((sent.body as FormData).get("file")).toBeInstanceOf(File);
    expect(sent.headers.get("Content-Type")).toBeNull();
  });
});
