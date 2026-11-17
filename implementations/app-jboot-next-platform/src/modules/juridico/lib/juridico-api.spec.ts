import { afterEach, describe, expect, it, vi } from "vitest";
import { juridicoApi } from "./juridico-api";

describe("juridicoApi.domainIntegrations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads Flow boards through the domain integrations endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ flowEnabled: true, boards: [], offices: [{ id: "o1", name: "Matriz" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(juridicoApi.domainIntegrations.listFlowBoards()).resolves.toEqual({
      flowEnabled: true,
      boards: [],
      offices: [{ id: "o1", name: "Matriz" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/domain-integrations/flow/boards",
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it("exports a PJe communication to the selected Flow board and office", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          boardId: "11111111-1111-4111-8111-111111111111",
          cardId: "22222222-2222-4222-8222-222222222222",
          cardUrl: "/flow/boards/11111111-1111-4111-8111-111111111111?card=22222222-2222-4222-8222-222222222222",
          created: true,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    await expect(
      juridicoApi.domainIntegrations.exportPjeComunicacaoToFlow(
        "33333333-3333-4333-8333-333333333333",
        "11111111-1111-4111-8111-111111111111",
        "44444444-4444-4444-8444-444444444444"
      )
    ).resolves.toMatchObject({ created: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/domain-integrations/juridico/pje/comunicacoes/33333333-3333-4333-8333-333333333333/export-flow",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ boardId: "11111111-1111-4111-8111-111111111111", officeId: "44444444-4444-4444-8444-444444444444" }),
      })
    );
  });
});

describe("juridicoApi.datajud", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queries a process through the typed BFF endpoint", async () => {
    const payload = { requestId: "request-id", source: "datajud", capturedAt: "now", lagNotice: "notice", process: {} };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    await expect(juridicoApi.datajud.queryProcess("00012340820238260100", "TJSP")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8010/juridico/datajud/processos/consulta",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ numeroProcesso: "00012340820238260100", tribunal: "TJSP" }),
      })
    );
  });

  it("preserves structured problem details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ title: "Process not found", code: "process_not_found", requestId: "rid" }), {
        status: 404,
        headers: { "Content-Type": "application/problem+json" },
      })
    );
    await expect(juridicoApi.datajud.queryProcess("00012340820238260100")).rejects.toMatchObject({
      status: 404,
      code: "process_not_found",
      requestId: "rid",
    });
  });
});
