import { describe, expect, it } from "vitest";
import { monitoringItemHref, monitoringItemLabel } from "./monitoring-bell";

describe("sino do monitoramento", () => {
  it("leva ao board ja abrindo o card", () => {
    expect(monitoringItemHref({ boardId: "b1", cardId: "c1" })).toBe("/flow/boards/b1?card=c1");
  });

  it("mostra cliente e numero do processo, sem repetir o numero", () => {
    expect(monitoringItemLabel({ title: "LUIZ FAGANELLO", processNumber: "5013400-76.2026.4.04.7003" })).toBe("LUIZ FAGANELLO - 5013400-76.2026.4.04.7003");
    expect(monitoringItemLabel({ title: "DataJud 5013400-76.2026.4.04.7003 - Procedimento", processNumber: "5013400-76.2026.4.04.7003" }))
      .toBe("DataJud 5013400-76.2026.4.04.7003 - Procedimento");
  });
});
