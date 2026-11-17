import { afterEach, describe, expect, it, vi } from "vitest";
import { kanbanApi } from "./kanban-api";
import { getIdentityApiUrl } from "@/lib/identity-applications";
import { claudeConnectorOAuthApi } from "./claude-connector-oauth-api";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token") }));

afterEach(() => vi.unstubAllGlobals());

function recorder(body: unknown = { ok: true }, status = 200) {
  const fetchMock = vi.fn(async () =>
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return () =>
    (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => ({
      origin: new URL(String(url)).origin,
      path: new URL(String(url)).pathname,
      method: init?.method ?? "GET",
      auth: new Headers(init?.headers).get("Authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    }));
}

describe("Claude connector clients", () => {
  it("reads and writes tenant settings on the Flow BFF", async () => {
    const calls = recorder();
    await kanbanApi.claudeConnector.getSettings();
    await kanbanApi.claudeConnector.saveSettings({ enabled: true, maskPersonalData: true, acceptPolicy: true });
    expect(calls().map(({ path, method, body }) => ({ path, method, body }))).toEqual([
      { path: "/kanban/settings/claude-connector", method: "GET", body: null },
      { path: "/kanban/settings/claude-connector", method: "PUT", body: { enabled: true, maskPersonalData: true, acceptPolicy: true } },
    ]);
  });

  it("sends consent and connection calls to Identity with the Flow token", async () => {
    const calls = recorder({ data: [] });
    const requestId = "33333333-3333-4333-8333-333333333333";
    await claudeConnectorOAuthApi.getAuthorizationRequest(requestId);
    await claudeConnectorOAuthApi.decide(requestId, false);
    await claudeConnectorOAuthApi.listConnections();
    const recorded = calls();
    expect(recorded.every((call) => call.origin === new URL(getIdentityApiUrl()).origin && call.auth === "Bearer flow-token")).toBe(true);
    expect(recorded.map(({ path, method, body }) => ({ path, method, body }))).toEqual([
      { path: `/oauth/requests/${requestId}`, method: "GET", body: null },
      { path: `/oauth/requests/${requestId}/decision`, method: "POST", body: { approve: false } },
      { path: "/oauth/grants", method: "GET", body: null },
    ]);
  });

  it("revokes a connection and tolerates the empty 204", async () => {
    const calls = recorder(null, 204);
    await expect(claudeConnectorOAuthApi.revokeConnection("44444444-4444-4444-8444-444444444444")).resolves.toBeUndefined();
    expect(calls()[0]).toMatchObject({ path: "/oauth/grants/44444444-4444-4444-8444-444444444444", method: "DELETE" });
  });
});
