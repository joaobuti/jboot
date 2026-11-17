import { describe, expect, it } from "vitest";
import { canManageModuleUsers, moduleSettings } from "./module-settings";

describe("moduleSettings", () => {
  it("makes permissions global but requires users:manage", () => {
    expect(moduleSettings("juridico", []).map((item) => item.id)).toEqual([]);
    expect(
      moduleSettings("juridico", ["users:manage"]).map((item) => item.id),
    ).toEqual(["permissions"]);
    expect(
      moduleSettings("juridico", ["users:manage"])[0]?.href("juridico"),
    ).toBe("/juridico/configuracoes/permissoes");
  });

  it("contributes Google Drive only to Flow", () => {
    expect(
      moduleSettings("pdv", ["users:manage", "flow:admin"]).map(
        (item) => item.id,
      ),
    ).toEqual(["permissions"]);
    expect(
      moduleSettings("flow", ["users:manage", "flow:admin"]).map(
        (item) => item.id,
      ),
    ).toEqual(["permissions", "google-drive", "email-dispatches", "customer-validation"]);
  });

  it("shows customer validation settings to flow:admin and to AI agent permissions (office responsible)", () => {
    const item = moduleSettings("flow", ["flow:admin"]).find((entry) => entry.id === "customer-validation");
    expect(item?.group).toBe("ai");
    expect(item?.href("flow")).toBe("/flow/configuracoes/ia/validacao-cadastro");
    expect(moduleSettings("flow", ["flow:read"]).some((entry) => entry.id === "customer-validation")).toBe(false);
    expect(moduleSettings("flow", ["flow:read", "ai:agents:read"]).some((entry) => entry.id === "customer-validation")).toBe(true);
  });

  it("shows Flow e-mail dispatches only to flow:admin", () => {
    expect(moduleSettings("flow", ["flow:read"]).map((item) => item.id)).not.toContain("email-dispatches");
    const item = moduleSettings("flow", ["flow:admin"]).find((entry) => entry.id === "email-dispatches");
    expect(item?.href("flow")).toBe("/flow/configuracoes/envios-email");
    expect(item?.group).toBeUndefined();
  });

  it("shows the Claude connector to every Flow user and nowhere else", () => {
    const flowItems = moduleSettings("flow", ["flow:read"]);
    expect(flowItems.map((item) => item.id)).toEqual(["claude-connector"]);
    expect(flowItems[0]?.group).toBe("ai");
    expect(flowItems[0]?.href("flow")).toBe("/flow/configuracoes/ia/conector-claude");
    expect(moduleSettings("juridico", ["flow:read"])).toEqual([]);
  });

  it("contributes the AI group only to Flow with dedicated scopes", () => {
    expect(
      moduleSettings("juridico", ["ai:credentials:manage", "ai:agents:manage"]),
    ).toEqual([]);
    const items = moduleSettings("flow", [
      "ai:credentials:manage",
      "ai:agents:manage",
    ]);
    // Com permissao de IA, o responsavel de escritorio tambem ve a validacao de cadastro (S4).
    expect(items.map((item) => item.id)).toEqual([
      "ai-credentials",
      "ai-agents",
      "customer-validation",
    ]);
    expect(items.every((item) => item.group === "ai")).toBe(true);
  });

  it("shows module user management only with users:manage", () => {
    expect(canManageModuleUsers([])).toBe(false);
    expect(canManageModuleUsers(["flow:admin"])).toBe(false);
    expect(canManageModuleUsers(["users:manage"])).toBe(true);
  });
});
