import { describe, expect, it } from "vitest";
import { describeMonitoringCheck } from "./monitoring-check";

describe("describeMonitoringCheck", () => {
  it("sem acompanhamento ativo nao mostra nada", () => {
    expect(describeMonitoringCheck({ monitoring: false, lastCheck: { status: "success", checkedAt: "2026-11-08T20:00:00Z" } })).toBeNull();
  });

  it("antes da primeira consulta avisa que esta na fila", () => {
    expect(describeMonitoringCheck({ monitoring: true, lastCheck: null })).toEqual([{ tone: "muted", text: "Primeira consulta na fila do DataJud." }]);
  });

  it("falha aparece com o motivo e a proxima consulta", () => {
    const lines = describeMonitoringCheck({
      monitoring: true,
      lastCheck: { status: "timeout", checkedAt: "2026-11-08T20:04:30Z" },
      nextCheckAt: "2026-11-09T20:04:30Z",
    });
    expect(lines?.[0].tone).toBe("warning");
    expect(lines?.[0].text).toContain("não respondeu a tempo");
    expect(lines?.[1].text).toMatch(/^Próxima consulta a partir de /);
  });

  it("consulta com sucesso fica verde", () => {
    const lines = describeMonitoringCheck({ monitoring: true, lastCheck: { status: "success", checkedAt: "2026-11-08T20:04:30Z" } });
    expect(lines).toHaveLength(1);
    expect(lines?.[0].tone).toBe("success");
  });
});
