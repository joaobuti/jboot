import { describe, expect, it } from "vitest";
import { CaseTypeDto, KanbanApiError } from "./kanban-api";
import { describeKanbanError } from "./card-documents";
import {
  buildCaseTypePayload,
  caseTypeToForm,
  describeTemplateError,
  describeTemplateWarning,
  EMPTY_CASE_TYPE_FORM,
  formatBytes,
  templateErrorDetails,
  TEMPLATE_MAX_BYTES,
  toggleCaseTypeTemplate,
  validateTemplateFile,
  variableRequirementChanges,
  versionStatusBadge,
} from "./document-templates";

const apiError = (status: number, body: Record<string, unknown>) => new KanbanApiError(status, JSON.stringify(body));

describe("document-templates (Sprint 5)", () => {
  it("pre-valida o arquivo: so .docx, nao vazio, ate 10 MB", () => {
    expect(validateTemplateFile({ name: "Modelo.DOCX", size: 100 })).toBeNull();
    expect(validateTemplateFile({ name: "modelo.docm", size: 100 })).toMatch(/\.docx/);
    expect(validateTemplateFile({ name: "modelo.pdf", size: 100 })).toMatch(/\.docx/);
    expect(validateTemplateFile({ name: "modelo.docx", size: 0 })).toMatch(/vazio/);
    expect(validateTemplateFile({ name: "modelo.docx", size: TEMPLATE_MAX_BYTES + 1 })).toMatch(/10 MB/);
  });

  it("selo da versao e tamanho legivel", () => {
    expect(versionStatusBadge("valid").label).toBe("Pronto para uso");
    expect(versionStatusBadge("invalid_variables").className).toBe("bg-warning-subtle text-warning");
    expect(versionStatusBadge(null).label).toBe("Sem arquivo");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });

  it("mensagens pt-BR dos codigos de modelo, com os itens do corpo", () => {
    expect(templateErrorDetails(apiError(422, { code: "template_raw_xml_forbidden", tags: ["x"] }))).toEqual({
      message: expect.stringMatching(/@/),
      items: ["{{@x}}"],
    });
    expect(
      templateErrorDetails(
        apiError(422, { code: "template_invalid", errors: [{ id: "unclosed_tag", tag: "{cliente.nome" }, { id: "x" }] })
      )?.items
    ).toEqual(["variável sem fechamento: {cliente.nome", "erro de sintaxe"]);
    expect(
      templateErrorDetails(apiError(422, { code: "template_variable_kind_mismatch", tags: [{ tag: "cliente.nome" }] }))?.items
    ).toEqual(["cliente.nome"]);
    expect(templateErrorDetails(apiError(422, { code: "template_archive_limits_exceeded", limit: "compression_ratio" }))?.message).toMatch(
      /100:1/
    );
    expect(templateErrorDetails(apiError(422, { code: "template_macro_forbidden" }))?.message).toMatch(/macro/);
    expect(templateErrorDetails(apiError(422, { code: "template_external_link_forbidden" }))?.message).toMatch(/vinculado/);
    expect(templateErrorDetails(apiError(422, { code: "outro" }))).toBeNull();
    expect(describeTemplateError(apiError(422, { code: "template_tag_invalid", tags: ["A | b"] }))).toMatch(/\{\{A \| b\}\}$/);
    // Integrado ao describeKanbanError usado pelas telas.
    expect(describeKanbanError(apiError(409, { code: "case_type_name_taken" }), "x")).toMatch(/tipo de caso ativo/);
    expect(describeTemplateWarning({ code: "possible_malformed_tag", detail: "{cliente.nome}" })).toMatch(/\{cliente\.nome\}/);
  });

  it("formulario do tipo de caso: primeiro vinculado vira padrao; desmarcar o padrao passa para o proximo", () => {
    let form = toggleCaseTypeTemplate(EMPTY_CASE_TYPE_FORM, "t1", true);
    expect([form.templateIds, form.defaultTemplateId]).toEqual([["t1"], "t1"]);
    form = toggleCaseTypeTemplate(form, "t2", true);
    expect(form.defaultTemplateId).toBe("t1");
    form = toggleCaseTypeTemplate(form, "t1", false);
    expect([form.templateIds, form.defaultTemplateId]).toEqual([["t2"], "t2"]);
    form = toggleCaseTypeTemplate(form, "t2", false);
    expect([form.templateIds, form.defaultTemplateId]).toEqual([[], null]);
  });

  it("payload do tipo de caso: apara, vazio vira null, padrao so se vinculado", () => {
    expect(
      buildCaseTypePayload({
        name: "  Tipo  ",
        description: " ",
        classificationCriteria: " criterio ",
        expectedEvidence: "",
        templateIds: ["t1"],
        defaultTemplateId: "t9",
      })
    ).toEqual({
      name: "Tipo",
      description: null,
      classificationCriteria: "criterio",
      expectedEvidence: null,
      templateIds: ["t1"],
      defaultTemplateId: null,
    });
    const dto: CaseTypeDto = {
      id: "c1",
      name: "Tipo",
      description: null,
      classificationCriteria: "c",
      expectedEvidence: null,
      active: true,
      defaultTemplateId: "t1",
      templates: [{ id: "t1", name: "M", active: true }],
      createdAt: "",
      updatedAt: "",
    };
    expect(caseTypeToForm(dto)).toMatchObject({ description: "", templateIds: ["t1"], defaultTemplateId: "t1" });
  });

  it("so envia as variaveis cuja marca mudou", () => {
    const variables = [
      { key: "cliente.nome", known: true, valueType: "text" as const, label: "Nome", required: true },
      { key: "cliente.cpf", known: true, valueType: "text" as const, label: "CPF", required: true },
    ];
    expect(variableRequirementChanges(variables, { "cliente.nome": true, "cliente.cpf": false })).toEqual([
      { key: "cliente.cpf", required: false },
    ]);
    expect(variableRequirementChanges(variables, {})).toEqual([]);
  });
});
