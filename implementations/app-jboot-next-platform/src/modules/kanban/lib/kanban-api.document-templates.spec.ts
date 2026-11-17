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
  return {
    path: new URL(url).pathname,
    method: init.method ?? "GET",
    body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    headers: new Headers(init.headers),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kanbanApi.caseTypes e kanbanApi.documentTemplates (Sprint 5)", () => {
  it("monta rota, metodo e corpo de cada operacao JSON", async () => {
    const fetchMock = mockFetch(200, {});
    const payload = {
      name: "Tipo",
      description: null,
      classificationCriteria: null,
      expectedEvidence: null,
      templateIds: ["t1"],
      defaultTemplateId: "t1",
    };
    const calls: Array<[() => Promise<unknown>, string, string, unknown]> = [
      [() => kanbanApi.caseTypes.list(), "GET", "/kanban/case-types", undefined],
      [() => kanbanApi.caseTypes.get("c1"), "GET", "/kanban/case-types/c1", undefined],
      [() => kanbanApi.caseTypes.create(payload), "POST", "/kanban/case-types", payload],
      [() => kanbanApi.caseTypes.update("c1", { active: false }), "PATCH", "/kanban/case-types/c1", { active: false }],
      [() => kanbanApi.documentTemplates.catalog(), "GET", "/kanban/template-variables", undefined],
      [() => kanbanApi.documentTemplates.list(), "GET", "/kanban/document-templates", undefined],
      [() => kanbanApi.documentTemplates.get("t1"), "GET", "/kanban/document-templates/t1", undefined],
      [
        () => kanbanApi.documentTemplates.create({ name: "M", description: null }),
        "POST",
        "/kanban/document-templates",
        { name: "M", description: null },
      ],
      [
        () => kanbanApi.documentTemplates.update("t1", { active: false }),
        "PATCH",
        "/kanban/document-templates/t1",
        { active: false },
      ],
      [() => kanbanApi.documentTemplates.getVersion("t1", "v1"), "GET", "/kanban/document-templates/t1/versions/v1", undefined],
      [
        () => kanbanApi.documentTemplates.updateVariables("t1", "v1", [{ key: "cliente.nome", required: false }]),
        "PATCH",
        "/kanban/document-templates/t1/versions/v1/variables",
        { variables: [{ key: "cliente.nome", required: false }] },
      ],
      [
        () => kanbanApi.documentTemplates.download("t1", "v1"),
        "GET",
        "/kanban/document-templates/t1/versions/v1/download",
        undefined,
      ],
    ];
    for (const [run, method, path, body] of calls) {
      await run();
      expect(lastCall(fetchMock)).toMatchObject({ method, path, body });
    }
  });

  it("envia a versao em multipart (campo file) sem fixar Content-Type", async () => {
    const fetchMock = mockFetch(201, { id: "v1" });
    const file = new File(["PK"], "modelo.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await kanbanApi.documentTemplates.uploadVersion("t1", file);
    const call = lastCall(fetchMock);
    expect([call.method, call.path]).toEqual(["POST", "/kanban/document-templates/t1/versions"]);
    expect(call.body).toBeInstanceOf(FormData);
    expect((call.body as FormData).get("file")).toBeInstanceOf(File);
    expect(call.headers.get("Content-Type")).toBeNull();
    expect(call.headers.get("Authorization")).toBe("Bearer flow-token");
  });

  it("erro 422 do upload expoe code e payload", async () => {
    mockFetch(422, { code: "template_raw_xml_forbidden", message: "Raw XML", tags: ["x"] });
    await expect(kanbanApi.documentTemplates.uploadVersion("t1", new File(["PK"], "m.docx"))).rejects.toMatchObject({
      status: 422,
      code: "template_raw_xml_forbidden",
      payload: { tags: ["x"] },
    });
  });
});
