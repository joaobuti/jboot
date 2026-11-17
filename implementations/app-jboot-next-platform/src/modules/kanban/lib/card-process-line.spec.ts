import { describe, expect, it } from "vitest";
import { cardProcessLine } from "./card-process-line";

describe("cardProcessLine", () => {
  it("mostra o processo abaixo do cliente", () => {
    expect(cardProcessLine({ title: "LUIZ FAGANELLO", sourcePayload: { processNumber: "50134007620264047003" } })).toBe(
      "Processo 5013400-76.2026.4.04.7003"
    );
  });

  it("le o numero do card exportado do DataJud", () => {
    expect(cardProcessLine({ title: "Cliente", sourcePayload: { numeroProcesso: "50134007620264047003" } })).toBe(
      "Processo 5013400-76.2026.4.04.7003"
    );
  });

  it("nao repete quando o titulo ja traz o numero", () => {
    expect(cardProcessLine({ title: "DataJud 5013400-76.2026.4.04.7003 - Procedimento", sourcePayload: { numeroProcesso: "50134007620264047003" } })).toBeNull();
    expect(cardProcessLine({ title: "Processo 5013400-76.2026.4.04.7003", sourcePayload: { processNumber: "50134007620264047003" } })).toBeNull();
  });

  it("sem processo, nada", () => {
    expect(cardProcessLine({ title: "SALIM", sourcePayload: null })).toBeNull();
    expect(cardProcessLine({ title: "SALIM", sourcePayload: { processNumber: "123" } })).toBeNull();
  });
});
