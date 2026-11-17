import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./module-auth-token", () => ({
  getApplicationAuthToken: () => "signed-flow-token",
}));
import { aiGatewayApi } from "./ai-gateway-api";

afterEach(() => vi.unstubAllGlobals());

describe("aiGatewayApi routine agents", () => {
  it("sends routine fields only and never model or credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "agent-1" }) });
    vi.stubGlobal("fetch", fetchMock);
    await aiGatewayApi.agents.create({
      executionMode: "claude_routine",
      name: "Parecer",
      routineFireUrl: "https://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire",
      routineToken: "sk-ant-oat01-unitroutinetoken0000",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({
      executionMode: "claude_routine",
      name: "Parecer",
      routineFireUrl: "https://api.anthropic.com/v1/claude_code/routines/trig_01ABC/fire",
      routineToken: "sk-ant-oat01-unitroutinetoken0000",
    });
  });

  it("joins validation messages from the gateway into the error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: ["routine_fire_url_invalid", "routine_token_invalid"] }) }),
    );
    await expect(aiGatewayApi.agents.list()).rejects.toThrow("routine_fire_url_invalid; routine_token_invalid");
  });
});
