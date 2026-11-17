import { describe, expect, it } from "vitest";
import { KanbanApiError, LeadCaseDto, GeneratedDocumentDto } from "./kanban-api";
import {
  availableCaseTypes,
  approvedDocument,
  currentDocument,
  defaultTemplateId,
  describeAnalysisError,
  describeEditedWarning,
  describePdfError,
  missingVariablesFromError,
  pdfBadge,
  shouldShowAnalysisPanel,
  templatesForCase,
  validateAnalysisReason,
} from "./lead-analysis";
import { describeKanbanError } from "./card-documents";

function doc(id: string, status: GeneratedDocumentDto["status"]): GeneratedDocumentDto {
  return {
    id,
    caseId: "c",
    version: 1,
    origin: "generated",
    status,
    basedOnDocumentId: null,
    templateId: "t",
    templateName: "Modelo",
    templateVersionId: "v",
    templateVersion: 1,
    templateSha256: "a".repeat(64),
    catalogVersion: 1,
    sizeBytes: 10,
    createdByIdentityId: "u",
    createdByName: null,
    createdAt: "2026-10-12T00:00:00Z",
    approvedByIdentityId: null,
    approvedByName: null,
    approvedAt: null,
    pdf: null,
    missingOptional: [],
    variables: [],
  };
}

function leadCase(caseTypeId: string, documents: GeneratedDocumentDto[]): LeadCaseDto {
  return {
    id: `case-${caseTypeId}`,
    caseTypeId,
    caseTypeName: caseTypeId,
    caseTypeActive: true,
    source: "manual",
    decidedByIdentityId: "u",
    decidedByName: null,
    decidedAt: "2026-10-12T00:00:00Z",
    replacesCaseId: null,
    supersededAt: null,
    supersededByName: null,
    supersededReason: null,
    documents,
  };
}

const caseTypes = [
  {
    id: "a",
    name: "Tipo A",
    templates: [
      { id: "t2", name: "B modelo", isDefault: false, usable: true, unusableReason: null },
      { id: "t1", name: "A modelo", isDefault: true, usable: false, unusableReason: "template_version_not_usable" as const },
    ],
  },
  { id: "b", name: "Tipo B", templates: [] },
];

describe("lead-analysis (Sprint 6)", () => {
  it("painel de analise so com envio", () => {
    expect(shouldShowAnalysisPanel("rascunho", false)).toBe(false);
    expect(shouldShowAnalysisPanel("enviado", true)).toBe(true);
    expect(shouldShowAnalysisPanel("devolvido", true)).toBe(true);
    expect(shouldShowAnalysisPanel(null, true)).toBe(false);
  });

  it("documento vigente e aprovado do caso", () => {
    const item = leadCase("a", [doc("d3", "rascunho"), doc("d2", "aprovado"), doc("d1", "substituido")]);
    expect(currentDocument(item)?.id).toBe("d3");
    expect(approvedDocument(item)?.id).toBe("d2");
    expect(currentDocument(leadCase("a", [doc("d1", "substituido")]))).toBeNull();
  });

  it("modelos: padrao primeiro; pre-selecao so de modelo utilizavel", () => {
    const templates = templatesForCase(caseTypes, "a");
    expect(templates.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(defaultTemplateId(templates)).toBe("t2");
    expect(defaultTemplateId([])).toBeNull();
    expect(templatesForCase(caseTypes, "x")).toEqual([]);
  });

  it("tipos disponiveis nao repetem caso ativo", () => {
    expect(availableCaseTypes(caseTypes, [leadCase("a", [])]).map((t) => t.id)).toEqual(["b"]);
    expect(availableCaseTypes(caseTypes, [leadCase("a", [])], "a").map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("motivo da troca/remocao: 10 a 500 caracteres aparados", () => {
    expect(validateAnalysisReason("   curto   ")).toMatch(/mínimo/);
    expect(validateAnalysisReason("motivo valido")).toBeNull();
    expect(validateAnalysisReason("x".repeat(501))).toMatch(/máximo/);
  });

  it("PDF: falha aparece como PDF pendente; rascunho sem PDF", () => {
    expect(pdfBadge(null)).toBeNull();
    expect(pdfBadge({ status: "failed", attempts: 3, errorCode: "converter_unavailable", completedAt: null })?.label).toBe("PDF pendente");
    expect(pdfBadge({ status: "done", attempts: 1, errorCode: null, completedAt: "x" })?.label).toBe("PDF gerado");
    expect(pdfBadge({ status: "pending", attempts: 0, errorCode: null, completedAt: null })?.label).toBe("Gerando PDF");
    expect(describePdfError("converter_timeout")).toMatch(/tempo limite/);
    expect(describePdfError("codigo_novo")).toBe("codigo_novo");
  });

  it("422 de variavel obrigatoria lista os rotulos; mensagens pt-BR via describeKanbanError", () => {
    const error = new KanbanApiError(
      422,
      JSON.stringify({
        code: "document_required_variables_missing",
        message: "x",
        missingVariables: [{ key: "cliente.email", label: "E-mail" }, { key: "cliente.profissao" }],
      })
    );
    expect(missingVariablesFromError(error)).toEqual(["E-mail", "cliente.profissao"]);
    expect(describeAnalysisError(error)).toMatch(/E-mail, cliente.profissao/);
    expect(describeKanbanError(error, "f")).toMatch(/campos obrigatórios/);
    expect(describeKanbanError(new KanbanApiError(409, JSON.stringify({ code: "pdf_not_ready" })), "f")).toMatch(/PDF ainda não/);
    expect(missingVariablesFromError(new Error("x"))).toBeNull();
    expect(describeAnalysisError(new KanbanApiError(400, JSON.stringify({ code: "outro" })))).toBeNull();
  });

  it("avisos da versao editada", () => {
    expect(describeEditedWarning({ code: "template_tag_left", detail: "{{cliente.nome}}" })).toMatch(/cliente.nome/);
    expect(describeEditedWarning({ code: "fill_marker_left" })).toMatch(/PREENCHER/);
  });
});
