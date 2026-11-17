import { describe, expect, it } from "vitest";
import { brDateToIso, isoToBrDate } from "./br-date";

describe("data no padrao brasileiro", () => {
  it("exibe a data da API como DD/MM/AAAA", () => {
    expect(isoToBrDate("1962-01-10")).toBe("10/01/1962");
    expect([isoToBrDate(null), isoToBrDate("")]).toEqual(["", ""]);
  });

  it("converte o digitado para a API e recusa data inexistente ou fora do padrao", () => {
    expect(brDateToIso(" 10/01/1962 ")).toBe("1962-01-10");
    expect(brDateToIso("30/02/1962")).toBeNull();
    expect(brDateToIso("1962-01-10")).toBeNull();
    expect(brDateToIso("10/1/1962")).toBeNull();
  });
});
