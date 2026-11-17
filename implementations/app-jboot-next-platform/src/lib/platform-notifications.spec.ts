import { describe, expect, it } from "vitest";
import { platformNotificationsToQueryString } from "./platform-notifications";

describe("platformNotificationsToQueryString", () => {
  it("omits empty filters", () => {
    expect(platformNotificationsToQueryString({})).toBe("");
    expect(platformNotificationsToQueryString({ applicationSlug: undefined })).toBe("");
  });

  it("serializes application, module and unread filters", () => {
    const query = platformNotificationsToQueryString({
      applicationSlug: "flow",
      moduleSlug: "kanban",
      unreadOnly: true,
    });
    const params = new URLSearchParams(query.slice(1));
    expect(params.get("applicationSlug")).toBe("flow");
    expect(params.get("moduleSlug")).toBe("kanban");
    expect(params.get("unreadOnly")).toBe("true");
  });
});
