import { afterEach, describe, expect, it, vi } from "vitest";
import { InitialPetitionDocumentDto, InitialPetitionDto, InitialPetitionsRunDto, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { actionPetitionLinks, canSendCorrected, CLOSING_GAP_LABEL, documentStatusLabel, petitionCompletionText } from "./initial-petitions";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token"), getApplicationScopes: vi.fn(() => []) }));
afterEach(() => vi.unstubAllGlobals());

const draftDocument: InitialPetitionDocumentDto = {
  documentId: "d1", version: 1, origin: "routine_petition", status: "rascunho", approvedAt: null, approvedByName: null, pdfStatus: null, sizeBytes: 10,
};
const petition = (overrides: Partial<InitialPetitionDto> = {}): InitialPetitionDto => ({
  id: "p1", petitionKey: "pan", position: 1, court: "jec", bank: "PAN", fileName: "Inicial_JEC_PAN_Sergio.docx", actionIds: ["a1"],
  protocolNumber: null, protocoledAt: null, monitoringBoardId: null, monitoringCardId: null, document: draftDocument,
  ...overrides,
});

const run = (overrides: Partial<InitialPetitionsRunDto> = {}): InitialPetitionsRunDto => ({
  id: "r1", generator: "flow", status: "concluida", failureReason: null, triageSource: "analysis", actionAnalysisId: "an1",
  petitionCount: 1, report: { actionsWithoutPetition: [{ actionId: "a2", reason: "litispendencia" }] }, closingGaps: [], completed: true,
  createdAt: "2026-10-28T10:00:00Z", petitions: [petition()], ...overrides,
});

describe("fecho e versao corrigida (S7 e S8)", () => {
  it("versao corrigida so sobre a versao atual e sem protocolo", () => {
    expect(canSendCorrected(petition())).toBe(true);
    expect(canSendCorrected(petition({ document: { ...draftDocument, status: "aprovado" } }))).toBe(true);
    expect(canSendCorrected(petition({ document: { ...draftDocument, status: "substituido" } }))).toBe(false);
    expect(canSendCorrected(petition({ protocolNumber: "1", protocoledAt: "2026-10-30T10:00:00Z" }))).toBe(false);
    expect(canSendCorrected(petition({ document: null }))).toBe(false);
  });

  it("explica onde resolver cada pendencia do fecho", () => {
    expect(CLOSING_GAP_LABEL.no_assignee_lawyer_for_uf).toContain("Usuários → Advogado");
    expect(CLOSING_GAP_LABEL.office_without_city).toContain("Escritórios");
  });

  it("envia o .docx corrigido como multipart para a rota da versao corrigida", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: null, documentId: "d2", warnings: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["x"], "Inicial.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    await kanbanApi.initialPetitions.uploadCorrected("b1", "c1", "d1", file);
    const [url, init] = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0];
    expect(url).toMatch(/\/kanban\/boards\/b1\/cards\/c1\/initial-petitions\/documents\/d1\/corrected-version$/);
    expect([init.method, init.body instanceof FormData]).toEqual(["POST", true]);
  });
});

describe("peticoes iniciais (S5)", () => {
  it("liga cada acao a peticao ou ao motivo, so para a analise usada", () => {
    const links = actionPetitionLinks(run(), "an1");
    expect(links.get("a1")).toEqual({ fileName: "Inicial_JEC_PAN_Sergio.docx" });
    expect(links.get("a2")).toEqual({ reason: "litispendencia" });
    expect(actionPetitionLinks(run(), "outra-analise").size).toBe(0);
    expect(actionPetitionLinks(run({ status: "nao_concluida" }), "an1").size).toBe(0);
    expect(actionPetitionLinks(null, "an1").size).toBe(0);
  });

  it("descreve o movimento do card e a situacao do documento", () => {
    expect(petitionCompletionText(run()).tone).toBe("success");
    expect(petitionCompletionText(run({ status: "nao_concluida", completed: false })).tone).toBe("warning");
    expect(petitionCompletionText(run({ completed: false })).text).toContain("não conta como conclusão");
    expect(documentStatusLabel(petition()).text).toBe("Pendente de aprovação");
    expect(documentStatusLabel(petition({ document: { ...draftDocument, status: "aprovado" } })).text).toBe("Aprovada");
  });

  it("chama leitura, download e aprovacao do card", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ run: null, url: "u" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await kanbanApi.initialPetitions.latest("b", "c");
    await kanbanApi.initialPetitions.download("b", "c", "d");
    await kanbanApi.initialPetitions.approve("b", "c", "d");
    const calls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => `${init.method ?? "GET"} ${url.replace(/^.*\/kanban/, "/kanban")}`);
    expect(calls).toEqual([
      "GET /kanban/boards/b/cards/c/initial-petitions",
      "GET /kanban/boards/b/cards/c/initial-petitions/documents/d/download",
      "POST /kanban/boards/b/cards/c/initial-petitions/documents/d/approve",
    ]);
  });
});
