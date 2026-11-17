import { describe, expect, it } from "vitest";
import { KanbanApiError } from "./kanban-api";
import { DJEN_CADENCE_OPTIONS, djenCadenceWarning, djenErrorMessage } from "./djen-control";

describe("djen control", () => {
  it("frequencias do DJEN sao 1, 3 e 7 dias uteis", () => {
    expect(DJEN_CADENCE_OPTIONS.map((option) => option.days)).toEqual([1, 3, 7]);
  });

  it("avisa risco de prazo acima de 1 dia util", () => {
    expect(djenCadenceWarning(1)).toBeNull();
    expect(djenCadenceWarning(3)).toContain("3 dias úteis");
    expect(djenCadenceWarning(7)).toContain("prazos curtos");
  });

  it("explica a recusa sem contrato", () => {
    const error = new KanbanApiError(403, JSON.stringify({ code: "process_publications_not_contracted", message: "x" }));
    expect(djenErrorMessage(error)).toContain("não contratadas");
    expect(djenErrorMessage(new Error("x"))).toContain("Não foi possível");
  });
});
