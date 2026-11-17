import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./module-auth-token", () => ({
  getApplicationAuthToken: () => "signed-flow-token",
}));
import { aiGatewayApi } from "./ai-gateway-api";
describe("aiGatewayApi", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ id: "agent-1" }) }),
    );
  });
  it("creates an agent without accepting tenant, owner or module from the UI", async () => {
    await aiGatewayApi.agents.create({
      credentialId: "credential-1",
      name: "UI UX",
      model: "unit-model",
      systemPrompt: "Review",
      responseMode: "json_schema",
      outputSchema: { type: "object" },
      allowedTools: ["kanban.card.append_activity"],
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("/v1/agents");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer signed-flow-token",
    });
    const body = JSON.parse(String(init?.body));
    expect(body.applicationSlug).toBeUndefined();
    expect(body.clientId).toBeUndefined();
    expect(body.ownerIdentityId).toBeUndefined();
    expect(body.allowedTools).toEqual(["kanban.card.append_activity"]);
  });
  it("executes an interaction without accepting tenant or owner from the UI", async () => {
    await aiGatewayApi.interactions.create(
      "agent-1",
      { message: "Review this" },
      "11111111-1111-4111-8111-111111111111",
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain("/v1/interactions");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer signed-flow-token",
      "Idempotency-Key": "11111111-1111-4111-8111-111111111111",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      agentId: "agent-1",
      requestId: "11111111-1111-4111-8111-111111111111",
      input: { message: "Review this" },
    });
  });

  it.each(["anthropic", "openai"])(
    "validates a new %s credential immediately so it can be selected by an agent",
    async (provider) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "credential-1",
            status: "pending_validation",
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "credential-1", status: "active" }),
        } as Response);

      const result = await aiGatewayApi.credentials.createAndValidate(
        provider,
        "unit_test-key",
      );
      expect(result.status).toBe("active");

      expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/v1/credentials");
      expect(vi.mocked(fetch).mock.calls[1][0]).toContain(
        "/v1/credentials/credential-1/test",
      );
    },
  );
  it("loads the provider catalog and credential models from authenticated endpoints", async () => {
    await aiGatewayApi.providers.list();
    await aiGatewayApi.tools.list();
    await aiGatewayApi.credentials.models("credential-1");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/v1/providers");
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain("/v1/tools");
    expect(vi.mocked(fetch).mock.calls[2][0]).toContain(
      "/v1/credentials/credential-1/models",
    );
  });
  it("does not report successful registration when validation fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "credential-1" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "ai_credential_invalid" }),
      } as Response);
    await expect(
      aiGatewayApi.credentials.createAndValidate("anthropic", "unit_test-key"),
    ).rejects.toThrow("ai_credential_invalid");
  });
  it("replaces an existing provider credential and validates the same record without sending owner context", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "existing-credential",
          provider: "anthropic",
          status: "pending_validation",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "active" }),
      } as Response);
    const result = await aiGatewayApi.credentials.createAndValidate(
      "anthropic",
      "unit_replacement-key",
    );
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual({
      provider: "anthropic",
      apiKey: "unit_replacement-key",
    });
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain(
      "/v1/credentials/existing-credential/test",
    );
    expect(result.id).toBe("existing-credential");
    expect(result.status).toBe("active");
    expect(JSON.stringify(result)).not.toContain("unit_replacement-key");
  });
});
