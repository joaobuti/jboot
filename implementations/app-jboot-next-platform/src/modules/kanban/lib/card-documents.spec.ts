import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECKLIST_INCOMPLETE_CODE, CONTENT_SIGNATURE_MISMATCH_CODE, KanbanApiError, kanbanApi } from "./kanban-api";
import {
  DOCUMENT_CAMERA_ACCEPT,
  DOCUMENT_FILE_ACCEPT,
  MAX_DOCUMENT_SIZE_BYTES,
  checklistIndicator,
  describeKanbanError,
  pendingDocumentNames,
  validateDocumentFile,
} from "./card-documents";

vi.mock("@/lib/module-auth-token", () => ({
  getApplicationAuthToken: vi.fn(() => "flow-token"),
}));

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const CHECKLIST_ERROR_BODY = {
  code: CHECKLIST_INCOMPLETE_CODE,
  message: "Card cannot enter this column until every required document is accepted",
  boardColumnId: "col-1",
  pendingDocumentTypes: [
    { id: "t1", name: "Procuração" },
    { id: "t2", name: "HISCON" },
  ],
};

describe("validateDocumentFile", () => {
  it("aceita os tipos e o limite dos anexos e recusa o resto", () => {
    expect(validateDocumentFile({ size: 10, type: "application/pdf" })).toBeNull();
    expect(validateDocumentFile({ size: 10, type: "image/jpeg" })).toBeNull();
    expect(validateDocumentFile({ size: MAX_DOCUMENT_SIZE_BYTES + 1, type: "application/pdf" })).toMatch(/25 MB/);
    expect(validateDocumentFile({ size: 10, type: "text/html" })).toMatch(/nao aceito/);
    expect(validateDocumentFile({ size: 0, type: "application/pdf" })).toMatch(/vazio/);
  });

  it("accept da camera e subconjunto do accept de arquivo", () => {
    for (const type of DOCUMENT_CAMERA_ACCEPT.split(",")) {
      expect(DOCUMENT_FILE_ACCEPT.split(",")).toContain(type);
    }
  });
});

describe("checklistIndicator", () => {
  it("omite o indicador quando o quadro nao tem obrigatorio e marca completo", () => {
    expect(checklistIndicator(undefined)).toBeNull();
    expect(checklistIndicator({ acceptedRequired: 0, totalRequired: 0 })).toBeNull();
    expect(checklistIndicator({ acceptedRequired: 3, totalRequired: 7 })).toEqual({ label: "3/7", complete: false });
    expect(checklistIndicator({ acceptedRequired: 7, totalRequired: 7 })).toEqual({ label: "7/7", complete: true });
  });
});

describe("erro estruturado checklist_incomplete", () => {
  it("move devolve KanbanApiError com os itens pendentes e mensagem legivel", async () => {
    mockFetch(422, CHECKLIST_ERROR_BODY);
    const error = await kanbanApi.cards
      .move("board-1", "card-1", { toBoardColumnId: "col-1", toPosition: 0 })
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(KanbanApiError);
    expect((error as KanbanApiError).status).toBe(422);
    expect(pendingDocumentNames(error)).toEqual(["Procuração", "HISCON"]);
    expect(describeKanbanError(error, "x")).toBe(
      "Checklist incompleto: o card so entra nesta coluna com todos os documentos obrigatorios aceitos. Pendentes: Procuração, HISCON."
    );
  });

  it("requisito de entrada nao cumprido lista o requisito e aponta onde enviar o HISCON (S1)", () => {
    const error = new KanbanApiError(
      422,
      JSON.stringify({ code: "column_requirements_unmet", message: "x", unmetRequirements: ["customer_hiscon"] }),
    );
    expect(describeKanbanError(error, "x")).toBe(
      "Esta coluna exige para entrar: HISCON do cliente. Envie o HISCON no painel Cliente do card (ou na ficha do cliente).",
    );
  });

  it("outros erros usam a mensagem estruturada do backend", () => {
    const error = new KanbanApiError(403, JSON.stringify({ code: "transition_not_allowed", message: "Transition not allowed" }));
    expect(describeKanbanError(error, "x")).toBe("Transition not allowed");
    expect(pendingDocumentNames(error)).toEqual([]);
    expect(describeKanbanError("boom", "fallback")).toBe("fallback");
  });

  it("PDF com senha (422 do upload da ficha) vira mensagem pt-BR com orientacao", () => {
    const error = new KanbanApiError(422, JSON.stringify({ code: "customer_document_password_protected", message: "PDF com senha nao e aceito." }));
    expect(describeKanbanError(error, "x")).toBe(
      "PDF com senha não é aceito. Remova a senha (ou salve uma cópia sem proteção) e envie novamente."
    );
  });

  it("content_signature_mismatch (415 do upload) vira mensagem pt-BR, sem depender do texto do backend", () => {
    const error = new KanbanApiError(
      415,
      JSON.stringify({ code: CONTENT_SIGNATURE_MISMATCH_CODE, message: "File content does not match the declared content type" })
    );
    expect(describeKanbanError(error, "x")).toBe(
      "O conteudo do arquivo nao corresponde ao tipo informado. Envie o arquivo original (imagem, PDF, Office, TXT, CSV ou ZIP)."
    );
    // Body nao-JSON continua caindo na mensagem bruta.
    expect(describeKanbanError(new KanbanApiError(415, "Unsupported"), "x")).toBe("Unsupported");
  });
});

describe("kanbanApi.cardDocuments", () => {
  it("envia documento como multipart com documentTypeId e file, sem Content-Type manual", async () => {
    const fetchMock = mockFetch(201, { id: "doc-1" });
    const file = new File(["%PDF"], "rg.pdf", { type: "application/pdf" });
    await kanbanApi.cardDocuments.upload("board-1", "card-1", "type-1", file);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/kanban\/boards\/board-1\/cards\/card-1\/documents$/);
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("documentTypeId")).toBe("type-1");
    expect((body.get("file") as File).name).toBe("rg.pdf");
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBeNull();
    expect(headers.get("Authorization")).toBe("Bearer flow-token");
  });

  it("erro de upload vira KanbanApiError estruturado (ex.: 415)", async () => {
    mockFetch(415, { code: "content_type_not_allowed", message: 'Content type "text/html" is not allowed' });
    const error = await kanbanApi.cardDocuments
      .upload("board-1", "card-1", "type-1", new File(["x"], "a.html", { type: "text/html" }))
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(KanbanApiError);
    expect((error as KanbanApiError).code).toBe("content_type_not_allowed");
  });

  it("revisao envia status e motivo no corpo", async () => {
    const fetchMock = mockFetch(201, { id: "doc-1", status: "rejeitado" });
    await kanbanApi.cardDocuments.review("board-1", "card-1", "doc-1", { status: "rejeitado", rejectionReason: "Ilegivel" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/documents\/doc-1\/review$/);
    expect(JSON.parse(String(init.body))).toEqual({ status: "rejeitado", rejectionReason: "Ilegivel" });
  });

  it("aplicar lista inicial usa POST sem corpo", async () => {
    const fetchMock = mockFetch(201, { created: [], skippedNames: [], data: [] });
    await kanbanApi.documentTypes.applyInitialList("board-1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/kanban\/boards\/board-1\/document-types\/apply-initial-list$/);
    expect(init.method).toBe("POST");
  });
});
