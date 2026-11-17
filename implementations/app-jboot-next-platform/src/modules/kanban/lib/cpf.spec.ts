import { describe, expect, it } from "vitest";
import { cpfDigits, formatCpf, isValidCpf } from "./cpf";

// CPFs sinteticos (digitos verificadores validos, sem titular real).
describe("cpf helpers", () => {
  it("keeps only up to 11 digits", () => {
    expect(cpfDigits("529.982.247-25")).toBe("52998224725");
    expect(cpfDigits("529982247251234")).toBe("52998224725");
  });

  it("formats progressively while typing", () => {
    expect(formatCpf("529")).toBe("529");
    expect(formatCpf("5299")).toBe("529.9");
    expect(formatCpf("5299822")).toBe("529.982.2");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });

  it("validates check digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("11144477735")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
  });
});
