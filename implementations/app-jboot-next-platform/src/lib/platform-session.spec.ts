import { describe, expect, it } from "vitest";
import { firstName, readPlatformSession } from "./platform-session";

describe("platform session", () => {
  it("le nome e destino do cookie authUser", () => {
    const cookie = `other=1; authUser=${encodeURIComponent(JSON.stringify({ identity: { displayName: "JOSÉ EDERVANDES" }, destination: { applicationSlug: "flow" } }))}`;
    expect(readPlatformSession(cookie)).toEqual({ displayName: "JOSÉ EDERVANDES", applicationSlug: "flow" });
    expect(readPlatformSession("x=1")).toEqual({ displayName: null, applicationSlug: null });
    expect(readPlatformSession("authUser=%7Bquebrado")).toEqual({ displayName: null, applicationSlug: null });
  });

  it("primeiro nome com so a primeira letra maiuscula", () => {
    expect(firstName("JOSÉ EDERVANDES VIDAL CHAGAS")).toBe("José");
    expect(firstName("  ana maria ")).toBe("Ana");
    expect(firstName(null)).toBe("");
  });
});
