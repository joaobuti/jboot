import { describe, expect, it, vi } from "vitest";
import { InitialPetitionDto, KanbanApiError, kanbanApi } from "./kanban-api";
import { canRegisterProcessNumber, describePetitionMonitoringError, formatCnjInput, isValidCnjInput, normalizeCnjInput } from "./petition-monitoring";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: () => "flow-token" }));

// Sintetico, digito verificador valido (TJSP); nao identifica processo real.
const VALID = "00000016820268260100";

describe("numero do processo (CNJ)", () => {
  it("mascara enquanto digita e normaliza para 20 digitos", () => {
    expect(formatCnjInput("0000001")).toBe("0000001");
    expect(formatCnjInput("000000168")).toBe("0000001-68");
    expect(formatCnjInput(VALID)).toBe("0000001-68.2026.8.26.0100");
    expect(normalizeCnjInput("0000001-68.2026.8.26.0100 extra 99")).toBe(VALID);
  });

  it("confere o digito verificador", () => {
    expect(isValidCnjInput(VALID)).toBe(true);
    expect(isValidCnjInput("00000010020268260100")).toBe(false);
    expect(isValidCnjInput("123")).toBe(false);
  });

  it("so peticao aprovada e sem numero oferece o registro", () => {
    const base = { document: { status: "aprovado" }, protocolNumber: null } as unknown as InitialPetitionDto;
    expect(canRegisterProcessNumber(base)).toBe(true);
    expect(canRegisterProcessNumber({ ...base, protocolNumber: VALID })).toBe(false);
    expect(canRegisterProcessNumber({ ...base, document: { ...base.document!, status: "rascunho" } })).toBe(false);
  });

  it("duplicidade traz o link do card que ja usa o numero", () => {
    const error = new KanbanApiError(409, JSON.stringify({ code: "process_number_in_use", message: "x", cardUrl: "/flow/boards/b?card=c" }));
    expect(describePetitionMonitoringError(error, "fallback")).toEqual({ message: "Já existe um card com este número do processo.", cardUrl: "/flow/boards/b?card=c" });
  });

  it("processo acompanhado no Juridico e capacidade nao contratada tem mensagem propria, sem link", () => {
    const inUse = new KanbanApiError(409, JSON.stringify({ code: "process_monitor_in_use", message: "x", destinationProduct: "juridico" }));
    expect(describePetitionMonitoringError(inUse, "fallback")).toEqual({ message: "Este processo já é acompanhado no Jurídico.", cardUrl: null });
    const notContracted = new KanbanApiError(403, JSON.stringify({ code: "process_monitoring_not_contracted", message: "x" }));
    expect(describePetitionMonitoringError(notContracted, "fallback").message).toMatch(/Monitoramento processual contratado/);
  });
});

describe("cliente HTTP do Monitorar", () => {
  it("registra o numero e envia peticoes ao board de monitoramento", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ run: null, canRegisterProtocol: true, sent: [] }), { status: 200 }));
    await kanbanApi.initialPetitions.registerProtocol("board", "card", "petition", VALID);
    await kanbanApi.petitionMonitoring.send("card", ["petition"], "target");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/kanban\/boards\/board\/cards\/card\/initial-petitions\/petition\/protocol$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ processNumber: VALID });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/domain-integrations\/flow\/cards\/card\/peticoes\/monitoramento$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ petitionIds: ["petition"], targetBoardId: "target" });
  });
});
