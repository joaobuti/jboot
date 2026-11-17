import { describe, expect, it } from "vitest";
import { formatCnj, isValidCnj, normalizeCnj } from "./cnj";

describe("CNJ input", () => {
  it("formats pasted digits without changing their value", () => {
    expect(formatCnj("00012340820238260100")).toBe("0001234-08.2023.8.26.0100");
    expect(normalizeCnj("0001234-08.2023.8.26.0100")).toBe("00012340820238260100");
  });

  it("validates the modulo 97 check digits", () => {
    expect(isValidCnj("0001234-08.2023.8.26.0100")).toBe(true);
    expect(isValidCnj("0001234-56.2023.8.26.0100")).toBe(false);
  });
});
