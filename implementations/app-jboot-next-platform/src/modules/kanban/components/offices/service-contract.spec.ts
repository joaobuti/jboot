import { afterEach, describe, expect, it, vi } from "vitest";
import { KanbanApiError, kanbanApi } from "@/modules/kanban/lib/kanban-api";
import { describeKitWarning, describeServiceContractError } from "./service-contract";

vi.mock("@/lib/module-auth-token", () => ({ getApplicationAuthToken: vi.fn(() => "flow-token") }));
afterEach(() => vi.unstubAllGlobals());

const apiError = (status: number, body: Record<string, unknown>) => new KanbanApiError(status, JSON.stringify(body));

describe("contrato de servicos do escritorio", () => {
  it("explica os erros do .docx apontando o trecho", () => {
    expect(describeServiceContractError(apiError(422, { code: "service_contract_block_unbalanced", tag: "[[SE_JEC]]" }))).toMatch(
      /\[\[SE_JEC\]\].*\[\[FIM_SE_X\]\]/,
    );
    expect(
      describeServiceContractError(apiError(422, { code: "service_contract_block_nested", tag: "[[SE_JEF]]", openBlock: "[[SE_JEC]]" })),
    ).toMatch(/\[\[SE_JEF\]\] abre dentro de \[\[SE_JEC\]\]/);
    expect(describeServiceContractError(apiError(422, { code: "service_contract_loan_row_outside_table", tag: "[[BANCO_1]]" }))).toMatch(
      /\[\[BANCO_1\]\] está fora de uma tabela/,
    );
    expect(describeServiceContractError(apiError(422, { code: "template_macro_forbidden" }))).toMatch(/macro/);
    expect(describeServiceContractError(apiError(404, { code: "office_not_found" }))).toBeNull();
  });

  it("descreve os avisos da analise", () => {
    expect(describeKitWarning({ code: "residence_declaration_removed" })).toMatch(/sai do kit/);
    expect(describeKitWarning({ code: "waiver_text_missing" })).toMatch(/JEF/);
    expect(describeKitWarning({ code: "outro", detail: "texto do servidor" })).toBe("texto do servidor");
  });

  it("usa as rotas do BFF", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await kanbanApi.offices.serviceContract("o1");
    await kanbanApi.offices.serviceContractVersion("o1", 3);
    await kanbanApi.offices.uploadServiceContract("o1", new File(["x"], "KIT.docx"));
    await kanbanApi.offices.serviceContractDownload("o1", 4);
    const calls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).map(([url, init]) => [
      init?.method ?? "GET",
      new URL(url).pathname,
      init?.body instanceof FormData ? (init.body.get("file") as File).name : null,
    ]);
    expect(calls).toEqual([
      ["GET", "/kanban/offices/o1/service-contract", null],
      ["GET", "/kanban/offices/o1/service-contract/versions/3", null],
      ["POST", "/kanban/offices/o1/service-contract/versions", "KIT.docx"],
      ["GET", "/kanban/offices/o1/service-contract/versions/4/download", null],
    ]);
  });
});
