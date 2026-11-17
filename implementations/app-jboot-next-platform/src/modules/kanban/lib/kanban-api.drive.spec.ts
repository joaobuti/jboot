import { afterEach, describe, expect, it, vi } from "vitest";
import { kanbanApi } from "./kanban-api";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token") }));

afterEach(() => vi.unstubAllGlobals());

describe("kanbanApi.drive", () => {
  it("uses the frozen Drive routes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const redirectUri = "http://localhost:3002/flow/configuracoes/google-drive";

    await kanbanApi.drive.getConfiguration();
    await kanbanApi.drive.startConnect(redirectUri);
    await kanbanApi.drive.completeConnect({ code: "c", state: "s", redirectUri });
    await kanbanApi.drive.pickerToken();
    await kanbanApi.drive.saveConfiguration({ rootFolderId: "folder_1", enabled: true });
    await kanbanApi.drive.disconnect();

    const calls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => ({
      path: new URL(String(url)).pathname,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    }));
    expect(calls).toEqual([
      { path: "/kanban/settings/google-drive", method: "GET", body: null },
      { path: "/kanban/settings/google-drive/connect", method: "POST", body: { redirectUri } },
      { path: "/kanban/settings/google-drive/connect/complete", method: "POST", body: { code: "c", state: "s", redirectUri } },
      { path: "/kanban/settings/google-drive/picker-token", method: "POST", body: null },
      { path: "/kanban/settings/google-drive", method: "PUT", body: { rootFolderId: "folder_1", enabled: true } },
      { path: "/kanban/settings/google-drive", method: "DELETE", body: null },
    ]);
  });
});
