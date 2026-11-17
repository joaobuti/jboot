import { afterEach, describe, expect, it, vi } from "vitest";
import { kanbanApi } from "@/modules/kanban/lib/kanban-api";
import {
  documentBadge,
  localFileError,
  CUSTOMER_DOCUMENT_CATALOG,
  EXTRACT_ALTERNATIVES,
  requiredCustomerDocumentTypes,
  uploadStagedCustomerDocuments,
} from "./CustomerDocumentsStep";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token") }));

afterEach(() => vi.unstubAllGlobals());

function recorder(failPath?: string) {
  const fetchMock = vi.fn(async (url: string) =>
    failPath && new URL(url).pathname.endsWith(failPath)
      ? new Response(JSON.stringify({ code: "content_signature_mismatch", message: "x" }), { status: 415 })
      : new Response(JSON.stringify({ items: [] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return () =>
    (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => ({
      path: new URL(String(url)).pathname,
      method: init?.method ?? "GET",
      multipart: init?.body instanceof FormData,
    }));
}

const customerId = "11111111-1111-4111-8111-111111111111";
const pdf = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" });

describe("documentos da ficha do cliente", () => {
  it("selo: Recusado com motivo depois do parecer, Aprovado pela IA, ou Enviado antes da leitura", () => {
    const current = { id: "d1", version: 2, fileName: "rg.pdf", contentType: "application/pdf", sizeBytes: 1, uploadedByIdentityId: "u", uploadedAt: "" };
    const review = { outcome: "recusado" as const, status: "ilegivel" as const, note: "Foto cortada", answeredAt: "", confirmed: false };
    expect(documentBadge(current, review)).toEqual({ color: "danger", text: "Recusado · ilegível", title: "Foto cortada" });
    expect(documentBadge(current, { ...review, outcome: "aprovado", status: "ok", note: "" }).text).toBe("Aprovado pela IA");
    expect(documentBadge(current, null)).toEqual({ color: "info", text: "Enviado · v2", title: "rg.pdf" });
    expect(documentBadge(current, { ...review, outcome: "nao_conferido", status: null, note: "" }).text).toBe("Não conferido pela IA");
  });

  it("exige um a um identidade, CPF, comprovante e HISCRED; HISCON ou Promobank valem como um dos dois", () => {
    const own = { residenceProofThirdParty: false, cpfOnIdentity: false };
    const thirdParty = { residenceProofThirdParty: true, cpfOnIdentity: false };
    expect(requiredCustomerDocumentTypes(own)).toEqual(["identidade", "cpf", "comprovante_residencia", "hiscred"]);
    expect(requiredCustomerDocumentTypes({ ...own, cpfOnIdentity: true })).not.toContain("cpf");
    expect(CUSTOMER_DOCUMENT_CATALOG.find((item) => item.type === "extrato_beneficio")?.label).toBe("HISCON — Histórico de Consignado");
    expect(CUSTOMER_DOCUMENT_CATALOG.find((item) => item.type === "promobank")?.label).toBe("Promobank — Extrato de Empréstimos");
    expect(CUSTOMER_DOCUMENT_CATALOG.find((item) => item.type === "hiscred")?.label).toBe("HISCRED — Histórico de Crédito");
    expect(EXTRACT_ALTERNATIVES).toEqual(["extrato_beneficio", "promobank"]);
    expect(requiredCustomerDocumentTypes(thirdParty)).toHaveLength(5);
    expect(requiredCustomerDocumentTypes(thirdParty)).toContain("declaracao_residencia_terceiro");
  });

  it("recusa localmente formato fora da ficha", () => {
    expect(localFileError(new File(["x"], "a.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toMatch(/PDF/);
    expect(localFileError(pdf("rg.pdf"))).toBeNull();
  });

  it("usa as rotas do BFF para listar, enviar, remover, marcar terceiro e baixar", async () => {
    const calls = recorder();
    await kanbanApi.customerDocuments.list(customerId);
    await kanbanApi.customerDocuments.upload(customerId, "cpf", pdf("cpf.pdf"));
    await kanbanApi.customerDocuments.remove(customerId, "cpf");
    await kanbanApi.customerDocuments.updateProfile(customerId, { residenceProofThirdParty: true });
    await kanbanApi.customerDocuments.downloadUrl(customerId, "22222222-2222-4222-8222-222222222222");
    const base = `/kanban/customers/${customerId}/documents`;
    expect(calls()).toEqual([
      { path: base, method: "GET", multipart: false },
      { path: `${base}/cpf`, method: "POST", multipart: true },
      { path: `${base}/cpf`, method: "DELETE", multipart: false },
      { path: `${base}/profile`, method: "PATCH", multipart: false },
      { path: `${base}/versions/22222222-2222-4222-8222-222222222222/download`, method: "GET", multipart: false },
    ]);
  });

  it("envia a fila do cadastro novo e devolve so o que falhou", async () => {
    const calls = recorder("/extrato_beneficio");
    const failures = await uploadStagedCustomerDocuments(customerId, {
      residenceProofThirdParty: true,
      cpfOnIdentity: false,
      files: { identidade: pdf("rg.pdf"), extrato_beneficio: pdf("extrato.pdf"), hiscred: pdf("hiscred.pdf") },
    });
    expect(calls().map((call) => `${call.method} ${call.path.split("/documents")[1]}`)).toEqual([
      "PATCH /profile",
      "POST /identidade",
      "POST /extrato_beneficio",
      "POST /hiscred",
    ]);
    expect(failures.map((failure) => failure.type)).toEqual(["extrato_beneficio"]);
  });

  it("CPF dispensado: grava a marcacao e nao envia o arquivo de CPF que ficou na fila", async () => {
    const calls = recorder();
    await uploadStagedCustomerDocuments(customerId, {
      residenceProofThirdParty: false,
      cpfOnIdentity: true,
      files: { identidade: pdf("cnh.pdf"), cpf: pdf("cpf.pdf") },
    });
    expect(calls().map((call) => `${call.method} ${call.path.split("/documents")[1]}`)).toEqual(["PATCH /profile", "POST /identidade"]);
  });

  it("Promobank na fila do cadastro novo e enviado como os demais (sem HISCON ou junto dele)", async () => {
    const calls = recorder();
    await uploadStagedCustomerDocuments(customerId, {
      residenceProofThirdParty: false,
      cpfOnIdentity: false,
      files: { identidade: pdf("rg.pdf"), promobank: pdf("promobank.pdf"), extrato_beneficio: pdf("hiscon.pdf") },
    });
    // Sem marcacao de perfil ligada, o perfil nao e gravado.
    expect(calls().map((call) => `${call.method} ${call.path.split("/documents")[1]}`)).toEqual([
      "POST /identidade",
      "POST /extrato_beneficio",
      "POST /promobank",
    ]);
  });
});
