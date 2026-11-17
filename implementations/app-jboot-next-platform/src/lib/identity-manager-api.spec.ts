import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("js-cookie", () => ({ default: { get: vi.fn(() => "identity-token") } }));
vi.mock("./identity-applications", () => ({ getIdentityApiUrl: () => "http://identity.test" }));

import { getModulePermissionCatalog, replaceManagedUserPermissions } from "./identity-manager-api";

afterEach(() => vi.unstubAllGlobals());

describe("identity manager permissions client", () => {
  it("loads the current module catalog with the bearer token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ scopes: [], roles: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getModulePermissionCatalog();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://identity.test/manager/module-permissions",
      { headers: { authorization: "Bearer identity-token" } }
    );
  });

  it("replaces only the selected module permissions", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await replaceManagedUserPermissions("identity-1", { scopes: ["flow:read"], roles: ["board_member"] });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://identity.test/manager/users/identity-1/module-permissions",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ scopes: ["flow:read"], roles: ["board_member"] })
      })
    );
  });
});
