import { afterEach, describe, expect, it, vi } from "vitest";
import { agentActionConfig, agentOutcome, documentListLabel, entryRequirementsLabel, expectedResultLabel, isAutomationAgent, keptAgentActionConfig } from "./AutomationRulesSettings";
import { BoardColumnDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { movementActionConfig, movementDestinations } from "@/modules/kanban/lib/automation-movement";
import type { AiAgent } from "@/lib/ai-gateway-api";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token") }));
afterEach(() => vi.unstubAllGlobals());

const agent = (executionMode: AiAgent["executionMode"]) => ({ id: "55555555-5555-4555-8555-555555555555", executionMode }) as AiAgent;

describe("execute_ai_agent action config", () => {
  it("uses the connection mode and tool policy of the agent", () => {
    expect(agentActionConfig(agent("api"))).toEqual({
      agentId: "55555555-5555-4555-8555-555555555555",
      connectionMode: "api_key",
      inputPolicyVersion: 1,
      toolPolicyVersion: "2026-10-21.v1",
      expectedResult: "comment",
    });
    expect(agentActionConfig(agent("claude_routine"))).toEqual({
      agentId: "55555555-5555-4555-8555-555555555555",
      connectionMode: "claude_routine",
      inputPolicyVersion: 1,
      toolPolicyVersion: "claude_routine.v1",
      expectedResult: "comment",
    });
  });

  it("routine carries the document list only when some document is left out (ADR 019)", () => {
    const all = ["identidade", "cpf", "comprovante_residencia", "declaracao_residencia_terceiro", "extrato_beneficio", "promobank", "hiscred"] as const;
    expect(agentActionConfig(agent("claude_routine"), [...all])).not.toHaveProperty("customerDocumentTypes");
    expect(agentActionConfig(agent("claude_routine"), ["hiscred"]).customerDocumentTypes).toEqual(["hiscred"]);
    expect(agentActionConfig(agent("api"), ["hiscred"])).not.toHaveProperty("customerDocumentTypes");
    expect(documentListLabel(["extrato_beneficio", "hiscred"])).toBe(" · documentos: HISCON, HISCRED");
    expect(documentListLabel(["promobank"])).toBe(" · documentos: Promobank");
    expect(documentListLabel([])).toBe(" · sem documentos do cliente");
    expect(documentListLabel(undefined)).toBe("");
  });

  it("names the entry requirements of a require_to_enter rule (S1)", () => {
    expect(entryRequirementsLabel(["customer_hiscon"])).toBe("HISCON do cliente");
    expect(entryRequirementsLabel(undefined)).toBe("nenhum");
  });

  it("lists only agents whose result can reach the card", () => {
    const base = { status: "active", executionMode: "api", provider: "openai", allowedTools: ["kanban.card.append_activity"] } as AiAgent;
    expect(isAutomationAgent(base)).toBe(true);
    expect(isAutomationAgent({ ...base, allowedTools: [] })).toBe(false);
    expect(isAutomationAgent({ ...base, provider: "anthropic" })).toBe(false);
    expect(isAutomationAgent({ ...base, status: "inactive" })).toBe(false);
    expect(isAutomationAgent({ ...base, executionMode: "claude_routine", provider: "claude_routine", allowedTools: [] })).toBe(true);
    expect(isAutomationAgent({ ...base, executionMode: "claude_routine", status: "inactive" })).toBe(false);
  });

  it("creates the rule without recipient", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "rule" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await kanbanApi.automationRules.create("board", "column", {
      triggerType: "column_entered",
      actionType: "execute_ai_agent",
      actionConfig: agentActionConfig(agent("claude_routine")),
    });
    const [, init] = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0];
    const body = JSON.parse(String(init.body));
    expect(body.recipientRole).toBeUndefined();
    expect(body.actionConfig.connectionMode).toBe("claude_routine");
  });

  it("editing a rule with another user's agent keeps the agent and changes only the documents", () => {
    const saved = { ...agentActionConfig(agent("claude_routine")), customerDocumentTypes: ["hiscred" as const] };
    expect(keptAgentActionConfig(saved, ["extrato_beneficio"])).toEqual({ ...saved, customerDocumentTypes: ["extrato_beneficio"] });
    const all = ["identidade", "cpf", "comprovante_residencia", "declaracao_residencia_terceiro", "extrato_beneficio", "promobank", "hiscred"] as const;
    expect(keptAgentActionConfig(saved, [...all])).not.toHaveProperty("customerDocumentTypes");
    expect(keptAgentActionConfig(agentActionConfig(agent("api")), ["hiscred"])).toEqual(agentActionConfig(agent("api")));
  });

  it("move_card leva so a coluna de destino ativa e diferente da origem (flow-ai-completion-sprints.md)", () => {
    const columns = [
      { id: "c1", status: "active" },
      { id: "c2", status: "active" },
      { id: "c3", status: "archived" },
    ] as BoardColumnDto[];
    expect(movementDestinations(columns, "c1").map((column) => column.id)).toEqual(["c2"]);
    expect(movementActionConfig(columns, "c1", "c2")).toEqual({ toBoardColumnId: "c2" });
    expect(() => movementActionConfig(columns, "c1", "c3")).toThrow();
    expect(agentActionConfig(agent("claude_routine"))).not.toHaveProperty("toBoardColumnId");
  });

  it("sends the expected result; the generator only for initial petitions (ADR 020)", () => {
    expect(agentOutcome(true, "action_analysis", "ai")).toEqual({ expectedResult: "action_analysis" });
    expect(agentOutcome(true, "initial_petitions", "ai")).toEqual({ expectedResult: "initial_petitions", documentGenerator: "ai" });
    // Chave de API so comenta.
    expect(agentOutcome(false, "initial_petitions", "flow")).toEqual({ expectedResult: "comment" });
    const petitions = agentActionConfig(agent("claude_routine"), undefined, agentOutcome(true, "initial_petitions", "flow"));
    expect([petitions.expectedResult, petitions.documentGenerator]).toEqual(["initial_petitions", "flow"]);
    const back = keptAgentActionConfig(petitions, [], agentOutcome(true, "comment", "flow"));
    expect(back.expectedResult).toBe("comment");
    expect(back).not.toHaveProperty("documentGenerator");
    expect(expectedResultLabel(petitions)).toBe(" · resultado: peticoes iniciais (documento: Flow)");
    expect(expectedResultLabel({})).toBe(" · resultado: comentario");
  });

  it("edits the rule documents through PATCH", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "rule" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await kanbanApi.automationRules.update("board", "column", "rule", {
      triggerType: "column_entered",
      triggerConfig: {},
      actionConfig: agentActionConfig(agent("claude_routine"), ["extrato_beneficio"]),
    });
    const [url, init] = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0];
    expect(url).toContain("/kanban/boards/board/columns/column/automation-rules/rule");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(String(init.body));
    expect(body.actionType).toBeUndefined();
    expect(body.actionConfig.customerDocumentTypes).toEqual(["extrato_beneficio"]);
  });
});
