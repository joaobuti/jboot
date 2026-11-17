import { afterEach, describe, expect, it, vi } from "vitest";
import { kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { attemptLabel, canRetry, errorLabel, oldestPendingMinutes } from "./email-dispatches";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token") }));
afterEach(() => vi.unstubAllGlobals());

describe("envios de e-mail das automacoes", () => {
  it("so falha terminal pode ser reprocessada", () => {
    expect(canRetry({ status: "failed" })).toBe(true);
    expect(canRetry({ status: "pending" })).toBe(false);
    expect(canRetry({ status: "processing" })).toBe(false);
  });

  it("descreve tentativas, primeiro envio e esgotamento", () => {
    expect(attemptLabel({ status: "pending", attemptCount: 0 }, 5)).toBe("Primeiro envio");
    expect(attemptLabel({ status: "pending", attemptCount: 2 }, 5)).toBe("2 de 5");
    expect(attemptLabel({ status: "failed", attemptCount: 5 }, 5)).toBe("5 de 5 (esgotadas)");
  });

  it("mede a espera do pendente mais antigo e traduz codigos conhecidos", () => {
    expect(oldestPendingMinutes(null)).toBeNull();
    expect(oldestPendingMinutes("2026-10-17T10:00:00.000Z", Date.parse("2026-10-17T10:12:00.000Z"))).toBe(12);
    expect(errorLabel("stuck_before_outbox")).toMatch(/reprocessar/);
    expect(errorLabel("421 Service not available")).toBe("421 Service not available");
    expect(errorLabel(null)).toBe("—");
  });

  it("usa as rotas do BFF", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await kanbanApi.emailDispatches.list("failed");
    await kanbanApi.emailDispatches.list();
    await kanbanApi.emailDispatches.retry("d1");
    const calls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => {
      const parsed = new URL(url);
      return [init?.method ?? "GET", parsed.pathname + parsed.search];
    });
    expect(calls).toEqual([
      ["GET", "/kanban/automation-dispatches?status=failed"],
      ["GET", "/kanban/automation-dispatches"],
      ["POST", "/kanban/automation-dispatches/d1/retry"],
    ]);
  });
});
