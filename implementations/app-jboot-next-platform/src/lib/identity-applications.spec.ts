import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentityDestination } from "./identity-applications";

// `identity-applications` le `NEXT_PUBLIC_*` no import (fallbackLaunchUrlBySlug).
// Remove as variaveis e reimporta o modulo a cada teste para nao depender do ambiente.
let resolveDestinationLaunchUrl: typeof import("./identity-applications").resolveDestinationLaunchUrl;

beforeEach(async () => {
  for (const name of [
    "NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL",
    "NEXT_PUBLIC_JBOOT_IDENTITY_WEB_URL",
    "NEXT_PUBLIC_JBOOT_IDENTITY_API_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_COOKIE_DOMAIN",
  ]) {
    vi.stubEnv(name, undefined);
  }
  vi.resetModules();
  ({ resolveDestinationLaunchUrl } = await import("./identity-applications"));
});

afterEach(() => vi.unstubAllEnvs());

const baseDestination: IdentityDestination = {
  clientId: "client-1",
  clientName: "Cliente Demo",
  applicationId: "app-1",
  applicationSlug: "flow",
  applicationName: "Flow",
  roles: ["admin"],
  scopes: ["flow:admin"],
};

describe("resolveDestinationLaunchUrl", () => {
  it("prefers launchUrl provided by Identity", () => {
    expect(resolveDestinationLaunchUrl({ ...baseDestination, launchUrl: "/custom" })).toBe("/custom");
  });

  it("falls back to known platform module routes", () => {
    const platformUrl = process.env.NEXT_PUBLIC_JBOOT_PLATFORM_WEB_URL?.replace(/\/$/, "");
    expect(resolveDestinationLaunchUrl(baseDestination)).toBe(platformUrl ? `${platformUrl}/flow` : "/flow");
  });
});
