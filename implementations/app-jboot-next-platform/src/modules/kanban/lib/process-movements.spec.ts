import { describe, expect, it } from "vitest";
import { formatMovementDate, lookupEmptyMessage, movementsSummary, processDetailsLine, PROCESS_MOVEMENTS_PREVIEW, visibleMovements } from "./process-movements";

const item = (n: number, isNew = false) => ({ id: `m${n}`, description: `mov ${n}`, occurredAt: "2026-10-30T10:00:00Z", isNew });

describe("process movements", () => {
  it("recolhida mostra so as mais recentes; expandida mostra todas", () => {
    const items = Array.from({ length: 12 }, (_, n) => item(n));
    expect(visibleMovements(items, false)).toHaveLength(PROCESS_MOVEMENTS_PREVIEW);
    expect(visibleMovements(items, true)).toHaveLength(12);
  });

  it("resumo conta as novas a parte", () => {
    expect(movementsSummary([item(1), item(2, true)])).toBe("2 movimentações, 1 nova desde a entrada no Flow");
    expect(movementsSummary([item(1)])).toBe("1 movimentação");
  });

  it("movimentacao sem data nao inventa data", () => {
    expect(formatMovementDate(null)).toBe("Sem data");
  });

  it("linha de dados do processo junta so o que existe", () => {
    expect(processDetailsLine({ filedAt: "2026-07-17T16:35:27Z", className: "Procedimento do Juizado Especial Cível", courtName: "1ª Vara Federal de Maringá", systemName: "Projudi" }))
      .toBe("Ajuizado em 17/07/2026 · Procedimento do Juizado Especial Cível · 1ª Vara Federal de Maringá · sistema Projudi");
    expect(processDetailsLine({ filedAt: null, className: null, courtName: null, systemName: null })).toBeNull();
    expect(processDetailsLine(null)).toBeNull();
  });

  it("resposta vazia diz o periodo buscado", () => {
    expect(lookupEmptyMessage("2026-10-25", "2026-11-07")).toBe("Nenhuma publicação no DJEN entre 25/10/2026 e 07/11/2026.");
  });
});
